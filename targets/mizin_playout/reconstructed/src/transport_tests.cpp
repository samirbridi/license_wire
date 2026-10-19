#include "smoke.hpp"
#include "playlist.hpp"
#include "compositor.hpp"
#include <QApplication>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QThread>
#include <functional>

static bool until(const std::function<bool()>& predicate,int timeout=8000) {
    QElapsedTimer timer;timer.start();
    while(!predicate() && timer.elapsed()<timeout) {QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}
    QCoreApplication::processEvents();return predicate();
}
static void pump(int milliseconds){QElapsedTimer t;t.start();until([&]{return t.elapsed()>=milliseconds;},milliseconds+1000);}

int runTransportTests(const QString& directory,const QString& resultPath) {
    QJsonArray tests;bool pass=true;
    auto record=[&](const QString& name,bool ok,QJsonObject detail=QJsonObject{}){detail["name"]=name;detail["pass"]=ok;tests.append(detail);pass&=ok;};
    const QString source=QDir(directory).absoluteFilePath("01-h264.mp4");
    const QString second=QDir(directory).absoluteFilePath("03-h264.mkv");
    Cue trimmed{source,500,1600,Transition::Cut,400,0,0};
    Show show{{source,second},{directory},{trimmed,Cue{second,200,1400,Transition::Dissolve,350,100,200}}},loaded;
    record("schema2_roundtrip_preserves_cues",Show::read(show.json(),loaded) && loaded.json()==show.json());
    const QJsonObject legacy{{"schema",1},{"library",QJsonArray{source}},{"folders",QJsonArray{}},{"playlist",QJsonArray{source,source}}};
    record("schema1_migration_and_duplicate_files",Show::read(legacy,loaded) && loaded.cues.size()==2 && loaded.cues[0].out==-1);
    auto invalid=show.json();auto badCue=trimmed.json();badCue["out_ms"]=400;invalid["playlist"]=QJsonArray{badCue};
    const auto before=loaded.json();record("invalid_show_is_atomic",!Show::read(invalid,loaded) && loaded.json()==before);
    badCue=trimmed.json();badCue["in_ms"]=0.25;Cue dummy;
    record("fractional_and_invalid_range_rejected",!Cue::read(badCue,dummy) && !Cue{source,2000,1000}.error().isEmpty());
    QImage red(32,18,QImage::Format_RGB32),blue(32,18,QImage::Format_RGB32);red.fill(Qt::red);blue.fill(Qt::blue);
    auto pixel=composeImages(red,blue,.5,Transition::Dissolve).pixelColor(16,9);
    record("dissolve_pixel_mix",qAbs(pixel.red()-128)<=2 && qAbs(pixel.blue()-128)<=2 && pixel.green()==0);
    record("fade_black_midpoint",composeImages(red,blue,.5,Transition::FadeBlack).pixelColor(16,9)==QColor(Qt::black));
    record("single_clip_fade_pixel",composeImages({},red,.5,Transition::Dissolve).pixelColor(16,9).red()>=126 && composeImages({},red,.5,Transition::Dissolve).pixelColor(16,9).red()<=129);
    NativeChannel channel(false);PlaylistController order(&channel);
    QStringList errors;QObject::connect(&channel,&NativeChannel::failed,&channel,[&](const QString& e){errors<<e;});
    QList<qint64> timestamps;int starts=0;bool track=true;
    QObject::connect(&channel,&NativeChannel::started,&channel,[&]{++starts;});
    QObject::connect(&channel,&NativeChannel::frameReady,&channel,[&](const QVideoFrame& f){if(track && f.isValid())timestamps<<f.startTime()/1000;});
    order.start({trimmed,Cue{second}},0);
    const bool ended=until([&]{return channel.ended();});pump(150);
    bool bounds=!timestamps.isEmpty();for(auto t:timestamps)bounds &= t>=trimmed.in-2 && t<trimmed.out;
    record("trim_in_out_exclusive",ended && bounds,{{"frames",timestamps.size()},{"first_ms",timestamps.value(0,-1)},{"last_ms",timestamps.isEmpty()?-1:timestamps.last()}});
    record("manual_mode_holds_without_advancing",ended && starts==1 && !channel.playing() && channel.lastFrame().isValid());
    track=false;order.stop();pump(80);errors.clear();
    Cue solo{source,400,1600,Transition::Cut,400,300,300};int composed=channel.composedFrames();
    order.start({solo},0);bool soloEnded=until([&]{return channel.ended();});
    record("single_clip_entry_exit_fades",soloEnded && channel.composedFrames()>composed+4 && !channel.lastFrame().isValid(),{{"composed_frames",channel.composedFrames()-composed}});
    for(auto transition:{Transition::Dissolve,Transition::FadeBlack}) {
        order.stop();pump(80);starts=0;composed=channel.composedFrames();order.setSequential(true);
        order.start({Cue{source,200,1800},Cue{second,200,1700,transition,400,0,0}},0);
        const bool complete=until([&]{return order.current()==1 && channel.ended();},12000);
        record(transition==Transition::Dissolve?"sequential_dissolve":"sequential_fade_black",complete && starts==2 && channel.composedFrames()>composed+3,{{"starts",starts},{"composed_frames",channel.composedFrames()-composed}});
    }
    order.stop();pump(80);order.setSequential(false);order.start({Cue{source,200,2400,Transition::Cut,500,900,0}},0);
    bool moving=until([&]{return channel.position()>450 && channel.playing();});channel.togglePause();pump(100);
    const auto pausePosition=channel.position();const auto pauseImage=channel.lastFrame().toImage();pump(350);
    record("pause_freezes_transition",moving && !channel.playing() && qAbs(channel.position()-pausePosition)<50 && channel.lastFrame().toImage()==pauseImage);
    channel.togglePause();record("resume_transition_completes",until([&]{return channel.position()>1300 && channel.playing();}));
    errors.clear();const auto pathBefore=channel.path();channel.loadCue(Cue{second,500,999999});
    const bool rejected=until([&]{return !errors.isEmpty();});
    record("out_beyond_duration_preserves_program",rejected && channel.path()==pathBefore,{{"error",errors.join("; ")}});
    order.stop();pump(80);starts=0;order.setRepeat(true);order.setSequential(true);order.start({Cue{source,300,1100}},0);
    const bool repeats=until([&]{return starts>=3;},12000);
    record("single_item_sequence_repeat",repeats,{{"starts",starts}});
    order.setSequential(false);order.stop();
    QJsonObject result{{"result",pass?"PASS":"FAIL"},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},
        {"scope","Native synthetic 640x360 media; functional ranges, compositor pixels and transport state. Not physical display or AV sync qualification."},{"tests",tests}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return pass?0:2;
}
