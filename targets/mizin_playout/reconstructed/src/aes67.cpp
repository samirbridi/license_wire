#ifndef NOMINMAX
#define NOMINMAX
#endif
#include "aes67.hpp"
#include <QDateTime>
#include <QHostAddress>
#include <QNetworkInterface>
#include <QRandomGenerator>
#include <QStringList>
#include <algorithm>
#include <climits>
#include <cmath>
#include <deque>
#include <map>
#ifdef Q_OS_WIN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#endif

namespace {
constexpr int EventPort=319,GeneralPort=320;
constexpr const char* PtpGroup="224.0.1.129";
enum : quint8 {Sync=0x0,DelayReq=0x1,FollowUp=0x8,DelayResp=0x9,Announce=0xB};
constexpr qint64 Second=1000000000LL;
void put16(QByteArray& b,int at,quint16 v){b[at]=char(v>>8);b[at+1]=char(v);}
void put32(QByteArray& b,int at,quint32 v){for(int i=0;i<4;++i)b[at+i]=char(v>>(24-8*i));}
void put64(QByteArray& b,int at,qint64 v){for(int i=0;i<8;++i)b[at+i]=char(quint64(v)>>(56-8*i));}
quint16 get16(const char* p){return quint16((quint8(p[0])<<8)|quint8(p[1]));}
quint32 get32(const char* p){return (quint32(quint8(p[0]))<<24)|(quint32(quint8(p[1]))<<16)|(quint32(quint8(p[2]))<<8)|quint8(p[3]);}
qint64 get64(const char* p){quint64 v=0;for(int i=0;i<8;++i)v=(v<<8)|quint8(p[i]);return qint64(v);}
void putTimestamp(QByteArray& b,int at,qint64 ns){const qint64 s=ns/Second,n=ns%Second;for(int i=0;i<6;++i)b[at+i]=char(quint64(s)>>(40-8*i));put32(b,at+6,quint32(n));}
qint64 getTimestamp(const char* p){quint64 s=0;for(int i=0;i<6;++i)s=(s<<8)|quint8(p[i]);return qint64(s)*Second+get32(p+6);}
// PTPv2 dataset used for the best master clock comparison (smaller wins, field by field).
struct Dataset {quint8 priority1=255,clockClass=255,accuracy=0xFE;quint16 variance=0xFFFF;quint8 priority2=255;QByteArray identity;
    bool better(const Dataset& o)const{if(priority1!=o.priority1)return priority1<o.priority1;if(clockClass!=o.clockClass)return clockClass<o.clockClass;if(accuracy!=o.accuracy)return accuracy<o.accuracy;
        if(variance!=o.variance)return variance<o.variance;if(priority2!=o.priority2)return priority2<o.priority2;return identity<o.identity;}};
QByteArray identityFor(const QString& ip){
    for(const auto& nic:QNetworkInterface::allInterfaces())for(const auto& entry:nic.addressEntries())if(entry.ip().toString()==ip){
        const QStringList parts=nic.hardwareAddress().split(':');if(parts.size()==6){QByteArray id(8,0);bool ok=true;for(int i=0,j=0;i<8;++i){if(i==3){id[i]=char(0xFF);continue;}if(i==4){id[i]=char(0xFE);continue;}id[i]=char(parts[j++].toInt(&ok,16));}if(ok)return id;}}
    QByteArray id(8,0);for(int i=0;i<8;++i)id[i]=char(QRandomGenerator::system()->bounded(256));id[3]=char(0xFF);id[4]=char(0xFE);return id;
}
}

