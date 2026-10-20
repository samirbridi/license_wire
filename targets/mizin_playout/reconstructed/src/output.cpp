#include "output.hpp"
#include <QtConcurrent>
#include <QElapsedTimer>
#include <QGuiApplication>
#include <QMetaMethod>
#include <QResizeEvent>
#include <QShortcut>
#include <QVBoxLayout>
#include <QWindow>

QualityFeed::QualityFeed(NativeChannel* channel,QSize pixels,QObject* parent):QObject(parent),channel_(channel),pixels_(pixels),scaler_(std::make_shared<LanczosScaler>()){
    connect(channel,&NativeChannel::frameReady,this,[this](const QVideoFrame& frame){submit(frame);});
    connect(&worker_,&QFutureWatcher<Result>::finished,this,[this]{
        const auto r=worker_.result();busy_=false;
        if(r.generation==generation_ && isSignalConnected(QMetaMethod::fromSignal(&QualityFeed::frameReady))){
            if(r.image.isNull()){if(channel_)fallback(channel_->lastFrame(),"Lanczos failed; using Native scaling");}
            else {published_=QVideoFrame(r.image);published_.setStartTime(r.start);published_.setEndTime(r.end);published_.setStreamFrameRate(r.fps);published_.setSubtitleText(r.subtitle);lastMs_=r.ms;++jobs_;emit frameReady(published_);}
        }
        const auto latest=pending_;pending_={};if(latest.isValid() && inUse())start(latest);
    });
}
QualityFeed::~QualityFeed(){worker_.waitForFinished();}
bool QualityFeed::inUse()const{return isSignalConnected(QMetaMethod::fromSignal(&QualityFeed::frameReady));}
void QualityFeed::refresh(){if(channel_)submit(channel_->lastFrame());}
void QualityFeed::fallback(const QVideoFrame& frame,const QString& note){
    if(note_!=note){note_=note;emit warning(note);}
    published_=frame;emit frameReady(frame);
}
void QualityFeed::submit(const QVideoFrame& frame){
    if(!isSignalConnected(QMetaMethod::fromSignal(&QualityFeed::frameReady)))return;
    if(channel_ && channel_->path()!=sourcePath_){sourcePath_=channel_->path();++generation_;pending_={};}
    if(!frame.isValid()){++generation_;pending_={};lastSubmitted_={};published_={};emit frameReady(published_);return;}
    if(frame==lastSubmitted_)return;
    lastSubmitted_=frame;
    if(busy_){pending_=frame;++dropped_;return;} // At most one worker + one newest pending frame.
    start(frame);
}
void QualityFeed::start(const QVideoFrame& frame){
    const auto format=frame.surfaceFormat();
    const auto pixel=format.pixelFormat();
    const bool highDepth=pixel==QVideoFrameFormat::Format_P010 || pixel==QVideoFrameFormat::Format_P016 || pixel==QVideoFrameFormat::Format_YUV420P10 || pixel==QVideoFrameFormat::Format_Y16 || pixel==QVideoFrameFormat::Format_SamplerExternalOES || pixel==QVideoFrameFormat::Format_SamplerRect;
    if(!scaler_->available()){fallback(frame,scaler_->error()+"; using Native scaling");return;}
    if(highDepth || format.colorTransfer()==QVideoFrameFormat::ColorTransfer_ST2084 || format.colorTransfer()==QVideoFrameFormat::ColorTransfer_STD_B67 ||
       frame.rotation()!=QtVideo::Rotation::None || format.rotation()!=QtVideo::Rotation::None || frame.mirrored() || format.isMirrored() || format.viewport()!=QRect(QPoint(0,0),frame.size())){
        fallback(frame,"High-depth, HDR or transformed frame: using Native scaling");return;
    }
    const QSize target=fittedPixels(frame.size(),pixels_);
    if(target==frame.size()){published_=frame;emit frameReady(frame);return;}
    if(target.isEmpty() || qint64(target.width())*target.height()>qint64(4096)*2160){fallback(frame,"Lanczos output exceeds tested pixel budget; using Native scaling");return;}
    QElapsedTimer preparation;preparation.start();const QImage image=frame.toImage();
    if(image.isNull()){fallback(frame,"Frame readback failed; using Native scaling");return;}
    const double prepareMs=double(preparation.nsecsElapsed())/1e6;
    const auto scaler=scaler_;const auto gen=generation_;const auto startTime=frame.startTime(),endTime=frame.endTime();const auto fps=frame.streamFrameRate();const auto subtitle=frame.subtitleText();
    busy_=true;
    worker_.setFuture(QtConcurrent::run([scaler,image,target,gen,startTime,endTime,fps,subtitle,prepareMs]{
        QElapsedTimer timer;timer.start();Result r;r.image=scaler->scale(image,target);r.generation=gen;r.start=startTime;r.end=endTime;r.fps=fps;r.subtitle=subtitle;r.ms=prepareMs+double(timer.nsecsElapsed())/1e6;return r;
    }));
}
QualityFeed* OutputRouter::feed(NativeChannel* channel,QSize pixels){
    for(const auto& item:feeds_)if(item.channel==channel && item.pixels==pixels && item.feed)return item.feed;
    auto* feed=new QualityFeed(channel,pixels,this);feeds_.append({channel,pixels,feed});return feed;
}
void OutputRouter::prune(){
    for(qsizetype i=feeds_.size();i>0;--i){auto& item=feeds_[i-1];if(!item.feed || !item.feed->inUse()){if(item.feed)item.feed->deleteLater();feeds_.removeAt(i-1);}}
}

