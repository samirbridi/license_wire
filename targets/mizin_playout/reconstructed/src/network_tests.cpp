#include "smoke.hpp"
#include "network.hpp"
#include "network_runtime.hpp"
#include "ndi_frame_order.hpp"
#include <QApplication>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QMediaDevices>
#include <QThread>
#include <cmath>
#include <functional>

static bool waitFor(const std::function<bool()>& predicate,int ms=12000){QElapsedTimer t;t.start();while(!predicate() && t.elapsed()<ms){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();}
static void pump(int ms){QElapsedTimer t;t.start();waitFor([&]{return t.elapsed()>=ms;},ms+1000);}
static double peak(const AudioPacket& p){double result=0;const auto* s=reinterpret_cast<const float*>(p.samples.constData());for(int n=0;n<p.frames()*2;++n)result=qMax(result,std::abs(double(s[n])));return result;}
int runNetworkTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);bool all=true;QJsonArray tests,devices,loopback;
    auto record=[&](const QString& name,bool pass,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=pass;tests.append(details);all&=pass;qInfo().noquote()<<name<<(pass?"PASS":"FAIL")<<QJsonDocument(details).toJson(QJsonDocument::Compact);};
    NdiFrameOrder order;record("ndi_order_accepts_exact_cache_replay",order.observe(1,100,1000,"hash1")&&order.observe(1,100,1100,"hash1")&&order.cachedRepeats==1);record("ndi_order_rejects_content_change_under_same_id",!order.observe(1,100,1200,"changed"));record("ndi_order_rejects_new_frame_with_reused_timecode",!order.observe(2,100,1300,"hash2"));record("ndi_order_rejects_source_sequence_regression",order.observe(3,300,1400,"hash3")&&!order.observe(2,200,1500,"hash2"));record("ndi_order_rejects_delivery_timestamp_regression",!order.observe(4,400,1400,"hash4"));
    AudioMixRing ring;float pcm[8]={.4f,-.2f,.4f,-.2f,.4f,-.2f,.4f,-.2f};ring.push(0,pcm,4,4800);
    record("master_gain_preserves_stereo",std::abs(reinterpret_cast<const float*>(ring.mix(4800,4,.5,false).samples.constData())[0]-.2f)<.00001);
    record("master_mute_is_silence",peak(ring.mix(4800,4,1,true))==0);
    ring.push(1,pcm,4,4800);record("decks_are_mixed_once",std::abs(peak(ring.mix(4800,4,1,false))-.8)<.00001);
    record("sum_is_clipped_to_valid_pcm",peak(ring.mix(4800,4,1,false))<=1);
    const auto p=ring.mix(4800,4,1,false);const auto planar=planarAudio(p);const auto* planes=reinterpret_cast<const float*>(planar.constData());record("transport_planar_channel_layout",std::abs(planes[0]-.8f)<.00001 && std::abs(planes[4]+.4f)<.00001);
    float loud[8]={2,2,2,2,2,2,2,2};ring.push(0,loud,4,6000);record("overload_is_clipped_at_full_scale",peak(ring.mix(6000,4,1,false))==1);
    ring.clear();record("flush_removes_stale_samples",peak(ring.mix(4800,4,1,false))==0);
    ring.push(0,pcm,4,4800+AudioMixRing::capacity);record("ring_wrap_does_not_replay_old_tags",peak(ring.mix(4800,4,1,false))==0);
    AudioEnvelope e;e.startUs=1000000;e.fadeInUs=300000;record("fade_uses_audio_sample_time",e.gain(1000000)==0 && std::abs(e.gain(1150000)-.5f)<.001 && e.gain(1300000)==1);
    e.fadeBlackIn=true;record("fade_black_holds_first_half",e.gain(1150000)==0 && std::abs(e.gain(1225000)-.5f)<.001);
    e.shift(500000);record("pause_shift_preserves_envelope_phase",std::abs(e.gain(1725000)-.5f)<.001);
    e.cutoffUs=1800000;record("exclusive_audio_out_is_silent",e.gain(1800000)==0);
    for(const auto& d:QMediaDevices::audioOutputs())devices.append(QJsonObject{{"name",d.description()},{"id",QString::fromLatin1(d.id().toBase64())}});
    NativeChannel channel(false),other(false),preview(true);channel.setLocalAudioEnabled(false);channel.setLoop(true);
    double currentPeak=0;int packets=0,nonzero=0,previewPackets=0;QList<qint64> times;
    QObject::connect(&channel,&NativeChannel::audioReady,&channel,[&](const AudioPacket& p){currentPeak=peak(p);++packets;if(currentPeak>.001)++nonzero;times<<p.timestampUs;});QObject::connect(&preview,&NativeChannel::audioReady,&preview,[&](const AudioPacket&){++previewPackets;});
    const QString path=QDir(directory).absoluteFilePath("01-h264.mp4");channel.load(path);preview.load(path,false);
    const bool decoded=waitFor([&]{return nonzero>5 && channel.frames()>5;});record("native_media_decodes_real_audio",decoded,{{"decoded_buffers",channel.audioBuffers()},{"nonzero_packets",nonzero},{"packet_count",packets}});
    const int before=channel.frames();channel.setMasterVolume(.25f);channel.setAudioMuted(true);pump(120);record("native_mute_does_not_stop_video",currentPeak==0 && channel.frames()>before && other.masterVolume()==1);
    channel.setAudioMuted(false);record("native_unmute_restores_pcm",waitFor([&]{return currentPeak>.001;}));
    record("preview_never_publishes_audio",previewPackets==0);
    const int sourceFrames=channel.frames();channel.setAudioDevice("missing-test-device");pump(80);record("missing_device_mutes_local_without_stopping_program",!channel.audioDeviceAvailable() && channel.playing() && channel.frames()>sourceFrames && currentPeak>0);
    channel.setAudioDevice({});record("default_device_can_be_restored",channel.audioDeviceAvailable()==!QMediaDevices::defaultAudioOutput().isNull());
    channel.togglePause();pump(120);record("pause_flushes_network_pcm",currentPeak==0);channel.togglePause();record("resume_produces_new_audio",waitFor([&]{return currentPeak>.001;}));
    channel.seek(1000);const int buffers=channel.audioBuffers();record("seek_reanchors_audio_timeline",waitFor([&]{return channel.audioBuffers()>buffers+2 && currentPeak>.001;}));
    bool monotonic=true;for(int i=1;i<times.size();++i)monotonic&=times[i]>times[i-1];record("program_audio_timestamps_stay_monotonic",monotonic);
    NetworkSender missing;qputenv("MIZIN_DISABLE_NETWORK_RUNTIME","1");record("missing_runtime_fails_without_stopping_program",!missing.start(NetworkProtocol::Ndi,"QA",0) && channel.playing());qunsetenv("MIZIN_DISABLE_NETWORK_RUNTIME");
    record("empty_source_name_is_rejected",!missing.start(NetworkProtocol::Omt," ",0));
    const auto previousOmt=qgetenv("MIZIN_OMT_RUNTIME");qputenv("MIZIN_OMT_RUNTIME",(QCoreApplication::applicationDirPath()+"/missing-codec/libomt.dll").toUtf8());{OmtApi absent;record("missing_omt_codec_is_reported_before_sender_creation",!absent.ready && absent.error.contains("codec") && channel.playing());}if(previousOmt.isEmpty())qunsetenv("MIZIN_OMT_RUNTIME");else qputenv("MIZIN_OMT_RUNTIME",previousOmt);
    auto ndi=ndiApi();auto omt=omtApi();record("private_ndi_runtime_loaded",ndi->ready && QFileInfo(ndi->path).canonicalPath()==QFileInfo(QCoreApplication::applicationDirPath()).canonicalFilePath(),{{"path",ndi->path},{"version",ndi->versionText},{"error",ndi->error}});record("packaged_omt_runtime_loaded",omt->ready,{{"path",omt->path},{"error",omt->error}});
    NetworkBus bus(&channel),busB(&other);record("network_senders_are_off_by_default",!bus.sender(NetworkProtocol::Ndi).running() && !bus.sender(NetworkProtocol::Omt).running());
    const QString token=QString::number(QCoreApplication::applicationPid());
    const bool ndiStarted=bus.start(NetworkProtocol::Ndi,"Mizin QA NDI "+token),omtStarted=bus.start(NetworkProtocol::Omt,"Mizin QA OMT "+token);
    record("both_protocols_start_on_one_program",ndiStarted && omtStarted);
    NDIlib_recv_instance_t ndiReceiver=nullptr;omt_receive_t* omtReceiver=nullptr;
    QByteArray ndiName=bus.sender(NetworkProtocol::Ndi).address().toUtf8(),omtName=bus.sender(NetworkProtocol::Omt).address().toUtf8();
    if(ndiStarted){NDIlib_recv_create_v3_t create={};create.source_to_connect_to.p_ndi_name=ndiName.constData();create.color_format=NDIlib_recv_color_format_BGRX_BGRA;create.bandwidth=NDIlib_recv_bandwidth_highest;create.p_ndi_recv_name="Mizin QA loopback";ndiReceiver=ndi->recv_create_v3(&create);}
    if(omtStarted)omtReceiver=omt->receive_create(omtName.constData(),OMTFrameType(OMTFrameType_Video|OMTFrameType_Audio),OMTPreferredVideoFormat_BGRA,OMTReceiveFlags_None);
    int ndiVideo=0,ndiAudio=0,omtVideo=0,omtAudio=0;double ndiPeak=0,omtPeak=0;qint64 ndiTime=-1,omtTime=-1,ndiAudioTime=-1;bool ndiPts=true,omtPts=true,ndiBlack=false,omtBlack=false,ndiAudioPts=true;double ndiBlackMean=-1,omtBlackMean=-1;int ndiFourcc=0,omtCodec=0;QJsonArray ndiTrace,omtTrace;int ndiViolations=0,omtViolations=0;NdiFrameOrder ndiOrder;bool ndiFrameOrder=true;
    auto blackPixels=[](const uchar* data,int w,int h,int stride,double& mean){if(!data || w<=0 || h<=0 || stride<w*4)return false;int sum=0;for(int y=1;y<8;++y)for(int x=1;x<8;++x){const auto* p=data+(y*h/8)*stride+(x*w/8)*4;sum+=p[0]+p[1]+p[2];}mean=sum/(3.0*49);return mean<3;};
    auto receive=[&]{
        if(ndiReceiver){NDIlib_video_frame_v2_t v={};NDIlib_audio_frame_v2_t a={};const auto type=ndi->recv_capture_v2(ndiReceiver,&v,&a,nullptr,0);if(type==NDIlib_frame_type_video){ndiBlack|=blackPixels(v.p_data,v.xres,v.yres,v.line_stride_in_bytes,ndiBlackMean);ndiFourcc=int(v.FourCC);if(v.xres==1920 && v.yres==1080){++ndiVideo;const auto sequence=NdiFrameOrder::readSequence(v.p_metadata);const QByteArray digest(reinterpret_cast<const char*>(v.p_data),qint64(v.line_stride_in_bytes)*v.yres);ndiFrameOrder&=ndiOrder.observe(sequence,v.timecode,v.timestamp,digest);if(v.timecode<=ndiTime)++ndiViolations;ndiPts&=v.timecode>ndiTime;if(ndiTrace.size()<256)ndiTrace.append(QJsonObject{{"frame",ndiVideo},{"sequence",QString::number(sequence)},{"verified_payload_bytes",digest.size()},{"timecode",QString::number(v.timecode)},{"sdk_timestamp",QString::number(v.timestamp)}});ndiTime=v.timecode;}ndi->recv_free_video_v2(ndiReceiver,&v);}else if(type==NDIlib_frame_type_audio){if(a.sample_rate==48000 && a.no_channels==2){++ndiAudio;ndiAudioPts&=a.timecode>ndiAudioTime;ndiAudioTime=a.timecode;for(int n=0;n<a.no_samples;++n)ndiPeak=qMax(ndiPeak,std::abs(double(a.p_data[n])));}ndi->recv_free_audio_v2(ndiReceiver,&a);}}
        if(omtReceiver){if(auto* f=omt->receive(omtReceiver,OMTFrameType(OMTFrameType_Video|OMTFrameType_Audio),0)){if(f->Type==OMTFrameType_Video)omtBlack|=blackPixels(static_cast<const uchar*>(f->Data),f->Width,f->Height,f->Stride,omtBlackMean);omtCodec=int(f->Codec);if(f->Type==OMTFrameType_Video && f->Width==1920 && f->Height==1080){++omtVideo;if(f->Timestamp<=omtTime)++omtViolations;omtPts&=f->Timestamp>omtTime;if(omtTrace.size()<256)omtTrace.append(QJsonObject{{"frame",omtVideo},{"timecode",QString::number(f->Timestamp)}});omtTime=f->Timestamp;}else if(f->Type==OMTFrameType_Audio && f->SampleRate==48000 && f->Channels==2){++omtAudio;const auto* data=static_cast<const float*>(f->Data);for(int n=0;n<f->SamplesPerChannel;++n)omtPeak=qMax(omtPeak,std::abs(double(data[n])));}}}
        return ndiVideo>=8 && ndiAudio>=8 && ndiPeak>.001 && omtVideo>=8 && omtAudio>=8 && omtPeak>.001;
    };
    waitFor(receive,18000);
    record("ndi_loopback_receives_native_video_and_audio",ndiVideo>=8 && ndiAudio>=8 && ndiPeak>.001 && ndiFrameOrder,{{"video_frames",ndiVideo},{"audio_packets",ndiAudio},{"audio_peak",ndiPeak}});
    record("omt_loopback_receives_native_video_and_audio",omtVideo>=8 && omtAudio>=8 && omtPeak>.001 && omtPts,{{"video_frames",omtVideo},{"audio_packets",omtAudio},{"audio_peak",omtPeak}});
    auto drain=[&](int ms){QElapsedTimer t;t.start();waitFor([&]{receive();return t.elapsed()>=ms;},ms+1000);};
    channel.setAudioMuted(true);drain(400);ndiPeak=omtPeak=0;const int muteNdiPackets=ndiAudio,muteOmtPackets=omtAudio;drain(200);
    record("master_mute_reaches_both_network_receivers",ndiPeak<.00001 && omtPeak<.00001 && ndiAudio>muteNdiPackets && omtAudio>muteOmtPackets);
    channel.setAudioMuted(false);record("master_unmute_restores_both_network_receivers",waitFor([&]{receive();return ndiPeak>.001 && omtPeak>.001;}));
    const int sentAudio=bus.sender(NetworkProtocol::Omt).statistics()["audio_packets"].toInt();bus.setAudioEnabled(false);pump(100);const int stoppedAudio=bus.sender(NetworkProtocol::Omt).statistics()["audio_packets"].toInt();pump(100);record("network_audio_can_be_disabled_independently",bus.sender(NetworkProtocol::Omt).statistics()["audio_packets"].toInt()==stoppedAudio && stoppedAudio<=sentAudio+1 && channel.playing());bus.setAudioEnabled(true);
    other.setLocalAudioEnabled(false);other.setLoop(true);other.load(path);const bool bReady=waitFor([&]{return other.frames()>4;});const bool bStarted=busB.start(NetworkProtocol::Omt,"Mizin QA Program B "+token);const int aFrames=channel.frames();pump(120);record("independent_program_b_has_its_own_sender",bReady && bStarted && busB.sender(NetworkProtocol::Omt).address()!=bus.sender(NetworkProtocol::Omt).address() && channel.frames()>aFrames);busB.stop(NetworkProtocol::Omt);other.black();
    loopback.append(QJsonObject{{"protocol","NDI"},{"statistics",bus.sender(NetworkProtocol::Ndi).statistics()}});loopback.append(QJsonObject{{"protocol","OMT"},{"statistics",bus.sender(NetworkProtocol::Omt).statistics()}});
    ndiBlack=omtBlack=false;channel.black();const bool receivedBlack=waitFor([&]{receive();return ndiBlack && omtBlack;});record("black_reaches_both_network_outputs",receivedBlack,{{"ndi_black",ndiBlack},{"omt_black",omtBlack},{"ndi_mean",ndiBlackMean},{"omt_mean",omtBlackMean},{"ndi_fourcc",ndiFourcc},{"omt_codec",omtCodec},{"native_frame_stays_invalid",!channel.lastFrame().isValid()}});
    channel.load(path);waitFor([&]{return channel.playing() && channel.frames()>4;});
    record("ndi_source_frames_and_sdk_delivery_remain_strictly_in_order",ndiFrameOrder&&ndiAudioPts,{{"raw_timecode_strict",ndiPts},{"raw_timecode_repeats_or_regressions",ndiViolations},{"verified_exact_cache_repeats",ndiOrder.cachedRepeats},{"video_frames",ndiVideo},{"audio_packets",ndiAudio}});record("omt_video_timestamps_remain_strictly_increasing",omtPts,{{"video_violations",omtViolations},{"video_frames",omtVideo}});
    if(ndiReceiver)ndi->recv_destroy(ndiReceiver);if(omtReceiver)omt->receive_destroy(omtReceiver);
    const int frames=channel.frames();bus.stop(NetworkProtocol::Ndi);bus.stop(NetworkProtocol::Omt);pump(100);record("stopping_network_preserves_program",channel.playing() && channel.frames()>frames && !bus.sender(NetworkProtocol::Ndi).running());
    channel.black();pump(120);record("black_flushes_audio",currentPeak==0);preview.black();
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"tests",tests},{"audio_devices",devices},{"loopback",loopback},{"ndi_video_trace",ndiTrace},{"omt_video_trace",omtTrace},{"scope","Native audio buffers, controls and in-process SDK network loopback on Windows; not an independent LAN receiver, physical listening, AV-sync or multi-hour qualification"}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return all?0:2;
}
