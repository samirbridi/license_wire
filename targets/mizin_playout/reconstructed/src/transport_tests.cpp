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
#include <QDebug>
#include <functional>

static bool until(const std::function<bool()>& predicate,int timeout=8000) {
    QElapsedTimer timer;timer.start();
    while(!predicate() && timer.elapsed()<timeout) {QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}
    QCoreApplication::processEvents();return predicate();
}
static void pump(int milliseconds){QElapsedTimer t;t.start();until([&]{return t.elapsed()>=milliseconds;},milliseconds+1000);}

int runTransportTests(const QString& directory,const QString& resultPath) {
    QJsonArray tests;bool pass=true;
    auto record=[&](const QString& name,bool ok,QJsonObject detail=QJsonObject{}){detail["name"]=name;detail["pass"]=ok;tests.append(detail);pass&=ok;qInfo().noquote()<<name<<ok;};
    const QString source=QDir(directory).absoluteFilePath("01-h264.mp4");
    const QString second=QDir(directory).absoluteFilePath("03-h264.mkv");
    Cue trimmed{source,500,1600,Transition::Cut,400,0,0};
    Show show{{source,second},{directory},{trimmed,Cue{second,200,1400,Transition::Dissolve,350,100,200}}},loaded;
    record("schema3_roundtrip_preserves_cues_and_single_output",Show::read(show.json(),loaded) && loaded.json()==show.json()&&loaded.outputs.programs==1&&loaded.outputs.displays==1);
    auto schema2=show.json();schema2["schema"]=2;schema2.remove("outputs");
    record("schema2_migrates_to_single_program",Show::read(schema2,loaded)&&loaded.cues.size()==2&&loaded.outputs.programs==1&&loaded.outputs.displays==1);
    show.outputs={2,3,{0,0,1}};record("schema3_preserves_mirrored_and_independent_routes",Show::read(show.json(),loaded)&&loaded.outputs.json()==show.outputs.json());
    const auto saved=loaded.json();auto rejectOutput=[&](const QJsonValue& value){auto broken=show.json();broken["outputs"]=value;return !Show::read(broken,loaded)&&loaded.json()==saved;};
    record("output_config_rejects_missing_or_fractional_counts_atomically",rejectOutput(QJsonValue{})&&rejectOutput(QJsonObject{{"programs",1.5},{"displays",QJsonArray{QJsonObject{{"program",0}}}}}));
    record("output_config_rejects_zero_and_excess_capacity",rejectOutput(QJsonObject{{"programs",0},{"displays",QJsonArray{QJsonObject{{"program",0}}}}})&&rejectOutput(QJsonObject{{"programs",3},{"displays",QJsonArray{QJsonObject{{"program",0}}}}})&&rejectOutput(QJsonObject{{"programs",1},{"displays",QJsonArray{}}})&&rejectOutput(QJsonObject{{"programs",1},{"displays",QJsonArray{QJsonObject{{"program",0}},QJsonObject{{"program",0}},QJsonObject{{"program",0}},QJsonObject{{"program",0}}}}}));
    record("output_config_rejects_disabled_or_fractional_source",rejectOutput(QJsonObject{{"programs",1},{"displays",QJsonArray{QJsonObject{{"program",1}}}}})&&rejectOutput(QJsonObject{{"programs",2},{"displays",QJsonArray{QJsonObject{{"program",.5}}}}}));
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
    QStringList errors;QObject::connect(&channel,&NativeChannel::failed,&channel,[&](const QString& e){errors<<e;qWarning().noquote()<<e;});
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
    order.stop();pump(80);starts=0;timestamps.clear();track=true;channel.setLoop(true);
    order.start({Cue{source,300,1100}},0);
    const bool looped=until([&]{return channel.frames()>=55;},9000);
    bool loopBounds=!timestamps.isEmpty();for(auto t:timestamps)loopBounds &= t>=298 && t<1100;
    record("manual_loop_repeats_only_trimmed_range",looped && loopBounds && starts==1 && channel.playing(),{{"frames",timestamps.size()}});
    track=false;channel.setLoop(false);
    order.stop();pump(80);starts=0;errors.clear();order.setSequential(true);
    order.start({Cue{source,200,1400},Cue{QDir(directory).absoluteFilePath("missing-next.mp4")}},0);
    const bool failedNextStopped=until([&]{return channel.ended() && !errors.isEmpty();});
    record("failed_next_item_stops_sequence",failedNextStopped && starts==1 && channel.path()==source && channel.lastFrame().isValid(),{{"starts",starts}});
    order.stop();pump(80);starts=0;order.setRepeat(true);order.setSequential(true);order.start({Cue{source,300,1100}},0);
    const bool repeats=until([&]{return starts>=3;},12000);
    record("single_item_sequence_repeat",repeats,{{"starts",starts}});
    order.setSequential(false);order.stop();
    // Manual actions override only this launch. Original cue settings are retained
    // in the running-order snapshot for the next automatic/repeated occurrence.
    Cue configured{source,200,2000,Transition::FadeBlack,700,600,0};
    order.setRepeat(true);order.setSequential(true);starts=0;composed=channel.composedFrames();
    order.takeManual({configured},0,PlaylistController::ManualTake::Cut);
    const bool cutReady=until([&]{return starts==1 && channel.frames()>=4;});
    record("manual_cut_bypasses_saved_entry_fade",cutReady && channel.cue().transition==Transition::Cut && channel.cue().enterMs==0 && channel.composedFrames()==composed);
    const bool repeatedOriginal=until([&]{return starts>=2;});
    record("manual_override_preserves_sequence_settings",repeatedOriginal && channel.cue().transition==configured.transition && channel.cue().transitionMs==configured.transitionMs);
    order.setSequential(false);order.stop();pump(80);composed=channel.composedFrames();
    const bool fadeRequested=order.takeManual({configured},0,PlaylistController::ManualTake::Fade);
    const bool fadeReady=until([&]{return channel.path()==source && !channel.pending() && channel.frames()>=5;});
    record("manual_fade_defaults_300_from_black",fadeRequested && fadeReady && channel.cue().enterMs==300 && channel.cue().transitionMs==300 && channel.composedFrames()>composed);
    composed=channel.composedFrames();
    order.takeManual({Cue{second,200,2300}},0,PlaylistController::ManualTake::Fade,450);
    const bool incomingReady=until([&]{return channel.path()==second && channel.frames()>=5;});
    record("manual_fade_configured_between_clips",incomingReady && channel.cue().transitionMs==450 && channel.composedFrames()>composed && channel.cue().in==200);
    const auto preserved=channel.path();
    record("invalid_manual_fade_does_not_replace_program",!order.takeManual({configured},0,PlaylistController::ManualTake::Fade,0) && channel.path()==preserved);
    order.stop();
    QJsonObject result{{"result",pass?"PASS":"FAIL"},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},
        {"scope","Native synthetic 640x360 media; functional ranges, compositor pixels and transport state. Not physical display or AV sync qualification."},{"tests",tests}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return pass?0:2;
}