#ifdef Q_OS_WIN
struct PtpClock::Impl {
    SOCKET event=INVALID_SOCKET,general=INVALID_SOCKET;
    std::thread thread;std::atomic<bool> stop{false};
    QByteArray identity;int domain=0;Mode mode=Mode::Auto;in_addr iface{};sockaddr_in group{};
    mutable std::mutex mutex;
    // Own time base (used as grandmaster or before locking): TAI = ownEpoch + (mono - ownMono).
    qint64 ownEpoch=0,ownMono=0;
    // Followed master: masterTime(local) = local + refOffset + rate*(local - refLocal).
    bool haveModel=false,master=false,locked=false;qint64 refLocal=0,refOffset=0,lastSyncMono=-1,lastT2=0;double rate=0,residual=0;
    std::deque<std::pair<qint64,qint64>> offsets,history,reverses;qint64 pathDelay=0,syncs=0,steps=0;
    struct Foreign {Dataset data;QByteArray port;qint64 seen=0;};std::map<QByteArray,Foreign> foreign;QByteArray followed;Dataset followedData;
    struct Pending {quint16 seq=0;qint64 t2=0,correction=0;bool valid=false;} pendingSync;
    quint16 delaySeq=0,syncSeq=0,announceSeq=0;qint64 delaySent=-1,nextDelay=0,nextSync=0,nextAnnounce=0;quint16 lastDelayReqSeq=0;
    QString error;
    Dataset ownData()const{Dataset d;d.priority1=250;d.clockClass=248;d.accuracy=0xFE;d.variance=0xFFFF;d.priority2=250;d.identity=identity;return d;}
    qint64 ownNow(qint64 mono)const{return ownEpoch+(mono-ownMono);}
    qint64 timeAt(qint64 mono)const{return haveModel&&!master?mono+refOffset+qint64(rate*double(mono-refLocal)):ownNow(mono);}
    QByteArray header(quint8 type,int length,quint16 seq,quint8 control,qint8 interval,quint8 flags0=0,quint8 flags1=0,qint64 correction=0){
        QByteArray b(length,0);b[0]=char(type);b[1]=2;put16(b,2,quint16(length));b[4]=char(domain);b[6]=char(flags0);b[7]=char(flags1);put64(b,8,correction<<16);
        b.replace(20,8,identity);put16(b,28,1);put16(b,30,seq);b[32]=char(control);b[33]=char(interval);return b;
    }
    void send(SOCKET s,int port,const QByteArray& b){sockaddr_in to=group;to.sin_port=htons(quint16(port));sendto(s,b.constData(),b.size(),0,reinterpret_cast<sockaddr*>(&to),sizeof to);}
    bool open(SOCKET& s,int port){
        s=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);if(s==INVALID_SOCKET)return false;BOOL yes=TRUE;setsockopt(s,SOL_SOCKET,SO_REUSEADDR,reinterpret_cast<const char*>(&yes),sizeof yes);
        sockaddr_in a{};a.sin_family=AF_INET;a.sin_port=htons(quint16(port));a.sin_addr.s_addr=INADDR_ANY;if(bind(s,reinterpret_cast<sockaddr*>(&a),sizeof a)!=0)return false;
        ip_mreq m{};m.imr_multiaddr=group.sin_addr;m.imr_interface=iface;if(setsockopt(s,IPPROTO_IP,IP_ADD_MEMBERSHIP,reinterpret_cast<const char*>(&m),sizeof m)!=0)return false;
        setsockopt(s,IPPROTO_IP,IP_MULTICAST_IF,reinterpret_cast<const char*>(&iface),sizeof iface);DWORD ttl=1;setsockopt(s,IPPROTO_IP,IP_MULTICAST_TTL,reinterpret_cast<const char*>(&ttl),sizeof ttl);
        u_long nonblocking=1;ioctlsocket(s,FIONBIO,&nonblocking);return true;
    }
    void becomeMaster(qint64 mono){if(master)return;const qint64 now=timeAt(mono);ownEpoch=now;ownMono=mono;master=true;locked=true;haveModel=false;followed.clear();offsets.clear();nextSync=nextAnnounce=mono;}
    void becomeSlave(const QByteArray& port,const Dataset& data,qint64 mono){
        if(!master&&followed==port)return;if(master){ownEpoch=ownNow(mono);ownMono=mono;}master=false;locked=false;haveModel=false;followed=port;followedData=data;offsets.clear();reverses.clear();pathDelay=0;pendingSync={};nextDelay=mono;
    }
    void choose(qint64 mono){
        for(auto it=foreign.begin();it!=foreign.end();)if(mono-it->second.seen>4*Second)it=foreign.erase(it);else ++it;
        const Foreign* best=nullptr;for(const auto& [key,f]:foreign)if(!best||f.data.better(best->data))best=&f;
        const bool foreignWins=best&&mode!=Mode::MasterOnly&&(mode==Mode::SlaveOnly||best->data.better(ownData()));
        if(foreignWins)becomeSlave(best->port,best->data,mono);
        else if(mode!=Mode::SlaveOnly&&(master||!best)&&mono-startedMono>3*Second)becomeMaster(mono);
        else if(mode==Mode::MasterOnly)becomeMaster(mono);
        if(!master&&lastSyncMono>=0&&mono-lastSyncMono>2*Second)locked=false;
    }
    qint64 startedMono=0;
    void measured(qint64 t1,qint64 t2){
        ++syncs;lastSyncMono=t2;offsets.emplace_back(t2,t1-t2);while(offsets.size()>8)offsets.pop_front();
        // Lucky-packet filter in both directions: t1-t2 = offset - delay(master->us), t4-t3 = offset + delay(us->master).
        // The least delayed recent packet of each direction (after rate compensation) gives offset = (max fwd + min rev) / 2.
        qint64 forward=LLONG_MIN,reverse=LLONG_MAX;for(const auto& [local,value]:offsets)forward=std::max(forward,value+qint64(rate*double(t2-local)));
        for(const auto& [local,value]:reverses)reverse=std::min(reverse,value+qint64(rate*double(t2-local)));
        const qint64 estimate=reverses.empty()?forward:(forward+reverse)/2;pathDelay=reverses.empty()?0:std::max<qint64>(0,(reverse-forward)/2);
        if(!haveModel){refLocal=t2;refOffset=estimate;haveModel=true;++steps;history.clear();history.emplace_back(t2,estimate);return;}
        const qint64 predicted=refOffset+qint64(rate*double(t2-refLocal)),error=estimate-predicted;residual=double(error);
        if(std::llabs(error)>2000000){refLocal=t2;refOffset=estimate;rate=0;offsets.clear();reverses.clear();history.clear();++steps;locked=false;return;}
        // Frequency: least-squares slope of the filtered offset over the last ~16 s (software timestamps are noisy,
        // a long baseline keeps the rate error to a few ppm). Phase: a quarter of the error per Sync.
        history.emplace_back(t2,estimate);while(history.size()>128)history.pop_front();
        if(history.back().first-history.front().first>2*Second){
            double sx=0,sy=0,sxx=0,sxy=0;const double x0=double(history.front().first),y0=double(history.front().second),n=double(history.size());
            for(const auto& [x,y]:history){const double dx=double(x)-x0,dy=double(y)-y0;sx+=dx;sy+=dy;sxx+=dx*dx;sxy+=dx*dy;}
            const double den=n*sxx-sx*sx;if(den>0)rate=std::clamp((n*sxy-sx*sy)/den,-500e-6,500e-6);
        }
        refOffset=predicted+error/4;refLocal=t2;
        if(syncs>=8&&std::llabs(error)<500000)locked=true;
    }
    void handle(const char* p,int n,qint64 mono,bool eventSocket){
        if(n<34||(quint8(p[1])&0x0F)!=2||quint8(p[4])!=domain)return;const quint8 type=quint8(p[0])&0x0F;const QByteArray port(p+20,10);if(port.left(8)==identity)return;
        const quint16 seq=get16(p+30);const qint64 correction=get64(p+8)>>16;std::lock_guard lock(mutex);
        if(type==Announce&&n>=64){Foreign f;f.port=port;f.seen=mono;f.data.priority1=quint8(p[47]);f.data.clockClass=quint8(p[48]);f.data.accuracy=quint8(p[49]);f.data.variance=get16(p+50);f.data.priority2=quint8(p[52]);f.data.identity=QByteArray(p+53,8);foreign[port]=f;
            if(port==followed)followedData=f.data;return;}
        if(master){
            if(type==DelayReq&&eventSocket){QByteArray r=header(DelayResp,54,seq,3,0,0,0,correction);putTimestamp(r,34,ownNow(mono));r.replace(44,10,port);send(general,GeneralPort,r);}
            return;
        }
        if(port!=followed)return;
        if(type==Sync&&n>=44){if(quint8(p[6])&0x02)pendingSync={seq,mono,correction,true};else measured(getTimestamp(p+34)+correction,mono);}
        else if(type==FollowUp&&n>=44&&pendingSync.valid&&pendingSync.seq==seq){pendingSync.valid=false;measured(getTimestamp(p+34)+pendingSync.correction+correction,pendingSync.t2);}
        else if(type==DelayResp&&n>=54&&QByteArray(p+44,8)==identity&&seq==lastDelayReqSeq&&delaySent>=0&&!offsets.empty()){
            const qint64 t4=getTimestamp(p+34)-correction;reverses.emplace_back(delaySent,t4-delaySent);while(reverses.size()>8)reverses.pop_front();delaySent=-1;
        }
    }
    void timers(qint64 mono){
        std::lock_guard lock(mutex);choose(mono);
        if(master){
            if(mono>=nextAnnounce){nextAnnounce=mono+Second;QByteArray a=header(Announce,64,announceSeq++,5,0,0,0x08|0x04);putTimestamp(a,34,ownNow(mono));put16(a,44,37);const auto d=ownData();
                a[47]=char(d.priority1);a[48]=char(d.clockClass);a[49]=char(d.accuracy);put16(a,50,d.variance);a[52]=char(d.priority2);a.replace(53,8,identity);put16(a,61,0);a[63]=char(0xA0);send(general,GeneralPort,a);}
            if(mono>=nextSync){nextSync=mono+Second/8;const quint16 seq=syncSeq++;QByteArray s=header(Sync,44,seq,0,-3,0x02,0x08);const qint64 t1=ownNow(PtpClock::monotonicNs());send(event,EventPort,s);
                QByteArray f=header(FollowUp,44,seq,2,-3,0,0x08);putTimestamp(f,34,t1);send(general,GeneralPort,f);}
        }else if(!followed.isEmpty()&&haveModel&&mono>=nextDelay){nextDelay=mono+Second;lastDelayReqSeq=delaySeq++;QByteArray r=header(DelayReq,44,lastDelayReqSeq,1,0x7F);delaySent=PtpClock::monotonicNs();send(event,EventPort,r);}
    }
    void run(){
        char buffer[1500];
        while(!stop){
            fd_set set;FD_ZERO(&set);FD_SET(event,&set);FD_SET(general,&set);timeval timeout{0,5000};
            if(select(0,&set,nullptr,nullptr,&timeout)>0)for(SOCKET s:{event,general})if(FD_ISSET(s,&set))for(;;){sockaddr_in from{};int length=sizeof from;const int n=recvfrom(s,buffer,sizeof buffer,0,reinterpret_cast<sockaddr*>(&from),&length);if(n<=0)break;handle(buffer,n,PtpClock::monotonicNs(),s==event);}
            timers(PtpClock::monotonicNs());
        }
    }
};
#else
struct PtpClock::Impl {QString error;};
#endif

