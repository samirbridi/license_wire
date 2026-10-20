#include "readiness.hpp"
#include "smoke.hpp"
#include "version.hpp"
#include <QtWidgets>
#include <QTemporaryDir>
#include <QThread>
#include <QDataStream>
#include <cmath>

int runReadinessTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);QJsonArray tests;bool all=true;
    auto record=[&](const QString& name,bool pass,const QJsonObject& details=QJsonObject{}){auto item=details;item["name"]=name;item["pass"]=pass;tests.append(item);all&=pass;qInfo().noquote()<<name<<(pass?"PASS":"FAIL");};
    auto wait=[](const std::function<bool()>& predicate,int limit=10000){QElapsedTimer clock;clock.start();while(!predicate()&&clock.elapsed()<limit){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();};
    auto pump=[&](int ms){QElapsedTimer t;t.start();wait([&]{return t.elapsed()>=ms;},ms+1000);};
    const QDir root(directory);const QString source=root.absoluteFilePath("fixtures/01-h264.mp4"),second=root.absoluteFilePath("fixtures/03-h264.mkv");
    NativeChannel preview(true),program(false);CueReadiness readiness(&preview);QTemporaryDir temporary;
    record("readiness_starts_empty",readiness.state()==CueReadiness::State::Empty&&!readiness.readyFor(Cue{source}));
    auto prepare=[&](const Cue& cue){readiness.prepare(cue);return wait([&]{return readiness.state()!=CueReadiness::State::Preparing;})&&readiness.readyFor(cue);};
    Cue cue{source,0,2500};const bool ready=prepare(cue);const auto first=readiness.snapshot();
    record("video_ready_requires_decoded_frame_and_duration",ready&&preview.lastFrame().isValid()&&preview.duration()>=cue.out&&preview.activeGeneration()==preview.requestGeneration(),first);
    record("ready_preview_stays_paused",!preview.playing());
    record("ready_is_tied_to_applied_trim",!readiness.readyFor(Cue{source,400,2000}));
    record("source_check_does_not_start_program",program.path().isEmpty()&&program.frames()==0);
    cue.in=400;cue.out=1600;const bool trimmed=prepare(cue);const auto trimmedFrame=preview.lastFrame();
    record("nonzero_in_is_verified_by_video_timestamp",trimmed&&trimmedFrame.startTime()>=398000&&trimmedFrame.startTime()<1600000,readiness.snapshot());
    const auto proof=readiness.snapshot()["first_verified_video_pts_us"].toDouble();preview.seek(0);pump(120);
    record("edit_can_scrub_outside_applied_trim",preview.position()<cue.in&&readiness.readyFor(cue)&&proof>=398000);
    Cue transitionOnly=cue;transitionOnly.transition=Transition::FadeBlack;transitionOnly.transitionMs=900;
    record("transition_change_reuses_source_range_proof",readiness.readyFor(transitionOnly));
    record("ready_file_recheck_succeeds",readiness.recheckFile());
    readiness.prepare(Cue{source,0,preview.duration()+5000});wait([&]{return readiness.state()!=CueReadiness::State::Preparing;});
    record("out_beyond_duration_never_ready",readiness.state()==CueReadiness::State::Error&&readiness.error()=="Trim exceeds media duration");
    readiness.prepare(Cue{source,800,400});record("invalid_range_rejected",readiness.state()==CueReadiness::State::Error);
    readiness.prepare(Cue{temporary.filePath("missing.mp4")});record("missing_file_rejected_without_stale_ready",readiness.state()==CueReadiness::State::Error&&!readiness.readyFor(cue));
    const auto corrupt=temporary.filePath("corrupt.mp4");{QFile f(corrupt);f.open(QIODevice::WriteOnly);f.write("invalid media, no decoder frames");}
    readiness.prepare(Cue{corrupt});wait([&]{return readiness.state()!=CueReadiness::State::Preparing;});
    record("corrupt_source_never_ready",readiness.state()==CueReadiness::State::Error&&!readiness.error().isEmpty(),readiness.snapshot());
    readiness.prepare(Cue{source});readiness.prepare(Cue{second,200,1800});const bool newest=wait([&]{return readiness.state()!=CueReadiness::State::Preparing;})&&readiness.readyFor(Cue{second,200,1800});
    record("rapid_recues_accept_only_latest_source",newest&&preview.path()==second&&!readiness.readyFor(Cue{source}));
    readiness.prepare(Cue{source,500,1900});readiness.clear();pump(250);
    record("cleared_request_cannot_become_ready_later",readiness.state()==CueReadiness::State::Empty&&!readiness.readyFor(Cue{source,500,1900}));
    const bool restored=prepare(Cue{source});preview.load(second,false);pump(120);
    record("external_preview_load_invalidates_proof",restored&&!readiness.readyFor(Cue{source})&&readiness.state()==CueReadiness::State::Error);
    const auto changed=temporary.filePath("replaceable.mp4");QFile::copy(source,changed);const bool beforeChange=prepare(Cue{changed});{QFile f(changed);f.open(QIODevice::Append);f.write("changed");}
    const bool unchanged=readiness.recheckFile();record("modified_source_invalidates_ready",beforeChange&&!unchanged&&readiness.state()==CueReadiness::State::Error);

    const auto wave=temporary.filePath("stereo.wav");{
        QFile f(wave);f.open(QIODevice::WriteOnly);QDataStream s(&f);s.setByteOrder(QDataStream::LittleEndian);const quint32 bytes=48000*2*2*2;
        s.writeRawData("RIFF",4);s<<quint32(36+bytes);s.writeRawData("WAVEfmt ",8);s<<quint32(16)<<quint16(1)<<quint16(2)<<quint32(48000)<<quint32(192000)<<quint16(4)<<quint16(16);s.writeRawData("data",4);s<<bytes;
        for(int i=0;i<96000;++i){const auto v=qint16(std::sin(i*2*3.141592653589793*440/48000)*5000);s<<v<<qint16(-v);}
    }
    const bool audio=prepare(Cue{wave,200,1200});record("audio_only_ready_is_explicit_backend_check",audio&&preview.hasAudio()&&!preview.hasVideo()&&readiness.snapshot()["first_verified_video_pts_us"].toDouble()==-1);

    program.setLoop(true);program.loadCue(Cue{source,0,2500});const bool playing=wait([&]{return program.frames()>=5;});const int prior=program.frames();readiness.prepare(Cue{corrupt});wait([&]{return readiness.state()!=CueReadiness::State::Preparing;});pump(180);
    record("failed_preview_preserves_running_program",playing&&program.path()==source&&program.playing()&&program.frames()>prior);
    const auto metrics=program.diagnostics();
    record("diagnostics_include_observed_frames_and_size",metrics["published_frames"].toDouble()>0&&metrics["width"].toInt()>0&&metrics["height"].toInt()>0&&metrics["video_frames_last_second"].toInt()>0,metrics);
    record("unsupported_decoder_metrics_remain_null",metrics["decoder_adapter"].isNull()&&metrics["decode_time_ms"].isNull()&&metrics["decoder_dropped_frames"].isNull()&&metrics["decoder_packet_queue"].isNull());
    record("backend_buffer_is_bounded",metrics["backend_buffer_progress"].toDouble()>=0&&metrics["backend_buffer_progress"].toDouble()<=1);
    const auto compositionBefore=metrics["cpu_composed_frames"].toDouble();program.loadCue(Cue{second,0,2500,Transition::Dissolve,300,300,0});
    const bool composed=wait([&]{return program.diagnostics()["cpu_composed_frames"].toDouble()>compositionBefore;});const auto timing=program.diagnostics();
    record("cpu_composition_timing_comes_from_real_transition",composed&&timing["cpu_composition_last_ms"].isDouble()&&timing["cpu_composition_peak_ms"].toDouble()>=timing["cpu_composition_last_ms"].toDouble(),timing);
    program.black();pump(200);record("black_clears_media_and_active_generation",program.path().isEmpty()&&program.activeGeneration()==0&&!program.lastFrame().isValid());
    preview.black();readiness.clear();
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"version",QString(MizinVersion)},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"scope","Real local media, muted source/trim preflight and measured Qt callbacks/CPU composition. READY is not an armed Program or physical signal certification."},{"tests",tests}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return all?0:2;
}
