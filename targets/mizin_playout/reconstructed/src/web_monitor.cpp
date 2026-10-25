#include "web_monitor.hpp"
#include "project_rate.hpp"
#include "web_encoder.hpp"
#include <rtc/rtc.hpp>
#include <QCoreApplication>
#include <QDateTime>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkInterface>
#ifdef Q_OS_WIN
#include <winsock2.h>
#include <iphlpapi.h>
#endif
#include <QPainter>
#include <QRandomGenerator>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>
#include <QUrlQuery>
#include <QVideoFrameFormat>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <algorithm>
#include <deque>
#include <mutex>
#include <thread>

namespace {
constexpr int Fps=30,AudioBitrate=128000;
// Quality 0 = automatic (the source size, at most 1920x1080), 1 = 720p, 2 = 1080p, 3 = 2160p (letterboxed in that box).
QSize streamSize(int quality,QSize source){
    const QSize box=quality==1?QSize(1280,720):quality==3?QSize(3840,2160):QSize(1920,1080);if(quality!=0)return box;
    QSize size=source.isEmpty()?QSize(1280,720):source;if(size.width()>box.width()||size.height()>box.height())size=size.scaled(box,Qt::KeepAspectRatio);
    return QSize(qMax(320,size.width()&~1),qMax(180,size.height()&~1));
}
// About 0.12 bit per pixel at 30 fps: 720p 3.3 Mbit/s, 1080p 7.5 Mbit/s, 2160p 25 Mbit/s.
int streamBitrate(QSize size){return int(std::clamp<qint64>(qint64(size.width())*size.height()*Fps*12/100,1500000,25000000));}
constexpr int VideoPayload=96,AudioPayload=111,PlayoutDelayExtension=6;
constexpr int MaxRequestBytes=128*1024;
void initLogger(){static std::once_flag once;std::call_once(once,[]{rtc::InitLogger(rtc::LogLevel::Warning);});}
}

