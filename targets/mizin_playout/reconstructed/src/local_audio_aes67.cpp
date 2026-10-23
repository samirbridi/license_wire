#ifndef NOMINMAX
#define NOMINMAX
#endif
#include "local_audio.hpp"
#include "aes67.hpp"
#include <QJsonArray>
#include <QNetworkInterface>
#include <QRandomGenerator>
#include <algorithm>
#include <cmath>
#include <vector>
#ifdef Q_OS_WIN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <avrt.h>
#include <timeapi.h>
#endif

// ADR-021: AES67 output. Every 1 ms the engine renders 48 frames (PTP-timed) and each stream of up to 8 channels
// leaves as one RTP L24 packet; streams are announced every 30 s by SAP and withdrawn on stop.
namespace {
constexpr int Frames=48;
qint64 samplesAt(qint64 ns){return ns/1000000000LL*LocalAudioEngine::SampleRate+ns%1000000000LL*LocalAudioEngine::SampleRate/1000000000LL;}

#ifdef Q_OS_WIN
class Aes67Backend final : public AudioOutputBackend {
public:
    using AudioOutputBackend::AudioOutputBackend;
    ~Aes67Backend() override {close();}
    bool open(const QString& id,int,QString* error) override {
        options_=Aes67Options::fromJson(engine_->backendOptions(),id);WSADATA wsa;WSAStartup(MAKEWORD(2,2),&wsa);wsa_=true;
        if(!ptp_.start(options_.interfaceIp,options_.domain,options_.ptpMode,error)){close();return false;}
        in_addr iface{};iface.s_addr=inet_addr(options_.interfaceIp.toLatin1().constData());
        auto udp=[&](int ttl){SOCKET s=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);if(s==INVALID_SOCKET)return s;setsockopt(s,IPPROTO_IP,IP_MULTICAST_IF,reinterpret_cast<const char*>(&iface),sizeof iface);
            DWORD t=DWORD(ttl);setsockopt(s,IPPROTO_IP,IP_MULTICAST_TTL,reinterpret_cast<const char*>(&t),sizeof t);return s;};
        const int count=(options_.channels+7)/8;
        for(int k=0;k<count;++k){Stream s;s.first=k*8;s.channels=std::min(8,options_.channels-k*8);s.address=k==0&&!options_.multicast.isEmpty()?options_.multicast:!options_.multicast.isEmpty()?nextAddress(options_.multicast,k):aes67DefaultMulticast(options_.interfaceIp,k);
            s.socket=udp(options_.ttl);s.to.sin_family=AF_INET;s.to.sin_port=htons(5004);if(inet_pton(AF_INET,s.address.toLatin1().constData(),&s.to.sin_addr)!=1||s.socket==INVALID_SOCKET){if(error)*error="Invalid AES67 multicast address: "+s.address;streams_.push_back(s);close();return false;}
            s.ssrc=QRandomGenerator::system()->generate();s.seq=quint16(QRandomGenerator::system()->generate());s.session=QRandomGenerator::system()->generate()|1;
            s.name=count>1?QString("%1 %2-%3").arg(options_.name).arg(s.first+1).arg(s.first+s.channels):options_.name;streams_.push_back(s);}
        sap_=udp(options_.ttl);sapTo_.sin_family=AF_INET;sapTo_.sin_port=htons(9875);inet_pton(AF_INET,"239.255.255.255",&sapTo_.sin_addr);
        stop_=false;thread_=std::thread([this]{run();});return true;
    }
    void close() override {
        stop_=true;if(thread_.joinable())thread_.join();
        for(auto& s:streams_)if(s.socket!=INVALID_SOCKET){closesocket(s.socket);s.socket=INVALID_SOCKET;}streams_.clear();
        if(sap_!=INVALID_SOCKET){closesocket(sap_);sap_=INVALID_SOCKET;}ptp_.stop();if(wsa_){WSACleanup();wsa_=false;}
    }
    int channels()const override {return options_.channels;}
    int bufferFrames()const override {return Frames;}
    QString description()const override {return QString("AES67 · %1 ch · %2 · 48 kHz L24 · 1 ms").arg(options_.channels).arg(streams_.empty()?QString():streams_.front().address);}
    QJsonObject details()const override {
        const auto p=ptp_.status();QJsonArray streams;for(const auto& s:streams_)streams.append(QJsonObject{{"name",s.name},{"address",s.address},{"port",5004},{"channels",s.channels},{"first_channel",s.first+1}});
        return {{"kind","aes67"},{"interface",options_.interfaceIp},{"streams",streams},{"packets",double(packets_.load())},{"late_packets",double(late_.load())},{"reanchors",double(reanchors_.load())},{"receiver_latency_ms",options_.latencyMs},
            {"ptp",QJsonObject{{"locked",p.locked},{"grandmaster_here",p.master},{"grandmaster",p.grandmaster},{"domain",p.domain},{"offset_us",p.offsetUs},{"path_delay_us",p.pathDelayUs},{"rate_ppm",p.rateppm},{"steps",double(p.steps)}}}};
    }
private:
    struct Stream {SOCKET socket=INVALID_SOCKET;sockaddr_in to{};QString address,name;int first=0,channels=0;quint32 ssrc=0,session=0,version=1;quint16 seq=0;};
    Aes67Options options_;PtpClock ptp_;std::vector<Stream> streams_;SOCKET sap_=INVALID_SOCKET;sockaddr_in sapTo_{};bool wsa_=false;
    std::thread thread_;std::atomic<bool> stop_{false};std::atomic<qint64> packets_{0},late_{0},reanchors_{0};
    static QString nextAddress(const QString& base,int k){QStringList o=base.split('.');if(o.size()!=4)return base;o[3]=QString::number((o[3].toInt()+k)%256);return o.join('.');}
    void announce(bool deletion,const QByteArray& grandmaster){
        for(auto& s:streams_){const QByteArray sdp=aes67Sdp(s.name,options_.interfaceIp,s.address,options_.ttl,s.channels,options_.domain,s.session,s.version,grandmaster);
            const QByteArray packet=sapPacket(deletion,quint16(s.session),options_.interfaceIp,sdp);sendto(sap_,packet.constData(),packet.size(),0,reinterpret_cast<const sockaddr*>(&sapTo_),sizeof sapTo_);}
    }
    void run(){
        DWORD task=0;HANDLE mmcss=AvSetMmThreadCharacteristicsW(L"Pro Audio",&task);timeBeginPeriod(1);
        HANDLE timer=CreateWaitableTimerExW(nullptr,nullptr,0x00000002/*CREATE_WAITABLE_TIMER_HIGH_RESOLUTION*/,TIMER_ALL_ACCESS);if(!timer)timer=CreateWaitableTimerW(nullptr,FALSE,nullptr);
        LARGE_INTEGER due;due.QuadPart=-10000;SetWaitableTimer(timer,&due,1,nullptr,nullptr,FALSE);
        const int channels=options_.channels;std::vector<float> audio(size_t(Frames)*channels);QByteArray packet;
        const qint64 latencyFrames=qint64(options_.latencyMs)*LocalAudioEngine::SampleRate/1000+Frames;
        qint64 next=-1,nextSap=0;QByteArray grandmaster;
        while(!stop_){
            WaitForSingleObject(timer,50);const qint64 now=samplesAt(ptp_.nowNs()),mono=PtpClock::monotonicNs();
            // Announce on start, every 30 s and whenever the grandmaster changes (the SDP names it).
            const QByteArray gm=ptp_.grandmasterIdentity();if(gm!=grandmaster){if(!grandmaster.isEmpty())for(auto& s:streams_)++s.version;grandmaster=gm;nextSap=0;}
            if(mono>=nextSap){announce(false,grandmaster);nextSap=mono+30LL*1000000000LL;}
            if(next<0||std::llabs(now-next)>LocalAudioEngine::SampleRate/10){next=now-now%Frames;++reanchors_;}
            int sent=0;
            // Packets leave up to half a packet before their timestamp; the receiver plays them at timestamp + its latency.
            while(next<=now+Frames/2&&sent<64){
                engine_->render(audio.data(),Frames,channels,latencyFrames);
                for(auto& s:streams_){
                    packet.resize(12+Frames*s.channels*3);auto* b=reinterpret_cast<unsigned char*>(packet.data());b[0]=0x80;b[1]=96;
                    b[2]=quint8(s.seq>>8);b[3]=quint8(s.seq);const quint32 ts=quint32(quint64(next));for(int i=0;i<4;++i){b[4+i]=quint8(ts>>(24-8*i));b[8+i]=quint8(s.ssrc>>(24-8*i));}
                    unsigned char* out=b+12;
                    for(int f=0;f<Frames;++f)for(int c=0;c<s.channels;++c){const int v=int(std::lrint(double(std::clamp(audio[size_t(f)*channels+s.first+c],-1.0f,1.0f))*8388607.0));*out++=quint8(v>>16);*out++=quint8(v>>8);*out++=quint8(v);}
                    sendto(s.socket,packet.constData(),packet.size(),0,reinterpret_cast<const sockaddr*>(&s.to),sizeof s.to);++s.seq;
                }
                next+=Frames;++sent;++packets_;
            }
            if(sent>1)late_+=sent-1;
        }
        announce(true,grandmaster);CancelWaitableTimer(timer);CloseHandle(timer);timeEndPeriod(1);if(mmcss)AvRevertMmThreadCharacteristics(mmcss);
    }
};
#endif
}

std::unique_ptr<AudioOutputBackend> makeAes67Backend(LocalAudioEngine* engine){
#ifdef Q_OS_WIN
    return std::make_unique<Aes67Backend>(engine);
#else
    Q_UNUSED(engine);return nullptr;
#endif
}
QList<AudioDeviceInfo> aes67Devices(){
    QList<AudioDeviceInfo> list;
    for(const auto& nic:QNetworkInterface::allInterfaces()){
        const auto flags=nic.flags();if(!flags.testFlag(QNetworkInterface::IsUp)||!flags.testFlag(QNetworkInterface::IsRunning)||flags.testFlag(QNetworkInterface::IsLoopBack)||!flags.testFlag(QNetworkInterface::CanMulticast))continue;
        for(const auto& entry:nic.addressEntries())if(entry.ip().protocol()==QAbstractSocket::IPv4Protocol)list.append({AudioBackend::Aes67,entry.ip().toString(),QString("%1 (%2)").arg(nic.humanReadableName(),entry.ip().toString()),0});
    }
    return list;
}
