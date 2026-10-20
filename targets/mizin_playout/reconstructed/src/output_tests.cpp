#include "smoke.hpp"
#include "output.hpp"
#include <QApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QThread>
#include <QWindow>
#include <functional>

static bool waitFor(const std::function<bool()>& predicate,int timeout=12000){
    QElapsedTimer clock;clock.start();while(!predicate() && clock.elapsed()<timeout){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();
}
static void pumpFor(int ms){QElapsedTimer t;t.start();waitFor([&]{return t.elapsed()>=ms;},ms+1000);}
int runOutputTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);
    QJsonArray tests,measurements,screens;bool success=true;
    auto record=[&](const QString& name,bool pass,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=pass;tests.append(details);success&=pass;};
    LanczosScaler scaler;record("pinned_lgpl_scaler_runtime",scaler.available(),{{"error",scaler.error()}});
    record("4k_to_1080_fit",fittedPixels({3840,2160},{1920,1080})==QSize(1920,1080));
    record("1080_to_4k_fit",fittedPixels({1920,1080},{3840,2160})==QSize(3840,2160));
    const auto portrait=fittedPixels({1080,1920},{1920,1080});
    record("portrait_aspect_is_preserved",portrait.height()==1080 && qAbs(double(portrait.width())/portrait.height()-1080.0/1920)<.002);
    record("hidpi_uses_physical_pixels",displayPixels({1536,864},1.25)==QSize(1920,1080));
    {
        QImage source(1920,1080,QImage::Format_RGB32);source.fill(QColor(32,96,192));QElapsedTimer time;time.start();const auto up=scaler.scale(source,{3840,2160});const double upMs=time.nsecsElapsed()/1e6;
        record("lanczos_1080_to_4k_pixels",up.size()==QSize(3840,2160) && up.pixelColor(1920,1080)==QColor(32,96,192));
        time.restart();const auto down=scaler.scale(up,{1920,1080});const double downMs=time.nsecsElapsed()/1e6;
        record("lanczos_4k_to_1080_pixels",down.size()==source.size() && down.pixelColor(960,540)==QColor(32,96,192));
        measurements.append(QJsonObject{{"scope","single constant-image resample, not playback throughput"},{"up_ms",upMs},{"down_ms",downMs}});
    }
    NativeChannel injected(false);OutputRouter router;
    auto* feed=router.feed(&injected,{1280,720});QPointer<QualityFeed> guard=feed;QVideoSink mirror1,mirror2;
    auto connection1=QObject::connect(feed,&QualityFeed::frameReady,&mirror1,[&](const QVideoFrame& f){mirror1.setVideoFrame(f);});
    auto* shared=router.feed(&injected,{1280,720});
    auto connection2=QObject::connect(shared,&QualityFeed::frameReady,&mirror2,[&](const QVideoFrame& f){mirror2.setVideoFrame(f);});
    QImage small(640,360,QImage::Format_RGB32);small.fill(QColor(96,192,64));QVideoFrame input(small);input.setStartTime(123000);input.setEndTime(156333);
    emit injected.frameReady(input);emit injected.frameReady(input);
    const bool scaled=waitFor([&]{return feed->jobs()>=1;});
    record("mirrors_share_one_scaled_frame",scaled && shared==feed && feed->jobs()==1 && mirror1.videoFrame()==mirror2.videoFrame() && mirror1.videoFrame().size()==QSize(1280,720) && mirror1.videoFrame().startTime()==123000);
    const int before=feed->jobs();
    for(int i=0;i<40;++i){QVideoFrame burst(small);burst.setStartTime(1000000+i*33333);emit injected.frameReady(burst);}
    const qint64 finalTimestamp=1000000+39*33333;
    const bool latest=waitFor([&]{return feed->idle() && feed->lastFrame().startTime()==finalTimestamp;});
    record("scaler_queue_is_bounded_latest_wins",latest && feed->jobs()-before<=2 && feed->dropped()>=38,{{"jobs",feed->jobs()-before},{"superseded_frames",feed->dropped()}});
    QVideoFrame inFlight(small);inFlight.setStartTime(9999999);emit injected.frameReady(inFlight);emit injected.frameReady(QVideoFrame{});
    waitFor([&]{return feed->idle();});
    record("black_invalidates_pending_scaled_frame",!feed->lastFrame().isValid() && !mirror1.videoFrame().isValid());
    QVideoFrame rotated(small);rotated.setRotation(QtVideo::Rotation::Clockwise90);emit injected.frameReady(rotated);
    record("transformed_frame_uses_native_fallback",mirror1.videoFrame()==rotated && mirror1.videoFrame().rotation()==QtVideo::Rotation::Clockwise90);
    QVideoFrameFormat highDepth({64,64},QVideoFrameFormat::Format_P010);QVideoFrame precise(highDepth);emit injected.frameReady(precise);
    record("10bit_frame_preserves_native_precision",mirror1.videoFrame()==precise && mirror1.videoFrame().pixelFormat()==QVideoFrameFormat::Format_P010);
    QObject::disconnect(connection1);QObject::disconnect(connection2);router.prune();QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);
    record("unused_scaler_feed_is_released",guard.isNull());

    for(auto* screen:QGuiApplication::screens()){const auto pixels=displayPixels(screen->geometry().size(),screen->devicePixelRatio());screens.append(QJsonObject{{"name",screen->name()},{"logical_w",screen->geometry().width()},{"logical_h",screen->geometry().height()},{"pixel_w",pixels.width()},{"pixel_h",pixels.height()},{"dpr",screen->devicePixelRatio()},{"refresh_hz",screen->refreshRate()}});}
    NativeChannel channel(false);channel.setLoop(true);QStringList errors;
    QObject::connect(&channel,&NativeChannel::failed,&channel,[&](const QString& e){errors<<e;});
    const QString uhd=QDir(directory).absoluteFilePath("h264-3840x2160.mp4"),hd=QDir(directory).absoluteFilePath("h264-1920x1080.mp4");
    channel.load(uhd);const bool ready4k=waitFor([&]{return channel.lastFrame().size()==QSize(3840,2160) && channel.frames()>=8;});
    record("native_4k_h264_decode",ready4k,{{"frames",channel.frames()},{"error",errors.join("; ")}});
    auto* window=new OutputWindow(&channel,&router,false);QPointer<OutputWindow> windowGuard=window;
    QScreen* screen=QGuiApplication::primaryScreen();window->openOn(screen);pumpFor(250);
    record("detected_screen_fullscreen_geometry",screen && window->isFullScreen() && window->windowHandle()->screen()==screen && window->geometry()==screen->geometry() && window->video()->aspectRatioMode()==Qt::KeepAspectRatio);
    record("native_output_preserves_decoded_frame",ready4k && window->video()->videoSink()->videoFrame().size()==QSize(3840,2160) && window->frames()>0);
    window->close();QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);record("closing_output_preserves_program",windowGuard.isNull() && channel.playing());
    for(int i=0;i<2;++i){
        const QSize source=i==0?QSize(3840,2160):QSize(1920,1080),target=i==0?QSize(1920,1080):QSize(3840,2160);
        QVideoSink sink;auto* quality=router.feed(&channel,target);
        int count=0;QElapsedTimer elapsed;elapsed.start();
        auto connection=QObject::connect(quality,&QualityFeed::frameReady,&sink,[&](const QVideoFrame& f){if(f.isValid() && f.size()==target && channel.lastFrame().size()==source){sink.setVideoFrame(f);++count;}});
        if(i==1)channel.load(hd);else quality->refresh();
        const bool delivered=waitFor([&]{return count>=8 && channel.lastFrame().size()==source;});
        record(i==0?"native_4k_downscale_1080_stream":"native_1080_upscale_4k_stream",delivered,{{"delivered_frames",count},{"elapsed_ms",elapsed.elapsed()},{"last_service_ms",quality->lastMs()},{"superseded_frames",quality->dropped()}});
        measurements.append(QJsonObject{{"source_w",source.width()},{"source_h",source.height()},{"output_w",target.width()},{"output_h",target.height()},{"frames",count},{"elapsed_ms",elapsed.elapsed()},{"last_service_ms",quality->lastMs()},{"scope","short functional stream; not sustained performance or AV sync qualification"}});
        QObject::disconnect(connection);router.prune();QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);
    }
    channel.black();
    QJsonObject result{{"result",success?"PASS":"FAIL"},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"scope","Synthetic SDR resampling and short native 1080p/4K H.264 tests; detected desktop geometry only, not physical display or vendor-specific qualification"},{"tests",tests},{"measurements",measurements},{"screens",screens}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return success?0:2;
}
