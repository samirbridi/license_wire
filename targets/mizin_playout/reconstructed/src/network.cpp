#include "network.hpp"
#include "network_runtime.hpp"
#include <QPainter>
#include <QVideoFrameFormat>
#include <chrono>
#include <cmath>

struct NetworkSender::Impl {NetworkProtocol protocol;std::shared_ptr<NdiApi> ndi;std::shared_ptr<OmtApi> omt;NDIlib_send_instance_t ndiSender=nullptr;omt_send_t* omtSender=nullptr;};
NetworkSender::NetworkSender()=default;
NetworkSender::~NetworkSender(){stop();}
bool NetworkSender::start(NetworkProtocol protocol,const QString& name,qint64 origin){
    stop();error_.clear();address_.clear();videos_=audios_=droppedAudio_=droppedVideo_=connections_=0;
    const auto cleaned=name.trimmed();if(cleaned.isEmpty() || cleaned.toUtf8().size()>200 || cleaned.contains(QChar('\n'))){error_="Enter a source name (1–200 UTF-8 bytes).";return false;}
    if(qEnvironmentVariableIsSet("MIZIN_DISABLE_NETWORK_RUNTIME")){error_="Network runtime unavailable";return false;}
    impl_=std::make_unique<Impl>();impl_->protocol=protocol;const auto utf=cleaned.toUtf8();
    if(protocol==NetworkProtocol::Ndi){
        impl_->ndi=ndiApi();if(!impl_->ndi->ready){error_=impl_->ndi->error;impl_.reset();return false;}
        NDIlib_send_create_t create={};create.p_ndi_name=utf.constData();create.clock_audio=create.clock_video=false;impl_->ndiSender=impl_->ndi->send_create(&create);
        if(!impl_->ndiSender){error_="Could not create NDI sender";impl_.reset();return false;}
        if(const auto* s=impl_->ndi->send_get_source_name(impl_->ndiSender))address_=QString::fromUtf8(s->p_ndi_name);
    }else{
        impl_->omt=omtApi();if(!impl_->omt->ready){error_=impl_->omt->error;impl_.reset();return false;}
        impl_->omtSender=impl_->omt->send_create(utf.constData(),OMTQuality_High);if(!impl_->omtSender){error_="Could not create OMT sender";impl_.reset();return false;}
        char address[2048]={};impl_->omt->send_getaddress(impl_->omtSender,address,sizeof(address));address_=QString::fromUtf8(address);
    }
    QImage black(1280,720,QImage::Format_ARGB32);black.fill(Qt::black);latest_=black;fps_=30;videoTimestamp_=origin;newVideo_=true;clockOrigin_=origin;stopping_=false;running_=true;worker_=std::thread(&NetworkSender::work,this);return true;
}
void NetworkSender::stop(){stopping_=true;wake_.notify_all();if(worker_.joinable())worker_.join();running_=false;
    if(impl_){if(impl_->ndiSender)impl_->ndi->send_destroy(impl_->ndiSender);if(impl_->omtSender)impl_->omt->send_destroy(impl_->omtSender);impl_.reset();}
    std::lock_guard lock(mutex_);audio_.clear();videoQueue_.clear();latest_={};newVideo_=false;connections_=0;
}
QString NetworkSender::error()const{std::lock_guard lock(mutex_);return error_;}
QString NetworkSender::address()const{std::lock_guard lock(mutex_);return address_;}
void NetworkSender::video(const QImage& image,qint64 time,qreal fps){if(!running_)return;std::lock_guard lock(mutex_);while(videoQueue_.size()>=6){videoQueue_.pop_front();++droppedVideo_;}videoQueue_.push_back({image,time,fps>0 && std::isfinite(fps)?qBound(1.0,double(fps),60.0):30});wake_.notify_one();}
void NetworkSender::audio(const AudioPacket& packet){if(!running_ || !audioEnabled_)return;std::lock_guard lock(mutex_);while(audio_.size()>=20){audio_.pop_front();++droppedAudio_;}audio_.push_back(packet);wake_.notify_one();}
void NetworkSender::reset(){std::lock_guard lock(mutex_);audio_.clear();videoQueue_.clear();}
QJsonObject NetworkSender::statistics()const{return {{"running",bool(running_)},{"connections",int(connections_)},{"video_frames",int(videos_)},{"audio_packets",int(audios_)},{"superseded_video",int(droppedVideo_)},{"dropped_audio",int(droppedAudio_)},{"source",address()},{"error",error()}};}
void NetworkSender::work(){
    QElapsedTimer timer;timer.start();qint64 sentVideoAt=-1000000,lastPts=-1;
    while(!stopping_){
        QImage video;AudioPacket audioPacket;qreal fps=30;qint64 pts=0;bool sendVideo=false,sendAudio=false;
        const qint64 now=clockOrigin_+timer.nsecsElapsed()/1000;
        {std::unique_lock lock(mutex_);wake_.wait_for(lock,std::chrono::milliseconds(2));if(stopping_)break;
            if(!audio_.empty()){audioPacket=std::move(audio_.front());audio_.pop_front();sendAudio=audioEnabled_;}
            while(!videoQueue_.empty() && videoQueue_.front().time+40000<=now){if(newVideo_)++droppedVideo_;auto v=std::move(videoQueue_.front());videoQueue_.pop_front();latest_=v.image;videoTimestamp_=v.time;fps_=v.fps;newVideo_=true;}
            fps=fps_;const auto interval=qint64(1000000/fps);
            if(!latest_.isNull() && now-sentVideoAt>=interval && now>=videoTimestamp_+40000){video=latest_;pts=qMax(lastPts+1,newVideo_?videoTimestamp_:now-40000);newVideo_=false;sendVideo=true;}
        }
        if(sendAudio){auto planar=planarAudio(audioPacket);
            if(impl_->ndi){NDIlib_audio_frame_v2_t a={};a.sample_rate=48000;a.no_channels=2;a.no_samples=audioPacket.frames();a.channel_stride_in_bytes=a.no_samples*sizeof(float);a.p_data=reinterpret_cast<float*>(planar.data());a.timecode=audioPacket.timestampUs*10;impl_->ndi->send_send_audio_v2(impl_->ndiSender,&a);}
            else{OMTMediaFrame a={};a.Type=OMTFrameType_Audio;a.Codec=OMTCodec_FPA1;a.Timestamp=audioPacket.timestampUs*10;a.SampleRate=48000;a.Channels=2;a.SamplesPerChannel=audioPacket.frames();a.Data=planar.data();a.DataLength=int(planar.size());impl_->omt->send(impl_->omtSender,&a);}++audios_;
        }
        if(sendVideo){
            int n=qRound(fps*1000),d=1000;if(qAbs(fps-29.97)<.01){n=30000;d=1001;}else if(qAbs(fps-59.94)<.01){n=60000;d=1001;}
            if(impl_->ndi){NDIlib_video_frame_v2_t v={};v.xres=video.width();v.yres=video.height();v.FourCC=NDIlib_FourCC_video_type_BGRA;v.frame_rate_N=n;v.frame_rate_D=d;v.picture_aspect_ratio=float(video.width())/video.height();v.frame_format_type=NDIlib_frame_format_type_progressive;v.timecode=pts*10;v.p_data=const_cast<uint8_t*>(video.constBits());v.line_stride_in_bytes=video.bytesPerLine();impl_->ndi->send_send_video_v2(impl_->ndiSender,&v);connections_=impl_->ndi->send_get_no_connections(impl_->ndiSender,0);}
            else{OMTMediaFrame v={};v.Type=OMTFrameType_Video;v.Codec=OMTCodec_BGRA;v.Timestamp=pts*10;v.Width=video.width();v.Height=video.height();v.Stride=video.bytesPerLine();v.FrameRateN=n;v.FrameRateD=d;v.AspectRatio=float(video.width())/video.height();v.ColorSpace=OMTColorSpace_BT709;v.Data=const_cast<uchar*>(video.constBits());v.DataLength=int(video.sizeInBytes());impl_->omt->send(impl_->omtSender,&v);connections_=impl_->omt->send_connections(impl_->omtSender);}lastPts=pts;sentVideoAt=now;++videos_;
        }
    }
}
NetworkBus::NetworkBus(NativeChannel* channel,QObject* parent):QObject(parent),channel_(channel){
    connect(channel,&NativeChannel::frameReady,this,&NetworkBus::frame);connect(channel,&NativeChannel::audioReady,this,[this](const AudioPacket& p){for(auto& sender:senders_)sender.audio(p);});connect(channel,&NativeChannel::audioReset,this,[this]{for(auto& sender:senders_)sender.reset();});
}
bool NetworkBus::start(NetworkProtocol p,const QString& name){auto& s=sender(p);s.setAudioEnabled(audioEnabled_);if(!s.start(p,name,channel_->programTimeUs())){emit warning(s.error());return false;}frame(channel_->lastFrame());return true;}
void NetworkBus::stop(NetworkProtocol p){sender(p).stop();}
void NetworkBus::setAudioEnabled(bool value){audioEnabled_=value;for(auto& sender:senders_)sender.setAudioEnabled(value);}
void NetworkBus::frame(const QVideoFrame& frame){
    if(!senders_[0].running() && !senders_[1].running())return;QImage image;QString note;
    if(frame.isValid()){
        const auto f=frame.surfaceFormat();if(f.colorTransfer()==QVideoFrameFormat::ColorTransfer_ST2084 || f.colorTransfer()==QVideoFrameFormat::ColorTransfer_STD_B67){note="HDR network output requires tone mapping; sending black";}
        else if(frame.width()<=4096 && frame.height()<=4096 && qint64(frame.width())*frame.height()<=qint64(4096)*2160)image=frame.toImage().convertToFormat(QImage::Format_ARGB32);
        else note="Network frame exceeds tested pixel budget; sending black";
    }
    if(note!=lastWarning_){lastWarning_=note;if(!note.isEmpty())emit warning(note);}
    if(image.isNull()){image=QImage(1280,720,QImage::Format_ARGB32);image.fill(Qt::black);}
    const qreal fps=frame.streamFrameRate()>0?frame.streamFrameRate():frame.surfaceFormat().frameRate();
    const qint64 time=frame.isValid()?channel_->videoTimeUs():channel_->programTimeUs();for(auto& sender:senders_)sender.video(image,time,fps);
}