OutputWindow::OutputWindow(NativeChannel* channel,OutputRouter* router,bool lanczos,QWidget* parent):QWidget(parent),channel_(channel),router_(router),lanczos_(lanczos){
    setAttribute(Qt::WA_DeleteOnClose);setStyleSheet("background:black");
    auto* layout=new QVBoxLayout(this);layout->setContentsMargins(0,0,0,0);layout->setSpacing(0);video_=new QVideoWidget(this);video_->setAspectRatioMode(Qt::KeepAspectRatio);layout->addWidget(video_);
    resizeTimer_.setSingleShot(true);resizeTimer_.setInterval(80);connect(&resizeTimer_,&QTimer::timeout,this,[this]{updateFeed();});
    auto* escape=new QShortcut(QKeySequence(Qt::Key_Escape),this);connect(escape,&QShortcut::activated,this,&QWidget::close);
    connect(qGuiApp,&QGuiApplication::screenRemoved,this,[this](QScreen* screen){if(target_==screen){emit warning("Output display disconnected; output closed");close();}});
    if(!lanczos_)connect(channel,&NativeChannel::frameReady,this,[this](const QVideoFrame& f){present(f);});
    resize(720,405);
}
OutputWindow::~OutputWindow(){disconnect(framesConnection_);disconnect(warningConnection_);if(router_)router_->prune();}
void OutputWindow::openOn(QScreen* screen){
    target_=screen;
    if(screen){
        winId();windowHandle()->setScreen(screen);setGeometry(screen->geometry());
        connect(screen,&QScreen::geometryChanged,this,[this](const QRect& geometry){if(isFullScreen())setGeometry(geometry);resizeTimer_.start();});
        showFullScreen();
    }else show();
    if(windowHandle())connect(windowHandle(),&QWindow::screenChanged,this,[this]{resizeTimer_.start();});
    updateFeed();
}
QSize OutputWindow::targetPixels()const{return displayPixels(video_->size(),video_->devicePixelRatioF());}
void OutputWindow::present(const QVideoFrame& frame){video_->videoSink()->setVideoFrame(frame);if(frame.isValid())++frames_;}
void OutputWindow::updateFeed(){
    if(!channel_ || !router_)return;
    if(!lanczos_){present(channel_->lastFrame());return;}
    if(!feed_ || feed_->pixels()!=targetPixels()){
        disconnect(framesConnection_);disconnect(warningConnection_);feed_=nullptr;router_->prune();
        auto* feed=router_->feed(channel_,targetPixels());feed_=feed;
        framesConnection_=connect(feed,&QualityFeed::frameReady,this,[this](const QVideoFrame& f){present(f);});warningConnection_=connect(feed,&QualityFeed::warning,this,[this](const QString& note){emit warning(note);});
    }
    auto* feed=feed_.data();
    if(feed->lastFrame().isValid())present(feed->lastFrame());feed->refresh();
}
void OutputWindow::resizeEvent(QResizeEvent* event){QWidget::resizeEvent(event);resizeTimer_.start();}
bool OutputWindow::event(QEvent* event){if(event->type()==QEvent::DevicePixelRatioChange)resizeTimer_.start();return QWidget::event(event);}