// One encoder per watched Program, shared by every viewer of that Program. Frames are converted on
// the GUI thread at <= 30 fps only while someone watches (as NetworkBus does), then scaled to the chosen quality
// (automatic = source size up to 1080p) and encoded on a worker thread; the Program and GUI never wait for the network.
class WebStream final : public QObject {
public:
    struct Viewer {
        QString session;std::shared_ptr<rtc::PeerConnection> pc;std::shared_ptr<rtc::Track> video,audio;
        std::atomic<bool> videoOpen{false},audioOpen{false},connected{false};
    };
    WebStream(NativeChannel* channel,std::shared_ptr<std::atomic<int>> quality):channel_(channel),quality_(std::move(quality)){
        clock_.start();
        connect(channel,&NativeChannel::frameReady,this,[this](const QVideoFrame& frame){this->frame(frame,false);});
        connect(channel,&NativeChannel::changed,this,[this]{playing_=channel_->playing();});
        connect(channel,&NativeChannel::audioReady,this,[this](const AudioPacket& packet){if(!watching())return;std::lock_guard lock(mutex_);while(audio_.size()>=50){audio_.pop_front();++droppedAudio_;}audio_.push_back(packet);wake_.notify_one();});
        connect(channel,&NativeChannel::audioReset,this,[this]{std::lock_guard lock(mutex_);audio_.clear();resetAudio_=true;});
        worker_=std::thread([this]{work();});
        frame(channel->lastFrame(),true);
    }
    ~WebStream() override {
        {std::lock_guard lock(mutex_);stopping_=true;}wake_.notify_all();if(worker_.joinable())worker_.join();
        for(const auto& viewer:snapshot())retire(viewer);
    }
    // A closing PeerConnection is still used by libdatachannel's own threads for a moment: silence its callbacks,
    // close it, and release it only a few seconds later (destroying it right away crashed in ntdll now and then).
    static void retire(const std::shared_ptr<Viewer>& viewer){
        if(!viewer)return;
        try{if(viewer->video)viewer->video->resetCallbacks();if(viewer->audio)viewer->audio->resetCallbacks();if(viewer->pc){viewer->pc->resetCallbacks();viewer->pc->close();}}catch(const std::exception&){}
        if(qApp)QTimer::singleShot(3000,qApp,[viewer]{});
    }
    std::shared_ptr<Viewer> addViewer(const QString& session,const rtc::Configuration& config,QObject* context,std::function<void(QString)> offer,std::function<void()> failed){
        auto viewer=std::make_shared<Viewer>();viewer->session=session;viewer->pc=std::make_shared<rtc::PeerConnection>(config);std::weak_ptr<Viewer> weak=viewer;auto keyframe=keyframe_;
        const uint32_t ssrc=QRandomGenerator::global()->generate()&0x7ffffffe;
        // H.264 Constrained Baseline offered up to level 5.1, so 2160p30 fits.
        rtc::Description::Video video("video",rtc::Description::Direction::SendOnly);video.addH264Codec(VideoPayload,"profile-level-id=42e033;packetization-mode=1;level-asymmetry-allowed=1");video.addSSRC(ssrc,"mizin-video","mizin","mizin-video");
        video.addExtMap(rtc::Description::Entry::ExtMap(PlayoutDelayExtension,"http://www.webrtc.org/experiments/rtp-hdrext/playout-delay"));
        viewer->video=viewer->pc->addTrack(video);
        auto videoConfig=std::make_shared<rtc::RtpPacketizationConfig>(ssrc,"mizin",VideoPayload,rtc::H264RtpPacketizer::ClockRate);
        // Ask the browser to render as soon as frames arrive (0-100 ms jitter buffer) instead of its default smoothing delay.
        videoConfig->playoutDelayId=PlayoutDelayExtension;videoConfig->playoutDelayMin=0;videoConfig->playoutDelayMax=10;
        auto packetizer=std::make_shared<rtc::H264RtpPacketizer>(rtc::NalUnit::Separator::StartSequence,videoConfig);
        packetizer->addToChain(std::make_shared<rtc::RtcpSrReporter>(videoConfig));packetizer->addToChain(std::make_shared<rtc::RtcpNackResponder>());packetizer->addToChain(std::make_shared<rtc::PliHandler>([keyframe]{*keyframe=true;}));
        viewer->video->setMediaHandler(packetizer);
        rtc::Description::Audio audio("audio",rtc::Description::Direction::SendOnly);audio.addOpusCodec(AudioPayload);audio.addSSRC(ssrc+1,"mizin-audio","mizin","mizin-audio");viewer->audio=viewer->pc->addTrack(audio);
        auto audioConfig=std::make_shared<rtc::RtpPacketizationConfig>(ssrc+1,"mizin",AudioPayload,48000);auto opus=std::make_shared<rtc::OpusRtpPacketizer>(audioConfig);opus->addToChain(std::make_shared<rtc::RtcpSrReporter>(audioConfig));viewer->audio->setMediaHandler(opus);
        viewer->video->onOpen([weak,keyframe]{if(auto v=weak.lock()){v->videoOpen=true;*keyframe=true;}});viewer->video->onClosed([weak]{if(auto v=weak.lock())v->videoOpen=false;});
        viewer->audio->onOpen([weak]{if(auto v=weak.lock())v->audioOpen=true;});viewer->audio->onClosed([weak]{if(auto v=weak.lock())v->audioOpen=false;});
        viewer->pc->onStateChange([weak,context,failed](rtc::PeerConnection::State state){
            if(auto v=weak.lock())v->connected=state==rtc::PeerConnection::State::Connected;
            if(state==rtc::PeerConnection::State::Failed||state==rtc::PeerConnection::State::Closed||state==rtc::PeerConnection::State::Disconnected)QMetaObject::invokeMethod(context,failed,Qt::QueuedConnection);
        });
        viewer->pc->onGatheringStateChange([weak,context,offer](rtc::PeerConnection::GatheringState state){
            if(state!=rtc::PeerConnection::GatheringState::Complete)return;auto v=weak.lock();if(!v)return;const auto description=v->pc->localDescription();if(!description)return;
            const QString sdp=QString::fromStdString(std::string(*description));QMetaObject::invokeMethod(context,[offer,sdp]{offer(sdp);},Qt::QueuedConnection);
        });
        {std::lock_guard lock(viewersMutex_);viewers_.push_back(viewer);}
        viewer->pc->setLocalDescription();return viewer;
    }
    bool answer(const QString& session,const QString& sdp){
        for(const auto& viewer:snapshot())if(viewer->session==session){try{viewer->pc->setRemoteDescription(rtc::Description(sdp.toStdString(),"answer"));return true;}catch(const std::exception&){return false;}}
        return false;
    }
    bool connected(const QString& session){for(const auto& viewer:snapshot())if(viewer->session==session)return viewer->connected;return false;}
    void removeViewer(const QString& session){
        std::shared_ptr<Viewer> removed;{std::lock_guard lock(viewersMutex_);for(auto it=viewers_.begin();it!=viewers_.end();++it)if((*it)->session==session){removed=*it;viewers_.erase(it);break;}}
        retire(removed);
    }
    int viewerCount()const{std::lock_guard lock(viewersMutex_);return int(viewers_.size());}
    QJsonObject statistics()const{
        std::lock_guard lock(statsMutex_);
        return {{"viewers",viewerCount()},{"encoded_frames",encoded_.load()},{"keyframes",keyframes_.load()},{"superseded_frames",superseded_.load()},{"audio_packets",audioPackets_.load()},{"dropped_audio_packets",droppedAudio_.load()},{"encode_ms_last",encodeUs_.load()/1000.0},{"video_bytes",double(bytes_.load())},{"width",width_.load()},{"height",height_.load()},{"bitrate",double(bitrate_.load())},{"fps_limit",fps_.load()},{"hardware",hardware_.load()},{"encoder",encoderError_.isEmpty()?encoderName_:encoderError_},{"audio_codec","Opus 48 kHz stereo"}};
    }
private:
    NativeChannel* channel_;
    QElapsedTimer clock_;
    qint64 lastTick_=-1;
    std::mutex mutex_;mutable std::mutex viewersMutex_,statsMutex_;std::condition_variable wake_;std::thread worker_;
    std::vector<std::shared_ptr<Viewer>> viewers_;
    QImage pending_;bool hasPending_=false,stopping_=false,resetAudio_=false;std::deque<AudioPacket> audio_;
    std::shared_ptr<std::atomic<bool>> keyframe_=std::make_shared<std::atomic<bool>>(true);
    std::atomic<qint64> encoded_{0},keyframes_{0},superseded_{0},audioPackets_{0},droppedAudio_{0},encodeUs_{0},bytes_{0},bitrate_{0};
    std::shared_ptr<std::atomic<int>> quality_;std::atomic<int> width_{0},height_{0},fps_{30};std::atomic<bool> playing_{false};std::atomic<bool> hardware_{false};
    QString encoderError_,encoderName_;
    std::vector<std::shared_ptr<Viewer>> snapshot()const{std::lock_guard lock(viewersMutex_);return viewers_;}
    bool watching()const{for(const auto& viewer:snapshot())if(viewer->videoOpen||viewer->audioOpen)return true;return false;}
    double seconds()const{return clock_.nsecsElapsed()/1e9;}
    void frame(const QVideoFrame& frame,bool force){
        if(!force&&!watching())return;// First frame of each tick of the web rate (30 fps sources still give 25 fps at a 25 fps project).
        const qint64 tick=qint64(std::floor(double(clock_.elapsed())*webFrameRate()/1000.0));if(!force&&tick==lastTick_)return;lastTick_=tick;
        QImage image;
        if(frame.isValid()){const auto format=frame.surfaceFormat();const bool hdr=format.colorTransfer()==QVideoFrameFormat::ColorTransfer_ST2084||format.colorTransfer()==QVideoFrameFormat::ColorTransfer_STD_B67;if(!hdr&&frame.width()<=4096&&frame.height()<=4096)image=frame.toImage();}
        if(image.isNull()){image=QImage(16,9,QImage::Format_RGB32);image.fill(Qt::black);}
        std::lock_guard lock(mutex_);if(hasPending_)++superseded_;pending_=std::move(image);hasPending_=true;wake_.notify_one();
    }
    void send(const std::shared_ptr<rtc::Track>& track,const QByteArray& data,double timestamp){
        try{track->sendFrame(reinterpret_cast<const rtc::byte*>(data.constData()),size_t(data.size()),rtc::FrameInfo(std::chrono::duration<double>(timestamp)));}catch(const std::exception&){}
    }
    void work(){
        H264Encoder video;OpusAudioEncoder opus;opus.open(AudioBitrate);bool videoReady=false,useHardware=true;QSize source;int quality=-1;
        // (Re)opens the encoder when the quality or the source size changes; a failing hardware encoder falls back to software.
        auto prepare=[&](QSize size){
            if(videoReady&&size==QSize(width_.load(),height_.load())&&fps_.load()==int(std::lround(webFrameRate()))&&!video.failed())return;if(video.failed())useHardware=false;
            const int bitrate=streamBitrate(size);fps_=int(std::lround(webFrameRate()));videoReady=video.open(size.width(),size.height(),fps_,bitrate,useHardware);if(!videoReady&&useHardware){useHardware=false;videoReady=video.open(size.width(),size.height(),fps_,bitrate,false);}
            width_=size.width();height_=size.height();bitrate_=bitrate;hardware_=videoReady&&video.hardware();*keyframe_=true;
            std::lock_guard lock(statsMutex_);encoderError_=videoReady?QString():video.error();encoderName_=video.name();
        };
        QImage canvas,last;double lastVideo=-1,audioClock=-1;std::vector<float> pcm;qint64 lastTick=-1;bool fresh=false;
        for(;;){
            QImage image;std::deque<AudioPacket> audio;bool reset=false;
            {std::unique_lock lock(mutex_);wake_.wait_for(lock,std::chrono::milliseconds(qMax(5,int(500/webFrameRate()))),[this]{return stopping_||hasPending_||!audio_.empty();});if(stopping_)break;
                if(hasPending_){image=std::move(pending_);hasPending_=false;}audio.swap(audio_);reset=std::exchange(resetAudio_,false);}
            const double now=seconds(),rate=webFrameRate();const qint64 tick=qint64(std::floor(now*rate));
            // Cadence: at most one picture per tick of the web rate, always the newest. A tick without a new frame (GUI busy,
            // slower source) repeats the last one; paused/black Programs repeat every 0.4 s so joining viewers get a picture.
            if(!image.isNull()){last=image;fresh=true;}
            const bool due=!last.isNull()&&tick!=lastTick&&(fresh||now-lastVideo>(playing_.load()?1.0/rate:.4));
            image=due?last:QImage();if(due){fresh=false;lastTick=tick;}
            // The 16x9 black placeholder (nothing on air) keeps the current size instead of shrinking the stream.
            if(!image.isNull()&&image.size()!=QSize(16,9))source=image.size();
            if(!image.isNull()&&(quality!=quality_->load()||fps_!=int(std::lround(webFrameRate()))||!videoReady||video.failed()||streamSize(quality_->load(),source)!=QSize(width_.load(),height_.load()))){quality=quality_->load();prepare(streamSize(quality,source));}
            if(!image.isNull()&&videoReady){
                const int W=width_.load(),H=height_.load();if(canvas.size()!=QSize(W,H))canvas=QImage(W,H,QImage::Format_RGB32);
                if(image.size()==QSize(W,H))canvas=image.format()==QImage::Format_RGB32?image:image.convertToFormat(QImage::Format_RGB32); // already the stream size: no scaling pass
                else{if(canvas.size()!=QSize(W,H)||canvas.isDetached()==false)canvas=QImage(W,H,QImage::Format_RGB32);canvas.fill(Qt::black);QPainter painter(&canvas);painter.setRenderHint(QPainter::SmoothPixmapTransform);const QSize fit=image.size().scaled(W,H,Qt::KeepAspectRatio);painter.drawImage(QRect(QPoint((W-fit.width())/2,(H-fit.height())/2),fit),image);}
                const bool force=keyframe_->exchange(false);bool key=false;QElapsedTimer timer;timer.start();const QByteArray unit=video.encode(canvas,qint64(now*1e6),force,&key);encodeUs_=timer.nsecsElapsed()/1000;
                if(!unit.isEmpty()){++encoded_;bytes_+=unit.size();if(key)++keyframes_;lastVideo=qMax(now,lastVideo+.001);for(const auto& viewer:snapshot())if(viewer->videoOpen)send(viewer->video,unit,lastVideo);}
            }
            if(reset){pcm.clear();audioClock=-1;}
            for(const auto& packet:audio){const auto* samples=reinterpret_cast<const float*>(packet.samples.constData());pcm.insert(pcm.end(),samples,samples+packet.frames()*2);}
            if(pcm.size()>size_t(48000*2)){pcm.erase(pcm.begin(),pcm.end()-48000);++droppedAudio_;}
            while(pcm.size()>=size_t(OpusAudioEncoder::FrameSamples*2)){
                const QByteArray packet=opus.encode(pcm.data());pcm.erase(pcm.begin(),pcm.begin()+OpusAudioEncoder::FrameSamples*2);if(packet.isEmpty())continue;
                // Audio RTP time follows its own sample clock, re-anchored to wall time after gaps/drift (RTCP SR maps both tracks to the same clock).
                if(audioClock<0||std::abs(audioClock-now)>.25)audioClock=now;++audioPackets_;for(const auto& viewer:snapshot())if(viewer->audioOpen)send(viewer->audio,packet,audioClock);audioClock+=.02;
            }
        }
    }
};

