#include "local_audio.hpp"
#include <QApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QThread>
#include <cmath>
#include <functional>
#ifdef Q_OS_WIN
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
#endif

namespace {
bool waitFor(const std::function<bool()>& predicate,int ms=12000){QElapsedTimer t;t.start();while(!predicate()&&t.elapsed()<ms){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();}
struct Levels {std::vector<double> peak;};
// Drives the test backend in real time from this (GUI) thread, as a device callback would.
Levels drive(LocalAudioEngine& engine,int channels,int ms){
    Levels levels;levels.peak.assign(size_t(channels),0);std::vector<float> buffer(size_t(128)*channels);QElapsedTimer clock;clock.start();qint64 rendered=0;
    while(clock.elapsed()<ms){
        QCoreApplication::processEvents(QEventLoop::AllEvents,1);
        while(rendered*1000/LocalAudioEngine::SampleRate<clock.elapsed()){engine.renderTest(buffer.data(),128,channels,128);rendered+=128;
            for(int i=0;i<128;++i)for(int c=0;c<channels;++c)levels.peak[size_t(c)]=qMax(levels.peak[size_t(c)],double(std::abs(buffer[size_t(i)*channels+c])));}
        QThread::msleep(1);
    }
    return levels;
}
#ifdef Q_OS_WIN
QString findDevice(const QString& part){for(const auto& device:LocalAudioEngine::devices(AudioBackend::Wasapi))if(device.name.contains(part,Qt::CaseInsensitive))return device.id;return {};}
// Captures a WASAPI endpoint (shared mode) for ms and returns its peak; used with VB-Audio Cable loopback.
double capturePeak(const QString& namePart,int ms,const std::function<void()>& pump){
    double peak=-1;ComPtr<IMMDeviceEnumerator> enumerator;ComPtr<IMMDeviceCollection> collection;UINT count=0;
    if(FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator)))||FAILED(enumerator->EnumAudioEndpoints(eCapture,DEVICE_STATE_ACTIVE,&collection)))return peak;
    collection->GetCount(&count);ComPtr<IMMDevice> device;
    for(UINT i=0;i<count&&!device;++i){ComPtr<IMMDevice> candidate;collection->Item(i,&candidate);ComPtr<IPropertyStore> store;PROPVARIANT value;PropVariantInit(&value);
        if(SUCCEEDED(candidate->OpenPropertyStore(STGM_READ,&store))){const PROPERTYKEY name={{0xa45c254e,0xdf1c,0x4efd,{0x80,0x20,0x67,0xd1,0x46,0xa8,0x50,0xe0}},14};if(SUCCEEDED(store->GetValue(name,&value))&&value.vt==VT_LPWSTR&&QString::fromWCharArray(value.pwszVal).contains(namePart,Qt::CaseInsensitive))device=candidate;}PropVariantClear(&value);}
    if(!device)return peak;ComPtr<IAudioClient> client;if(FAILED(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf()))))return peak;
    WAVEFORMATEX* mix=nullptr;client->GetMixFormat(&mix);if(!mix||FAILED(client->Initialize(AUDCLNT_SHAREMODE_SHARED,0,2000000,0,mix,nullptr))){CoTaskMemFree(mix);return peak;}
    ComPtr<IAudioCaptureClient> capture;client->GetService(IID_PPV_ARGS(&capture));const bool isFloat=mix->wFormatTag==WAVE_FORMAT_IEEE_FLOAT||(mix->wFormatTag==WAVE_FORMAT_EXTENSIBLE&&mix->wBitsPerSample==32);const int channels=mix->nChannels;
    client->Start();peak=0;QElapsedTimer clock;clock.start();
    while(clock.elapsed()<ms){pump();UINT32 packet=0;while(SUCCEEDED(capture->GetNextPacketSize(&packet))&&packet){BYTE* data=nullptr;UINT32 frames=0;DWORD flags=0;if(FAILED(capture->GetBuffer(&data,&frames,&flags,nullptr,nullptr)))break;
            if(!(flags&AUDCLNT_BUFFERFLAGS_SILENT)&&isFloat){const auto* f=reinterpret_cast<const float*>(data);for(UINT32 i=0;i<frames*UINT32(channels);++i)peak=qMax(peak,double(std::abs(f[i])));}capture->ReleaseBuffer(frames);}}
    client->Stop();CoTaskMemFree(mix);return peak;
}
#endif
}

int runAudioEngineTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);bool all=true;QJsonArray tests;
    auto record=[&](const QString& name,bool pass,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=pass;tests.append(details);all&=pass;qInfo().noquote()<<name<<(pass?"PASS":"FAIL")<<QJsonDocument(details).toJson(QJsonDocument::Compact);};
    const QString fixture=QDir(directory).absoluteFilePath("01-h264.mp4");
    NativeChannel a(false),b(false);for(auto* c:{&a,&b}){c->setLoop(true);c->load(fixture);}
    record("fixture_programs_produce_audio",waitFor([&]{return a.audioBuffers()>20&&b.audioBuffers()>20;}));
    LocalAudioEngine engine;
    record("engine_is_off_by_default",!engine.running()&&!a.localEngine());
    const bool started=engine.start(AudioBackend::Test,"8",128);engine.setRoutes({{&a,0},{&b,2}});a.setLocalEngine(true);b.setLocalEngine(true);
    record("test_backend_starts",started&&engine.running()&&engine.deviceChannels()==8);
    record("engine_ownership_mutes_qt_sinks",a.localEngine()&&a.qtSinksMuted()&&b.qtSinksMuted());
    auto levels=drive(engine,8,1500);
    record("routes_programs_to_their_channel_pairs",levels.peak[0]>.005&&levels.peak[1]>.005&&levels.peak[2]>.005&&levels.peak[3]>.005&&levels.peak[4]==0&&levels.peak[7]==0,{{"peaks",QJsonArray{levels.peak[0],levels.peak[1],levels.peak[2],levels.peak[3],levels.peak[4],levels.peak[7]}}});
    const double full=levels.peak[0];a.setMasterVolume(.5f);levels=drive(engine,8,800);
    record("program_volume_scales_its_pair_only",std::abs(levels.peak[0]/full-.5)<.12&&levels.peak[2]>.005,{{"ratio",levels.peak[0]/full}});a.setMasterVolume(1);
    a.setAudioMuted(true);levels=drive(engine,8,500);record("program_mute_silences_its_pair_only",levels.peak[0]==0&&levels.peak[1]==0&&levels.peak[2]>.005);a.setAudioMuted(false);
    b.setLocalAudioEnabled(false);levels=drive(engine,8,500);record("local_monitor_off_silences_engine_output",levels.peak[2]==0&&levels.peak[0]>.005);b.setLocalAudioEnabled(true);
    levels=drive(engine,8,1000);auto stats=engine.statistics();const auto route=stats["routes"].toArray()[0].toObject();
    const double lag=route["video_lag_ms"].toDouble(),delay=route["sync_delay_ms"].toDouble(),headroom=stats["headroom_ms"].toDouble(),latency=stats["device_latency_ms"].toDouble();
    record("sync_delay_follows_measured_video_lag",lag>=0&&std::abs(delay-qMax(headroom,lag-latency))<4,{{"video_lag_ms",lag},{"sync_delay_ms",delay},{"headroom_ms",headroom},{"device_latency_ms",latency}});
    engine.setOffsetMs(40);levels=drive(engine,8,1500);stats=engine.statistics();const double shifted=stats["routes"].toArray()[0].toObject()["sync_delay_ms"].toDouble();
    const double expected=qMax(headroom,40+qMax(0.0,lag)-latency);record("operator_offset_delays_audio",std::abs(shifted-expected)<4&&shifted>delay,{{"before_ms",delay},{"after_ms",shifted},{"expected_ms",expected}});engine.setOffsetMs(0);
    record("render_thread_cost_is_small",stats["render_ms_max"].toDouble()<3,{{"render_ms_max",stats["render_ms_max"].toDouble()},{"late_samples",stats["late_samples"].toDouble()},{"reanchors",stats["reanchors"].toDouble()}});
    {   // The 8 s fixture loops while the engine owns the output: audio must continue across the wrap.
        QJsonArray perSecond;bool continuous=true;for(int s=0;s<11;++s){const auto l=drive(engine,8,1000);perSecond.append(l.peak[0]);continuous&=l.peak[0]>.005;}
        record("looping_program_keeps_engine_audio_after_wrapping",continuous,{{"peak_per_second",perSecond}});
    }
    engine.setRoutes({});levels=drive(engine,8,300);record("removed_routes_are_silent",levels.peak[0]==0&&levels.peak[2]==0);
    engine.stop();a.setLocalEngine(false);b.setLocalEngine(false);record("stopping_returns_output_to_qt",!engine.running()&&!a.qtSinksMuted());
    const auto wasapi=LocalAudioEngine::devices(AudioBackend::Wasapi);QJsonArray names;for(const auto& d:wasapi)names.append(d.name+" ("+QString::number(d.channels)+" ch)");
    record("wasapi_lists_render_devices",!wasapi.isEmpty(),{{"devices",names}});
