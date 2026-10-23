#include "aes67.hpp"
#include "local_audio.hpp"
#include <QApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkDatagram>
#include <QNetworkInterface>
#include <QThread>
#include <QUdpSocket>
#include <climits>
#include <cstdlib>
#include <functional>
#include <tuple>

namespace {
bool waitUntil(const std::function<bool()>& predicate,int ms){QElapsedTimer t;t.start();while(!predicate()&&t.elapsed()<ms){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();}
QNetworkInterface testNic(QString* ip){
    for(const auto& nic:QNetworkInterface::allInterfaces()){const auto f=nic.flags();if(!f.testFlag(QNetworkInterface::IsUp)||!f.testFlag(QNetworkInterface::IsRunning)||f.testFlag(QNetworkInterface::IsLoopBack)||!f.testFlag(QNetworkInterface::CanMulticast))continue;
        for(const auto& e:nic.addressEntries())if(e.ip().protocol()==QAbstractSocket::IPv4Protocol){*ip=e.ip().toString();return nic;}}
    for(const auto& nic:QNetworkInterface::allInterfaces())if(nic.flags().testFlag(QNetworkInterface::IsLoopBack)){*ip="127.0.0.1";return nic;}
    *ip="127.0.0.1";return {};
}
qint64 samplesAt(qint64 ns){return ns/1000000000LL*48000+ns%1000000000LL*48000/1000000000LL;}
struct StreamStats {int packets=0,gaps=0,badSize=0,badStep=0;quint16 lastSeq=0;quint32 lastTs=0;bool first=true;double peakRouted=0,peakOther=0;qint64 bestLag=LLONG_MAX,maxLead=LLONG_MIN;};
void readRtp(QUdpSocket& socket,const QHostAddress& group,int channels,StreamStats& s,const PtpClock* observer,bool measure){
    while(socket.hasPendingDatagrams()){
        const auto d=socket.receiveDatagram();if(d.destinationAddress()!=group&&!d.destinationAddress().isNull())continue;const QByteArray p=d.data();
        if(!measure)continue;if(p.size()!=12+48*channels*3){++s.badSize;continue;}const auto* b=reinterpret_cast<const unsigned char*>(p.constData());
        const quint16 seq=quint16((b[2]<<8)|b[3]);const quint32 ts=(quint32(b[4])<<24)|(quint32(b[5])<<16)|(quint32(b[6])<<8)|b[7];
        if(!s.first){if(quint16(s.lastSeq+1)!=seq)++s.gaps;if(ts-s.lastTs!=48)++s.badStep;}s.first=false;s.lastSeq=seq;s.lastTs=ts;++s.packets;
        for(int f=0;f<48;++f)for(int c=0;c<channels;++c){const unsigned char* x=b+12+(f*channels+c)*3;int v=(x[0]<<16)|(x[1]<<8)|x[2];if(v&0x800000)v-=0x1000000;const double level=std::abs(v/8388607.0);
            if(c<2)s.peakRouted=qMax(s.peakRouted,level);else s.peakOther=qMax(s.peakOther,level);}
        // lag = how old the packet is when read (>= 0 unless sent early); the smallest lag shows the clock alignment
        // without the test's own reading delay.
        if(observer&&observer->status().locked){const qint32 lag=qint32(quint32(quint64(samplesAt(observer->nowNs())))-ts);s.bestLag=qMin<qint64>(s.bestLag,lag);s.maxLead=qMax<qint64>(s.maxLead,-lag);}
    }
}
}

int runAes67Tests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);bool all=true;QJsonArray tests;
    auto record=[&](const QString& name,bool pass,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=pass;tests.append(details);all&=pass;qInfo().noquote()<<name<<(pass?"PASS":"FAIL")<<QJsonDocument(details).toJson(QJsonDocument::Compact);};
    const QByteArray gm=QByteArray::fromHex("001dc1fffe123456");
    const QByteArray sdp=aes67Sdp("Mizin Playout","192.168.1.30","239.69.30.1",32,8,0,1234,1,gm);const QString text=QString::fromUtf8(sdp);
    record("sdp_describes_an_aes67_stream",text.contains("a=rtpmap:96 L24/48000/8\r\n")&&text.contains("a=ptime:1\r\n")&&text.contains("a=ts-refclk:ptp=IEEE1588-2008:00-1D-C1-FF-FE-12-34-56:0\r\n")
        &&text.contains("a=mediaclk:direct=0\r\n")&&text.contains("c=IN IP4 239.69.30.1/32\r\n")&&text.startsWith("v=0\r\no=- 1234 1 IN IP4 192.168.1.30\r\n"),{{"sdp",text}});
    const QByteArray sap=sapPacket(false,1234,"192.168.1.30",sdp),withdraw=sapPacket(true,1234,"192.168.1.30",sdp);
    record("sap_header_follows_rfc2974",quint8(sap[0])==0x20&&quint8(withdraw[0])==0x24&&sap.mid(4,4)==QByteArray::fromHex("c0a8011e")&&sap.mid(8,16)==QByteArray("application/sdp\0",16)&&sap.endsWith(sdp));
    QString ip;const auto nic=testNic(&ip);const int domain=93; // a test domain, so a real grandmaster on domain 0 is not disturbed
    {
        PtpClock master,slave,automatic;const QByteArray masterId=QByteArray::fromHex("02aabbfffe000001");master.setIdentity(masterId);slave.setIdentity(QByteArray::fromHex("02aabbfffe000002"));automatic.setIdentity(QByteArray::fromHex("02aabbfffe000003"));
        QString e1,e2,e3;const bool started=master.start(ip,domain,PtpClock::Mode::MasterOnly,&e1)&&slave.start(ip,domain,PtpClock::Mode::SlaveOnly,&e2);
        const bool locked=started&&waitUntil([&]{return slave.status().locked;},15000);waitUntil([]{return false;},4000);
        qint64 worst=0;for(int i=0;i<20;++i){const qint64 a=master.nowNs(),b=slave.nowNs(),c=master.nowNs();worst=qMax(worst,std::llabs(b-(a+c)/2));QThread::msleep(20);}
        const auto s=slave.status();
        record("ptp_slave_locks_to_the_grandmaster",locked&&s.grandmaster==PtpClock::identityText(masterId)&&worst<500000&&std::abs(s.rateppm)<50,{{"interface",ip},{"error",e1+e2},{"time_error_us",worst/1000.0},{"path_delay_us",s.pathDelayUs},{"rate_ppm",s.rateppm},{"syncs",double(s.syncs)}});
        const bool autoStarted=automatic.start(ip,domain,PtpClock::Mode::Auto,&e3);
        const bool followed=autoStarted&&waitUntil([&]{const auto a=automatic.status();return a.locked&&!a.master&&a.grandmaster==PtpClock::identityText(masterId);},15000);
        master.stop();const bool tookOver=waitUntil([&]{return automatic.status().master;},12000);
        const bool slaveMoved=waitUntil([&]{const auto x=slave.status();return x.locked&&x.grandmaster==PtpClock::identityText(QByteArray::fromHex("02aabbfffe000003"));},15000);
        record("auto_clock_follows_a_better_master_and_takes_over_when_it_leaves",followed&&tookOver&&slaveMoved,{{"followed",followed},{"took_over",tookOver},{"slave_moved",slaveMoved},{"error",e3}});
    }
    NativeChannel program(false);program.setLoop(true);program.load(QDir(directory).absoluteFilePath("01-h264.mp4"));
    const bool audio=waitUntil([&]{return program.audioBuffers()>20;},15000);
    LocalAudioEngine engine;engine.setBackendOptions({{"name","Mizin Test"},{"channels",10},{"multicast","239.69.93.1"},{"domain",domain},{"latencyMs",2}});
    const QHostAddress group1("239.69.93.1"),group2("239.69.93.2"),sapGroup("239.255.255.255");QUdpSocket rtp1,rtp2,announcements;
    for(auto [socket,group,port]:{std::tuple{&rtp1,group1,5004},std::tuple{&rtp2,group2,5004},std::tuple{&announcements,sapGroup,9875}}){
        socket->bind(QHostAddress::AnyIPv4,quint16(port),QUdpSocket::ShareAddress|QUdpSocket::ReuseAddressHint);socket->setSocketOption(QAbstractSocket::ReceiveBufferSizeSocketOption,4*1024*1024);if(nic.isValid())socket->joinMulticastGroup(group,nic);else socket->joinMulticastGroup(group);}
    PtpClock observer;observer.setIdentity(QByteArray::fromHex("02aabbfffe000004"));QString observerError;observer.start(ip,domain,PtpClock::Mode::SlaveOnly,&observerError);
    const bool started=audio&&engine.start(AudioBackend::Aes67,ip,0);engine.setRoutes({{&program,0}});program.setLocalEngine(started);
    StreamStats s1,s2;bool announced1=false,announced2=false,withdrawn=false;
    auto readSap=[&]{while(announcements.hasPendingDatagrams()){const QByteArray p=announcements.receiveDatagram().data();if(p.size()<24)continue;const QString body=QString::fromUtf8(p.mid(24));
        if(quint8(p[0])&0x04){if(body.contains("239.69.93.1"))withdrawn=true;continue;}if(body.contains("239.69.93.1/")&&body.contains("L24/48000/8")&&body.contains(":93\r\n"))announced1=true;if(body.contains("239.69.93.2/")&&body.contains("L24/48000/2"))announced2=true;}};
    const bool observed=started&&waitUntil([&]{readRtp(rtp1,group1,8,s1,nullptr,false);readRtp(rtp2,group2,2,s2,nullptr,false);readSap();return observer.status().locked;},15000);
    QElapsedTimer window;window.start();
    while(window.elapsed()<3000){QCoreApplication::processEvents(QEventLoop::AllEvents,5);readRtp(rtp1,group1,8,s1,&observer,true);readRtp(rtp2,group2,2,s2,nullptr,true);readSap();QThread::msleep(1);}
    const double seconds=window.elapsed()/1000.0;const QJsonObject network=engine.statistics()["network"].toObject();
    record("engine_sends_1ms_l24_packets",started&&s1.packets>=seconds*900&&s1.packets<=seconds*1100&&s1.gaps==0&&s1.badStep==0&&s1.badSize==0,{{"packets_per_s",s1.packets/seconds},{"gaps",s1.gaps},{"bad_steps",s1.badStep},{"bad_size",s1.badSize},{"error",engine.error()}});
    record("program_audio_reaches_its_channels_only",s1.peakRouted>.005&&s1.peakOther==0,{{"routed_peak",s1.peakRouted},{"other_peak",s1.peakOther}});
    record("channels_beyond_eight_use_a_second_stream",s2.packets>=seconds*900&&s2.badSize==0&&s2.peakRouted==0,{{"packets_per_s",s2.packets/seconds}});
    record("rtp_timestamps_follow_ptp_time",observed&&s1.bestLag!=LLONG_MAX&&std::llabs(s1.bestLag)<96&&s1.maxLead<96,{{"best_lag_ms",s1.bestLag/48.0},{"max_lead_ms",s1.maxLead/48.0},{"observer",observerError}});
    record("statistics_report_streams_and_ptp",network["kind"].toString()=="aes67"&&network["streams"].toArray().size()==2&&network["ptp"].toObject()["grandmaster"].toString().size()==23,{{"network",network}});
    {   // The 8 s fixture loops: audio must keep flowing on the network after the Program restarts (seek latency).
        qint64 last=program.position();bool wrapped=false;waitUntil([&]{readRtp(rtp1,group1,8,s1,nullptr,false);readRtp(rtp2,group2,2,s2,nullptr,false);readSap();const qint64 now=program.position();wrapped|=now+1000<last;last=now;return wrapped;},12000);
        StreamStats after;QElapsedTimer tail;tail.start();while(tail.elapsed()<2500){QCoreApplication::processEvents(QEventLoop::AllEvents,5);readRtp(rtp1,group1,8,after,nullptr,true);readRtp(rtp2,group2,2,s2,nullptr,false);readSap();QThread::msleep(1);}
        record("audio_continues_after_the_program_loops",wrapped&&after.peakRouted>.005,{{"wrapped",wrapped},{"peak_after_wrap",after.peakRouted}});
    }
    // MIZIN_AES67_HOLD_MS keeps the stream on air after the checks so an external receiver (ffmpeg, Dante) can be tried.
    if(const int hold=qEnvironmentVariableIntValue("MIZIN_AES67_HOLD_MS");hold>0){QElapsedTimer held;held.start();qint64 lastLog=-1;waitUntil([&]{readRtp(rtp1,group1,8,s1,nullptr,false);readRtp(rtp2,group2,2,s2,nullptr,false);readSap();
        if(held.elapsed()/1000!=lastLog){lastLog=held.elapsed()/1000;qInfo().noquote()<<"hold"<<lastLog<<"position"<<program.position()<<"playing"<<program.playing()<<"buffers"<<program.audioBuffers()<<QJsonDocument(engine.statistics()).toJson(QJsonDocument::Compact).left(300);}return false;},qMin(hold,600000));}
    engine.stop();program.setLocalEngine(false);waitUntil([&]{readSap();return withdrawn;},3000);
    record("sap_announces_and_withdraws_the_streams",announced1&&announced2&&withdrawn,{{"announced_1",announced1},{"announced_2",announced2},{"withdrawn",withdrawn}});
    observer.stop();
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"tests",tests},{"scope","PTPv2 clocks, RTP sender and SAP on this computer over multicast loopback (test PTP domain 93). Not a Dante/AES67 hardware interoperability qualification."}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return all?0:2;
}