WebMonitorServer::WebMonitorServer(Programs programs,Channel channel,QObject* parent):QObject(parent),programs_(std::move(programs)),channel_(std::move(channel)){}
WebMonitorServer::~WebMonitorServer(){closeAll();}
bool WebMonitorServer::running()const{return server_&&server_->isListening();}
quint16 WebMonitorServer::port()const{return running()?server_->serverPort():0;}
// Uppercase codes without I/O/0/1: easy to read aloud and type.
QString WebMonitorServer::generateCode(){static const QString alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";QString code;for(int i=0;i<8;++i)code+=alphabet[int(QRandomGenerator::system()->bounded(alphabet.size()))];return code;}
bool WebMonitorServer::start(quint16 port,bool lan,const QString& code){
    stop();initLogger();server_=new QTcpServer(this);
    if(!server_->listen(lan?QHostAddress::AnyIPv4:QHostAddress::LocalHost,port)){error_=server_->errorString();delete server_;server_=nullptr;emit changed();return false;}
    lan_=lan;code_=normalizeCode(code).size()>=6?normalizeCode(code):generateCode();error_.clear();failures_.clear();
    connect(server_,&QTcpServer::newConnection,this,[this]{while(auto* socket=server_->nextPendingConnection()){connect(socket,&QTcpSocket::readyRead,this,[this,socket]{read(socket);});connect(socket,&QTcpSocket::disconnected,socket,&QObject::deleteLater);QTimer::singleShot(15000,socket,[socket]{socket->abort();});}});
    emit changed();return true;
}
void WebMonitorServer::stop(){closeAll();if(server_){server_->close();delete server_;server_=nullptr;}emit changed();}
void WebMonitorServer::setCode(const QString& code){code_=normalizeCode(code);closeAll();emit changed();}
void WebMonitorServer::closeAll(){sessions_.clear();streams_.clear();}
void WebMonitorServer::programRemoved(int id){
    for(auto it=sessions_.begin();it!=sessions_.end();)if(it.value()/10==id)it=sessions_.erase(it);else ++it;
    for(auto it=streams_.begin();it!=streams_.end();)if(it.key()/10==id)it=streams_.erase(it);else ++it;emit changed();
}
int WebMonitorServer::viewers()const{int total=0;for(const auto& stream:streams_)total+=stream->viewerCount();return total;}
QString WebMonitorServer::urlFor(const QString& ip)const{return QString("http://%1:%2/?k=%3").arg(ip).arg(port()).arg(code_);}
QList<WebAddress> WebMonitorServer::addresses()const{
    QList<WebAddress> list;
    if(lan_){
        int best=-1;
#ifdef Q_OS_WIN
        // The adapter Windows would use to reach the internet is the one phones on the event network most likely share.
        DWORD index=0;if(GetBestInterface(inet_addr("8.8.8.8"),&index)==NO_ERROR)best=int(index);
#endif
        for(const auto& nic:QNetworkInterface::allInterfaces()){
            const auto f=nic.flags();if(!f.testFlag(QNetworkInterface::IsUp)||!f.testFlag(QNetworkInterface::IsRunning)||f.testFlag(QNetworkInterface::IsLoopBack))continue;
            for(const auto& entry:nic.addressEntries()){const auto ip=entry.ip();if(ip.protocol()!=QAbstractSocket::IPv4Protocol||ip.isLinkLocal())continue;
                WebAddress a{nic.humanReadableName(),ip.toString(),nic.index()==best};if(a.primary)list.prepend(a);else list.append(a);}
        }
        // Physical adapters before virtual ones (Hyper-V/WSL/VMware/VirtualBox/Docker switches rarely reach phones).
        auto isVirtual=[](const WebAddress& a){for(const char* key:{"vEthernet","Virtual","VMware","VirtualBox","Hyper-V","WSL","Docker","Loopback"})if(a.name.contains(QLatin1String(key),Qt::CaseInsensitive))return true;return false;};
        std::stable_sort(list.begin(),list.end(),[&](const WebAddress& x,const WebAddress& y){return (x.primary?0:isVirtual(x)?2:1)<(y.primary?0:isVirtual(y)?2:1);});
        if(!list.isEmpty()&&!list.first().primary)list.first().primary=true;
    }
    list.append({QStringLiteral("localhost"),QStringLiteral("127.0.0.1"),list.isEmpty()});return list;
}
QStringList WebMonitorServer::urls()const{if(!running())return {};QStringList list;for(const auto& a:addresses())list<<urlFor(a.ip);return list;}
QJsonObject WebMonitorServer::statistics()const{
    QJsonArray streams;for(auto it=streams_.cbegin();it!=streams_.cend();++it){auto item=it.value()->statistics();item["program_id"]=it.key()/10;item["quality"]=it.key()%10==9?QStringLiteral("app"):QStringLiteral("viewer");streams.append(item);}
    return {{"running",running()},{"port",port()},{"lan",lan_},{"viewers",viewers()},{"encoders",encoders()},{"streams",streams},{"media_udp_ports",QString("%1-%2").arg(MediaPortFirst).arg(MediaPortLast)},{"error",error_}};
}
void WebMonitorServer::respond(QTcpSocket* socket,int status,const QByteArray& type,const QByteArray& body){
    static const QHash<int,QByteArray> reasons{{200,"OK"},{204,"No Content"},{400,"Bad Request"},{403,"Forbidden"},{404,"Not Found"},{405,"Method Not Allowed"},{413,"Payload Too Large"},{429,"Too Many Requests"},{503,"Service Unavailable"}};
    QByteArray head="HTTP/1.1 "+QByteArray::number(status)+" "+reasons.value(status,"Error")+"\r\nContent-Length: "+QByteArray::number(body.size())+"\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY\r\n";
    if(!type.isEmpty())head+="Content-Type: "+type+"\r\n";
    socket->write(head+"\r\n"+body);socket->disconnectFromHost();
}
void WebMonitorServer::read(QTcpSocket* socket){
    QByteArray buffer=socket->property("buffer").toByteArray()+socket->readAll();if(buffer.size()>MaxRequestBytes){respond(socket,413,"text/plain","Too large");return;}
    const int end=buffer.indexOf("\r\n\r\n");if(end<0){socket->setProperty("buffer",buffer);return;}
    const auto lines=buffer.left(end).split('\n');const auto first=lines.value(0).trimmed().split(' ');int length=0;
    for(const auto& line:lines.mid(1)){const int colon=line.indexOf(':');if(colon>0&&line.left(colon).trimmed().toLower()=="content-length")length=line.mid(colon+1).trimmed().toInt();}
    if(first.size()<2||length<0||length>MaxRequestBytes){respond(socket,400,"text/plain","Bad request");return;}
    if(buffer.size()<end+4+length){socket->setProperty("buffer",buffer);return;}
    socket->setProperty("buffer",QByteArray());disconnect(socket,&QTcpSocket::readyRead,this,nullptr);
    Request request;request.method=first[0];const QByteArray target=first[1];const int mark=target.indexOf('?');request.path=mark<0?target:target.left(mark);
    if(mark>=0){const QUrlQuery query(QString::fromUtf8(target.mid(mark+1)));for(const auto& item:query.queryItems(QUrl::FullyDecoded))request.query.insert(item.first,item.second);}
    request.body=buffer.mid(end+4,length);handle(socket,request);
}
void WebMonitorServer::handle(QTcpSocket* socket,const Request& request){
    if(request.path=="/"||request.path=="/index.html"){
        if(request.method!="GET"){respond(socket,405,"text/plain","GET only");return;}QFile page(":/web/monitor.html");page.open(QIODevice::ReadOnly);respond(socket,200,"text/html; charset=utf-8",page.readAll());return;
    }
    if(!request.path.startsWith("/api/")){respond(socket,404,"text/plain","Not found");return;}
    const qint64 now=QDateTime::currentMSecsSinceEpoch();failures_.removeIf([now](qint64 time){return now-time>60000;});
    if(failures_.size()>=20){respond(socket,429,"text/plain","Too many wrong codes. Wait one minute.");return;}
    if(normalizeCode(request.query.value("k"))!=code_){failures_.append(now);respond(socket,403,"text/plain","Wrong or expired access code");return;}
    if(request.path=="/api/programs"&&request.method=="GET"){
        QJsonArray list;for(const auto& program:programs_())list.append(QJsonObject{{"id",program.id},{"name",program.name},{"media",program.media},{"onAir",program.onAir},{"playing",program.playing}});
        respond(socket,200,"application/json",QJsonDocument(QJsonObject{{"programs",list},{"viewers",viewers()}}).toJson(QJsonDocument::Compact));return;
    }
    if(request.method!="POST"){respond(socket,405,"text/plain","POST only");return;}
    if(request.path=="/api/session"){createSession(socket,request.query.value("program").toInt(),request.query.value("quality"));return;}
    const QString session=request.query.value("session");
    if(request.path=="/api/answer"){auto stream=streams_.value(sessions_.value(session,-1));respond(socket,stream&&stream->answer(session,QString::fromUtf8(request.body))?204:404,{},{});return;}
    if(request.path=="/api/close"){closeSession(session);respond(socket,204,{},{});return;}
    respond(socket,404,"text/plain","Not found");
}
void WebMonitorServer::createSession(QTcpSocket* socket,int programId,const QString& quality){
    auto* channel=channel_(programId);if(!channel){respond(socket,404,"text/plain","Program not available");return;}
    if(viewers()>=16){respond(socket,503,"text/plain","Viewer limit reached");return;}
    static const QHash<QString,int> qualities{{"auto",0},{"720",1},{"1080",2},{"2160",3}};const int chosen=qualities.value(quality,-1);const int key=programId*10+(chosen<0?9:chosen);
    auto stream=streams_.value(key);if(!stream){stream=std::make_shared<WebStream>(channel,chosen<0?quality_:std::make_shared<std::atomic<int>>(chosen));streams_.insert(key,stream);}
    QString session;for(int i=0;i<4;++i)session+=QString::number(QRandomGenerator::system()->generate(),16).rightJustified(8,'0');
    rtc::Configuration config;config.portRangeBegin=MediaPortFirst;config.portRangeEnd=MediaPortLast;if(!lan_)config.bindAddress="127.0.0.1";
    QPointer<QTcpSocket> reply=socket;sessions_.insert(session,key);
    stream->addViewer(session,config,this,[this,reply,session](QString sdp){if(reply&&sessions_.contains(session))respond(reply,200,"application/json",QJsonDocument(QJsonObject{{"session",session},{"type","offer"},{"sdp",sdp}}).toJson(QJsonDocument::Compact));},[this,session]{closeSession(session);});
    // A browser that never answers or connects releases its encoder share.
    QTimer::singleShot(20000,this,[this,session]{auto stream=streams_.value(sessions_.value(session,-1));if(stream&&!stream->connected(session))closeSession(session);});
    emit changed();
}
void WebMonitorServer::closeSession(const QString& session){
    if(!sessions_.contains(session))return;const int id=sessions_.take(session);auto stream=streams_.value(id);
    if(stream){stream->removeViewer(session);if(!stream->viewerCount())streams_.remove(id);}emit changed();
}