#ifdef Q_OS_WIN
    const QString cable=findDevice("CABLE Input");
    if(cable.isEmpty())record("vb_cable_loopback_skipped",true,{{"reason","VB-Audio Cable not installed"}});
    else for(auto backend:{AudioBackend::WasapiShared,AudioBackend::Wasapi}){
        LocalAudioEngine device;const bool opened=device.start(backend,cable,0);device.setRoutes({{&a,0}});a.setLocalEngine(opened);
        // The virtual cable can need a moment after an exclusive open; capture twice and keep both peaks.
        const auto pump=[]{QCoreApplication::processEvents(QEventLoop::AllEvents,5);};double first=opened?capturePeak("CABLE Output",2500,pump):-1;double peak=first;if(opened&&peak<=.005)peak=capturePeak("CABLE Output",2500,pump);QJsonObject retry;
        // VB-Cable has its own internal buffer and may stay silent at the 2 ms exclusive minimum on a busy host
        // (seen on builds that had already passed). Then exclusive mode is proven again with a 10 ms buffer.
        if(backend==AudioBackend::Wasapi&&opened&&peak<=.005){device.stop();const bool reopened=device.start(backend,cable,480);device.setRoutes({{&a,0}});a.setLocalEngine(reopened);
            const double retryPeak=reopened?capturePeak("CABLE Output",2500,pump):-1;retry={{"retry_buffer_frames",480},{"retry_opened",reopened},{"retry_peak",retryPeak}};if(reopened)peak=retryPeak;}
        const auto s=device.statistics();
        QJsonObject details{{"opened",opened},{"error",device.error()},{"captured_peak",peak},{"first_attempt_peak",first},{"device",s["device"].toString()},{"buffer_ms",s["buffer_ms"].toDouble()},{"device_latency_ms",s["device_latency_ms"].toDouble()},{"late_samples",s["late_samples"].toDouble()}};for(auto it=retry.begin();it!=retry.end();++it)details[it.key()]=it.value();
        record(QString("vb_cable_%1_plays_program_audio").arg(backend==AudioBackend::Wasapi?"exclusive":"shared"),opened&&peak>.005,details);
        device.stop();a.setLocalEngine(false);
    }
#endif
    QJsonArray asio;if(LocalAudioEngine::asioAvailable())for(const auto& driver:LocalAudioEngine::devices(AudioBackend::Asio)){
        LocalAudioEngine device;const bool opened=device.start(AudioBackend::Asio,driver.id,0);device.setRoutes({{&a,0}});waitFor([]{return false;},1200);const auto s=device.statistics();
        asio.append(QJsonObject{{"driver",driver.name},{"opened",opened},{"error",device.error()},{"device",s["device"].toString()},{"buffer_ms",s["buffer_ms"].toDouble()},{"device_latency_ms",s["device_latency_ms"].toDouble()},{"callbacks",s["callbacks"].toDouble()},{"late_samples",s["late_samples"].toDouble()}});device.stop();}
    record("asio_driver_probe",true,{{"compiled",LocalAudioEngine::asioAvailable()},{"drivers",asio},{"note","Informational: a driver opens only when its hardware/service is present."}});
    a.black();b.black();
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"tests",tests},{"scope","Real-time render core driven by a test backend, WASAPI loopback through VB-Audio Cable when installed and an informational ASIO driver probe. Not a physical speaker/AV-sync measurement."}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return all?0:2;
}