PtpClock::PtpClock()=default;
PtpClock::~PtpClock(){stop();}
qint64 PtpClock::monotonicNs(){
#ifdef Q_OS_WIN
    static const qint64 frequency=[]{LARGE_INTEGER f;QueryPerformanceFrequency(&f);return qint64(f.QuadPart);}();LARGE_INTEGER c;QueryPerformanceCounter(&c);
    return qint64(c.QuadPart/frequency)*Second+qint64(c.QuadPart%frequency)*Second/frequency;
#else
    return 0;
#endif
}
QString PtpClock::identityText(const QByteArray& identity){QStringList parts;for(char c:identity)parts<<QString("%1").arg(quint8(c),2,16,QChar('0')).toUpper();return parts.join('-');}
bool PtpClock::start(const QString& interfaceIp,int domain,Mode mode,QString* error){
    stop();
#ifdef Q_OS_WIN
    WSADATA wsa;WSAStartup(MAKEWORD(2,2),&wsa);d_=std::make_unique<Impl>();auto& d=*d_;
    d.identity=identity_.size()==8?identity_:identityFor(interfaceIp);d.domain=std::clamp(domain,0,127);d.mode=mode;
    d.iface.s_addr=interfaceIp.isEmpty()?INADDR_ANY:inet_addr(interfaceIp.toLatin1().constData());d.group.sin_family=AF_INET;inet_pton(AF_INET,PtpGroup,&d.group.sin_addr);
    const qint64 mono=monotonicNs();d.ownMono=mono;d.ownEpoch=QDateTime::currentMSecsSinceEpoch()*1000000LL+37*Second;d.startedMono=mono;
    if(!d.open(d.event,EventPort)||!d.open(d.general,GeneralPort)){const QString message=QString("PTP ports 319/320 unavailable (error %1)").arg(WSAGetLastError());stop();if(error)*error=message;return false;}
    if(mode==Mode::MasterOnly)d.becomeMaster(mono);
    d.thread=std::thread([this]{
        HANDLE thread=GetCurrentThread();SetThreadPriority(thread,THREAD_PRIORITY_TIME_CRITICAL);d_->run();});
    return true;
#else
    if(error)*error="AES67 is only available on Windows in this build";return false;
#endif
}
void PtpClock::stop(){
#ifdef Q_OS_WIN
    if(!d_)return;d_->stop=true;if(d_->thread.joinable())d_->thread.join();
    for(SOCKET s:{d_->event,d_->general})if(s!=INVALID_SOCKET)closesocket(s);d_.reset();WSACleanup();
#else
    d_.reset();
#endif
}
qint64 PtpClock::nowNs()const{
#ifdef Q_OS_WIN
    if(!d_)return QDateTime::currentMSecsSinceEpoch()*1000000LL+37*Second;const qint64 mono=monotonicNs();std::lock_guard lock(d_->mutex);return d_->timeAt(mono);
#else
    return QDateTime::currentMSecsSinceEpoch()*1000000LL+37*Second;
#endif
}
PtpClock::Status PtpClock::status()const{
    Status s;if(!d_)return s;
#ifdef Q_OS_WIN
    std::lock_guard lock(d_->mutex);s.running=true;s.master=d_->master;s.locked=d_->locked;s.domain=d_->domain;s.offsetUs=d_->residual/1000.0;s.pathDelayUs=d_->pathDelay/1000.0;s.rateppm=d_->rate*1e6;s.syncs=d_->syncs;s.steps=d_->steps;
    s.grandmaster=identityText(d_->master?d_->identity:d_->followedData.identity);
#endif
    return s;
}
QByteArray PtpClock::grandmasterIdentity()const{
#ifdef Q_OS_WIN
    if(!d_)return identity_;std::lock_guard lock(d_->mutex);return d_->master||d_->followedData.identity.size()!=8?d_->identity:d_->followedData.identity;
#else
    return identity_;
#endif
}

