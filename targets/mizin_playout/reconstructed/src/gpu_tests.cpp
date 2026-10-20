#include "gpu_scaler.hpp"
#include "output.hpp"
#include "smoke.hpp"
#include <QApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QOffscreenSurface>
#include <QPainter>
#include <QThread>
#include <QWindow>
#include <algorithm>
#include <cmath>
#include <functional>

static bool waitFor(const std::function<bool()>& predicate,int timeout=12000){QElapsedTimer t;t.start();while(!predicate() && t.elapsed()<timeout){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(1);}QCoreApplication::processEvents();return predicate();}
static void pump(int ms){QElapsedTimer t;t.start();waitFor([&]{return t.elapsed()>=ms;},ms+1000);}
static double percentile(QList<double> values,double p){if(values.isEmpty())return -1;std::sort(values.begin(),values.end());return values[qMin(values.size()-1,qsizetype(p*(values.size()-1)))];}
int runGpuTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);QJsonArray tests,streams;QJsonObject device,quality;bool success=true;
    auto record=[&](const QString& name,bool pass,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=pass;tests.append(details);success&=pass;qInfo().noquote()<<name<<(pass?"PASS":"FAIL")<<QJsonDocument(details).toJson(QJsonDocument::Compact);};
    QSurfaceFormat format;format.setVersion(3,3);format.setProfile(QSurfaceFormat::CoreProfile);
    QOpenGLContext context;context.setFormat(format);bool created=context.create();QOffscreenSurface offscreen;offscreen.setFormat(context.format());offscreen.create();
    const bool current=created && context.makeCurrent(&offscreen);record("opengl_context",current);
    if(current){
        GpuLanczos gpu;const bool initialized=gpu.initialize();record("shader_compiles_and_links",initialized,{{"error",gpu.error()}});device=gpu.device();
        if(initialized){
            QImage pattern(96,64,QImage::Format_RGB32);
            for(int y=0;y<pattern.height();++y)for(int x=0;x<pattern.width();++x)pattern.setPixelColor(x,y,QColor((x*7+y*3)%256,(x*3+y*11)%256,(x*13+y*5)%256));
            bool ok=gpu.scale(pattern,pattern.size());const auto identity=gpu.readback();int maxError=0;
            if(!identity.isNull())for(int y=0;y<pattern.height();++y)for(int x=0;x<pattern.width();++x){auto a=pattern.pixelColor(x,y),b=identity.pixelColor(x,y);maxError=qMax(maxError,qMax(qAbs(a.red()-b.red()),qMax(qAbs(a.green()-b.green()),qAbs(a.blue()-b.blue()))));}
            record("identity_preserves_pixels_and_orientation",ok && identity.size()==pattern.size() && maxError<=1,{{"max_channel_error",maxError}});
            QImage checker(128,128,QImage::Format_RGB32);for(int y=0;y<128;++y)for(int x=0;x<128;++x)checker.setPixelColor(x,y,((x+y)&1)?Qt::white:Qt::black);
            ok=gpu.scale(checker,{64,64});const auto reduced=gpu.readback();int alias=0;
            if(!reduced.isNull())for(int y=8;y<56;++y)for(int x=8;x<56;++x)alias=qMax(alias,qAbs(reduced.pixelColor(x,y).red()-128));
            record("downscale_kernel_suppresses_checkerboard_aliasing",ok && !reduced.isNull() && alias<=2,{{"maximum_error_from_midgray",alias}});
            QImage wave(128,80,QImage::Format_RGB32);constexpr double pi=3.141592653589793;
            auto ideal=[&](double x,double y){return 128+48*std::cos(2*pi*x/8)+48*std::sin(2*pi*y/10);};
            for(int y=0;y<wave.height();++y)for(int x=0;x<wave.width();++x){const int c=qRound(ideal(x,y));wave.setPixelColor(x,y,QColor(c,c,c));}
            ok=gpu.scale(wave,{256,160});const auto enlarged=gpu.readback();const auto linear=wave.scaled(256,160,Qt::IgnoreAspectRatio,Qt::SmoothTransformation);
            double gpuMse=0,linearMse=0;int samples=0;
            if(!enlarged.isNull())for(int y=16;y<144;++y)for(int x=16;x<240;++x){const double expected=ideal((x+.5)/2-.5,(y+.5)/2-.5);gpuMse+=std::pow(enlarged.pixelColor(x,y).red()-expected,2);linearMse+=std::pow(linear.pixelColor(x,y).red()-expected,2);++samples;}
            gpuMse/=qMax(1,samples);linearMse/=qMax(1,samples);
            record("upscale_reconstructs_wave_better_than_linear",ok && samples>0 && gpuMse<linearMse,{{"gpu_mse",gpuMse},{"qt_smooth_mse",linearMse}});
            QImage constant(1920,1080,QImage::Format_RGB32);constant.fill(QColor(32,96,192));ok=gpu.scale(constant,{3840,2160});auto uhd=gpu.readback();
            record("gpu_1080_to_4k_pixels",ok && uhd.size()==QSize(3840,2160) && uhd.pixelColor(1920,1080)==QColor(32,96,192));
            ok=gpu.scale(uhd,{1920,1080});const auto hd=gpu.readback();record("gpu_4k_to_1080_pixels",ok && hd.size()==constant.size() && hd.pixelColor(960,540)==QColor(32,96,192));
            record("excessive_reduction_is_rejected",!gpu.scale(checker,{16,16}));
            quality={{"sdr_gamma_encoded_rgb",true},{"gpu_wave_mse",gpuMse},{"qt_smooth_wave_mse",linearMse},{"identity_max_error",maxError},{"checkerboard_max_error",alias},{"timer_query_supported",gpu.timerAvailable()}};
            QImage board(800,260,QImage::Format_RGB32);board.fill(QColor("#10141c"));QPainter painter(&board);painter.setPen(Qt::white);painter.setFont(QFont("Segoe UI",10));
            painter.drawText(16,24,"SDR TEST PATTERN / 2x UPSCALE — native GPU readback for QA only");
            painter.drawImage(16,58,wave.scaled(256,160,Qt::IgnoreAspectRatio,Qt::FastTransformation));painter.drawImage(280,58,linear);painter.drawImage(544,58,enlarged);
            painter.drawText(16,242,"Nearest (reference)");painter.drawText(280,242,"Qt Smooth");painter.drawText(544,242,"GPU Lanczos-3");painter.end();
            board.save(QFileInfo(resultPath).absolutePath()+"/gpu-quality-proof.png");
        }
        gpu.release();context.doneCurrent();
    }
    NativeChannel injected(false);OutputRouter router;auto cache=router.gpuCache(&injected);
    QImage small(320,180,QImage::Format_RGB32);small.fill(Qt::red);QVideoFrame red(small);red.setStartTime(123000);
    cache->image(red);cache->image(red);record("mirrors_share_input_readback",router.gpuCache(&injected)==cache && cache->conversions()==1);
    NativeChannel other(false);record("independent_programs_have_independent_caches",router.gpuCache(&other)!=cache);
    auto* output=new OutputWindow(&injected,&router,OutputScaling::GpuLanczos);output->openOn(nullptr);pump(250);emit injected.frameReady(red);
    // The QA process is launched hidden. A non-exposed first window does not
    // receive repaint events; explicitly render its framebuffer for this check.
    const bool exposed=output->windowHandle() && output->windowHandle()->isExposed();
    auto outputImage=output->gpu()?output->gpu()->grabFramebuffer():QImage{};
    const bool painted=output->gpu() && output->gpu()->frames()>0 && !outputImage.isNull();
    record("gpu_output_framebuffer_pixels",painted && output->gpuActive() && outputImage.pixelColor(outputImage.width()/2,outputImage.height()/2)==Qt::red,{{"valid",output->gpu() && output->gpu()->isValid()},{"window_exposed",exposed},{"error",output->gpu()?output->gpu()->error():"no surface"},{"frames",output->gpu()?output->gpu()->frames():0}});
    if(painted){
        for(int i=0;i<40;++i){QVideoFrame f(small);f.setStartTime(1000000+i*33333);emit injected.frameReady(f);}
        const auto last=1000000+39*33333;output->gpu()->grabFramebuffer();const bool latest=output->gpu()->timestamp()==last;
        record("gpu_surface_coalesces_burst_to_latest",latest && output->gpu()->superseded()>=38,{{"superseded_frames",output->gpu()->superseded()}});
        emit injected.frameReady(QVideoFrame{});pump(60);auto black=output->gpu()->grabFramebuffer();record("black_clears_gpu_output",output->gpu()->timestamp()==-1 && !black.isNull() && black.pixelColor(black.width()/2,black.height()/2)==Qt::black);
        QVideoFrame rotated(small);rotated.setRotation(QtVideo::Rotation::Clockwise90);emit injected.frameReady(rotated);record("gpu_rotation_falls_back_to_native",!output->gpuActive() && output->video()->videoSink()->videoFrame()==rotated);
        QVideoFrame precise(QVideoFrameFormat({64,64},QVideoFrameFormat::Format_P010));emit injected.frameReady(precise);record("gpu_10bit_falls_back_without_requantizing",!output->gpuActive() && output->video()->videoSink()->videoFrame()==precise);
        emit injected.frameReady(red);waitFor([&]{return output->gpuActive();});record("gpu_resumes_after_compatible_frame",output->gpuActive());
    }
    output->close();QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);
    qputenv("MIZIN_DISABLE_GPU_SCALER","1");auto* fallback=new OutputWindow(&injected,&router,OutputScaling::GpuLanczos);fallback->openOn(nullptr);emit injected.frameReady(red);
    record("unavailable_gpu_uses_native",!fallback->gpu() && fallback->video()->videoSink()->videoFrame()==red);fallback->close();QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);qunsetenv("MIZIN_DISABLE_GPU_SCALER");
    for(int i=0;i<2;++i){
        NativeChannel channel(false);channel.setLoop(true);auto inputCache=router.gpuCache(&channel);
        GpuSurface surface(inputCache);const QSize target=i==0?QSize(1920,1080):QSize(3840,2160);surface.setFixedSize(target);surface.show();
        QObject::connect(&channel,&NativeChannel::frameReady,&surface,[&](const QVideoFrame& f){surface.submit(f);});
        channel.load(QDir(directory).absoluteFilePath(i==0?"h264-3840x2160.mp4":"h264-1920x1080.mp4"));
        const bool ready=waitFor([&]{return surface.frames()>=8;});const auto actualFramebuffer=surface.grabFramebuffer().size();record(i==0?"stream_1080_framebuffer_size":"stream_4k_framebuffer_size",actualFramebuffer==target,{{"actual_w",actualFramebuffer.width()},{"actual_h",actualFramebuffer.height()}});QList<double> service,gpuTimes;int previous=surface.frames();const int startFrames=previous;const qint64 startSource=channel.frames();
        auto monitor=QObject::connect(&surface,&QOpenGLWidget::frameSwapped,&surface,[&]{if(surface.frames()!=previous){previous=surface.frames();service<<surface.serviceMs();if(surface.gpuMs()>=0)gpuTimes<<surface.gpuMs();}});
        QElapsedTimer clock;clock.start();pump(4000);const auto elapsed=clock.elapsed();QObject::disconnect(monitor);
        const QJsonObject stats{{"direction",i==0?"4K to 1080p":"1080p to 4K"},{"output_w",target.width()},{"output_h",target.height()},{"elapsed_ms",elapsed},{"rendered_unique_frames",surface.frames()-startFrames},{"source_frames",channel.frames()-startSource},{"render_fps",(surface.frames()-startFrames)*1000.0/elapsed},{"service_cpu_median_ms",percentile(service,.5)},{"service_cpu_p95_ms",percentile(service,.95)},{"gpu_filter_median_ms",percentile(gpuTimes,.5)},{"gpu_filter_p95_ms",percentile(gpuTimes,.95)},{"superseded_frames",surface.superseded()},{"device",surface.device()},{"framebuffer_pixels",QString::number(qRound(surface.width()*surface.devicePixelRatioF()))+"x"+QString::number(qRound(surface.height()*surface.devicePixelRatioF()))},{"scope","4-second native stream; CPU service includes input readback/upload/submission; async GPU queries cover filter passes only; excludes scanout and AV sync"}};
        record(i==0?"gpu_native_4k_downscale_stream":"gpu_native_1080_upscale_stream",ready && surface.frames()-startFrames>=8,stats);streams.append(stats);channel.black();surface.close();
    }
    const QJsonObject result{{"result",success?"PASS":"FAIL"},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"device",device},{"quality",quality},{"tests",tests},{"streams",streams},{"scope","GPU SDR 8-bit scaler functional/quality tests and bounded playback measurements; not AMD/macOS/Linux, physical 4K, AV sync or show-duration certification"}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return success?0:2;
}