Aes67Options Aes67Options::fromJson(const QJsonObject& o,const QString& interfaceIp){
    Aes67Options a;a.interfaceIp=interfaceIp;a.name=o["name"].toString("Mizin Playout").trimmed().left(60);if(a.name.isEmpty())a.name="Mizin Playout";
    a.multicast=o["multicast"].toString().trimmed();a.channels=std::clamp(o["channels"].toInt(8),1,64);a.ttl=std::clamp(o["ttl"].toInt(32),1,255);a.latencyMs=std::clamp(o["latencyMs"].toInt(2),1,20);a.domain=std::clamp(o["domain"].toInt(0),0,127);
    const QString mode=o["ptp"].toString("auto");a.ptpMode=mode=="slave"?PtpClock::Mode::SlaveOnly:mode=="master"?PtpClock::Mode::MasterOnly:PtpClock::Mode::Auto;return a;
}
QString aes67DefaultMulticast(const QString& interfaceIp,int stream){
    const QStringList octets=interfaceIp.split('.');const int last=octets.size()==4?octets[3].toInt():1;return QString("239.69.%1.%2").arg(last).arg(stream+1);
}
QByteArray aes67Sdp(const QString& name,const QString& sourceIp,const QString& multicast,int ttl,int channels,int domain,quint32 session,quint32 version,const QByteArray& grandmaster){
    const QStringList lines{"v=0",QString("o=- %1 %2 IN IP4 %3").arg(session).arg(version).arg(sourceIp),"s="+name,QString("c=IN IP4 %1/%2").arg(multicast).arg(ttl),"t=0 0",
        QString("a=clock-domain:PTPv2 %1").arg(domain),"m=audio 5004 RTP/AVP 96",QString("i=%1 channels").arg(channels),QString("a=rtpmap:96 L24/48000/%1").arg(channels),"a=sync-time:0","a=framecount:48","a=ptime:1",
        "a=mediaclk:direct=0",QString("a=ts-refclk:ptp=IEEE1588-2008:%1:%2").arg(PtpClock::identityText(grandmaster)).arg(domain),"a=recvonly"};
    return (lines.join("\r\n")+"\r\n").toUtf8();
}
QByteArray sapPacket(bool deletion,quint16 hash,const QString& sourceIp,const QByteArray& sdp){
    QByteArray b(8,0);b[0]=char(0x20|(deletion?0x04:0));put16(b,2,hash);put32(b,4,QHostAddress(sourceIp).toIPv4Address());b+=QByteArray("application/sdp",15)+'\0';return b+sdp;
}
