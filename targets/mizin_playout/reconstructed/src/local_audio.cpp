#include "local_audio.hpp"
#include <QJsonArray>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <future>
#include <thread>
#ifdef Q_OS_WIN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <avrt.h>
#include <ksmedia.h>
#include <initguid.h>
#include <functiondiscoverykeys_devpkey.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
#endif

// ASIO lives in local_audio_asio.cpp and is only compiled with MIZIN_ENABLE_ASIO (Steinberg SDK licence).
std::unique_ptr<AudioOutputBackend> makeAsioBackend(LocalAudioEngine* engine);
QList<AudioDeviceInfo> asioDevices();
bool asioCompiled();

namespace {
class TestBackend final : public AudioOutputBackend {
public:
    using AudioOutputBackend::AudioOutputBackend;
    bool open(const QString& id,int frames,QString*) override {channels_=qBound(2,id.toInt()>0?id.toInt():8,LocalAudioEngine::MaxChannels);frames_=frames>0?frames:128;return true;}
    void close() override {}
    int channels()const override {return channels_;}
    int bufferFrames()const override {return frames_;}
    QString description()const override {return QStringLiteral("Test (no device)");}
private:
    int channels_=8,frames_=128;
};

#ifdef Q_OS_WIN
struct ComScope {bool owned=false;ComScope(){owned=SUCCEEDED(CoInitializeEx(nullptr,COINIT_MULTITHREADED));}~ComScope(){if(owned)CoUninitialize();}};
enum class SampleKind {Float32,Int32,Int24In32,Int16};
QString deviceName(IMMDevice* device){
    ComPtr<IPropertyStore> store;PROPVARIANT value;PropVariantInit(&value);QString name;
    if(SUCCEEDED(device->OpenPropertyStore(STGM_READ,&store))&&SUCCEEDED(store->GetValue(PKEY_Device_FriendlyName,&value))&&value.vt==VT_LPWSTR)name=QString::fromWCharArray(value.pwszVal);
    PropVariantClear(&value);return name;
}
WAVEFORMATEXTENSIBLE format(int channels,SampleKind kind,DWORD mask){
    WAVEFORMATEXTENSIBLE f{};const int container=kind==SampleKind::Int16?16:32;
    f.Format.wFormatTag=WAVE_FORMAT_EXTENSIBLE;f.Format.nChannels=WORD(channels);f.Format.nSamplesPerSec=LocalAudioEngine::SampleRate;f.Format.wBitsPerSample=WORD(container);
    f.Format.nBlockAlign=WORD(channels*container/8);f.Format.nAvgBytesPerSec=f.Format.nSamplesPerSec*f.Format.nBlockAlign;f.Format.cbSize=sizeof(WAVEFORMATEXTENSIBLE)-sizeof(WAVEFORMATEX);
    f.Samples.wValidBitsPerSample=WORD(kind==SampleKind::Int24In32?24:container);f.dwChannelMask=mask;f.SubFormat=kind==SampleKind::Float32?KSDATAFORMAT_SUBTYPE_IEEE_FLOAT:KSDATAFORMAT_SUBTYPE_PCM;return f;
}
SampleKind kindOf(const WAVEFORMATEX* f){
    if(f->wFormatTag==WAVE_FORMAT_IEEE_FLOAT)return SampleKind::Float32;
    if(f->wFormatTag==WAVE_FORMAT_EXTENSIBLE){const auto* x=reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(f);if(x->SubFormat==KSDATAFORMAT_SUBTYPE_IEEE_FLOAT)return SampleKind::Float32;if(f->wBitsPerSample==16)return SampleKind::Int16;return x->Samples.wValidBitsPerSample==24?SampleKind::Int24In32:SampleKind::Int32;}
    return f->wBitsPerSample==16?SampleKind::Int16:SampleKind::Int32;
}
void convert(const float* in,BYTE* out,int samples,SampleKind kind){
    switch(kind){
    case SampleKind::Float32:memcpy(out,in,size_t(samples)*sizeof(float));break;
    case SampleKind::Int32:{auto* o=reinterpret_cast<int32_t*>(out);for(int i=0;i<samples;++i)o[i]=int32_t(std::lrint(double(qBound(-1.0f,in[i],1.0f))*2147483647.0));break;}
    case SampleKind::Int24In32:{auto* o=reinterpret_cast<int32_t*>(out);for(int i=0;i<samples;++i)o[i]=int32_t(std::lrint(double(qBound(-1.0f,in[i],1.0f))*8388607.0))<<8;break;}
    case SampleKind::Int16:{auto* o=reinterpret_cast<int16_t*>(out);for(int i=0;i<samples;++i)o[i]=int16_t(std::lrint(qBound(-1.0f,in[i],1.0f)*32767.0f));break;}
    }
}

// WASAPI event-driven output. Exclusive mode talks to the driver directly (lowest latency, the device
// is reserved for this app); shared low-latency uses IAudioClient3's minimum engine period.
class WasapiBackend final : public AudioOutputBackend {
public:
    WasapiBackend(LocalAudioEngine* engine,bool exclusive):AudioOutputBackend(engine),exclusive_(exclusive){}
    ~WasapiBackend() override {close();}
    bool open(const QString& id,int frames,QString* error) override {
        std::promise<QString> ready;auto result=ready.get_future();stop_=false;
        thread_=std::thread([this,id,frames,&ready]{run(id,frames,ready);});
        const QString message=result.get();if(!message.isEmpty()){if(thread_.joinable())thread_.join();if(error)*error=message;return false;}return true;
    }
    void close() override {stop_=true;if(thread_.joinable())thread_.join();}
    int channels()const override {return channels_;}
    int bufferFrames()const override {return frames_;}
    QString description()const override {return description_;}
private:
    bool exclusive_;std::thread thread_;std::atomic<bool> stop_{false};int channels_=2,frames_=0;QString description_;
    void run(const QString& id,int requested,std::promise<QString>& ready){
        ComScope com;ComPtr<IMMDeviceEnumerator> enumerator;ComPtr<IMMDevice> device;ComPtr<IAudioClient> client;
        auto failOpen=[&](const QString& message){ready.set_value(message);};
        if(FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator)))||FAILED(enumerator->GetDevice(reinterpret_cast<LPCWSTR>(id.utf16()),&device))){failOpen("Audio device not found");return;}
        auto activate=[&]{client.Reset();return SUCCEEDED(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf())));};
        if(!activate()){failOpen("Audio device cannot be opened");return;}
        WAVEFORMATEX* mix=nullptr;client->GetMixFormat(&mix);const int mixChannels=mix?mix->nChannels:2;const DWORD mixMask=mix&&mix->wFormatTag==WAVE_FORMAT_EXTENSIBLE?reinterpret_cast<WAVEFORMATEXTENSIBLE*>(mix)->dwChannelMask:KSAUDIO_SPEAKER_STEREO;
        WAVEFORMATEXTENSIBLE chosen{};SampleKind kind=SampleKind::Float32;HRESULT hr=E_FAIL;REFERENCE_TIME period=0;
        if(exclusive_){
            bool found=false;
            for(int channels:{mixChannels,2})for(auto k:{SampleKind::Float32,SampleKind::Int32,SampleKind::Int24In32,SampleKind::Int16}){if(found)break;auto f=format(channels,k,channels==mixChannels?mixMask:KSAUDIO_SPEAKER_STEREO);if(client->IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE,&f.Format,nullptr)==S_OK){chosen=f;kind=k;found=true;}}
            if(!found){CoTaskMemFree(mix);failOpen("Device does not accept 48 kHz in exclusive mode");return;}
            REFERENCE_TIME defaultPeriod=0,minimumPeriod=0;client->GetDevicePeriod(&defaultPeriod,&minimumPeriod);
            period=requested>0?qMax<REFERENCE_TIME>(minimumPeriod,REFERENCE_TIME(10000000.0*requested/LocalAudioEngine::SampleRate+.5)):minimumPeriod;
            hr=client->Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE,AUDCLNT_STREAMFLAGS_EVENTCALLBACK,period,period,&chosen.Format,nullptr);
            if(hr==AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED){UINT32 aligned=0;client->GetBufferSize(&aligned);period=REFERENCE_TIME(10000000.0*aligned/LocalAudioEngine::SampleRate+.5);if(activate())hr=client->Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE,AUDCLNT_STREAMFLAGS_EVENTCALLBACK,period,period,&chosen.Format,nullptr);}
            if(hr==AUDCLNT_E_DEVICE_IN_USE){CoTaskMemFree(mix);failOpen("Device is in use by another application in exclusive mode");return;}
        }else{
            ComPtr<IAudioClient3> client3;
            if(mix&&mix->nSamplesPerSec==LocalAudioEngine::SampleRate&&kindOf(mix)==SampleKind::Float32&&SUCCEEDED(client.As(&client3))){
                UINT32 defaultFrames=0,fundamental=0,minimum=0,maximum=0;client3->GetSharedModeEnginePeriod(mix,&defaultFrames,&fundamental,&minimum,&maximum);
                UINT32 frames=minimum;if(requested>0&&fundamental>0)frames=qBound(minimum,UINT32((requested+fundamental-1)/fundamental*fundamental),maximum);
                hr=client3->InitializeSharedAudioStream(AUDCLNT_STREAMFLAGS_EVENTCALLBACK,frames,mix,nullptr);if(SUCCEEDED(hr)){memcpy(&chosen,mix,qMin<size_t>(sizeof(chosen),sizeof(WAVEFORMATEX)+mix->cbSize));kind=SampleKind::Float32;}
            }
            if(FAILED(hr)){if(!activate()){CoTaskMemFree(mix);failOpen("Audio device cannot be opened");return;}chosen=format(mixChannels,SampleKind::Float32,mixMask);kind=SampleKind::Float32;
                hr=client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_EVENTCALLBACK|AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM|AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,0,0,&chosen.Format,nullptr);}
        }
        CoTaskMemFree(mix);
        if(FAILED(hr)){failOpen(QString("Audio device rejected the stream (0x%1)").arg(quint32(hr),8,16,QChar('0')));return;}
        HANDLE event=CreateEventW(nullptr,FALSE,FALSE,nullptr);client->SetEventHandle(event);UINT32 bufferFrames=0;client->GetBufferSize(&bufferFrames);
        ComPtr<IAudioRenderClient> render;if(FAILED(client->GetService(IID_PPV_ARGS(&render)))){CloseHandle(event);failOpen("Audio device has no render service");return;}
        REFERENCE_TIME streamLatency=0;client->GetStreamLatency(&streamLatency);
        channels_=chosen.Format.nChannels;frames_=int(bufferFrames);const qint64 latencyFrames=qint64(bufferFrames)+qint64(streamLatency)*LocalAudioEngine::SampleRate/10000000;
        description_=QString("%1 · %2 Hz · %3 ch · %4 frames").arg(exclusive_?"WASAPI exclusive":"WASAPI shared low-latency").arg(chosen.Format.nSamplesPerSec).arg(channels_).arg(frames_);
        std::vector<float> scratch(size_t(bufferFrames)*channels_);
        BYTE* data=nullptr;if(SUCCEEDED(render->GetBuffer(bufferFrames,&data)))render->ReleaseBuffer(bufferFrames,AUDCLNT_BUFFERFLAGS_SILENT);
        DWORD task=0;HANDLE mmcss=AvSetMmThreadCharacteristicsW(L"Pro Audio",&task);
        if(FAILED(client->Start())){if(mmcss)AvRevertMmThreadCharacteristics(mmcss);CloseHandle(event);failOpen("Audio device did not start");return;}
        ready.set_value({});
        while(!stop_){
            if(WaitForSingleObject(event,200)!=WAIT_OBJECT_0)continue;
            UINT32 frames=bufferFrames;if(!exclusive_){UINT32 padding=0;if(FAILED(client->GetCurrentPadding(&padding))){fail("Audio device was removed");break;}frames=bufferFrames-padding;}
            if(!frames)continue;const HRESULT get=render->GetBuffer(frames,&data);
            if(get==AUDCLNT_E_DEVICE_INVALIDATED||FAILED(get)){fail("Audio device was removed");break;}
            engine_->render(scratch.data(),int(frames),channels_,latencyFrames);convert(scratch.data(),data,int(frames)*channels_,kind);render->ReleaseBuffer(frames,0);
        }
        client->Stop();if(mmcss)AvRevertMmThreadCharacteristics(mmcss);CloseHandle(event);
    }
};

QList<AudioDeviceInfo> wasapiDevices(AudioBackend backend){
    QList<AudioDeviceInfo> list;const bool owned=SUCCEEDED(CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED));
    ComPtr<IMMDeviceEnumerator> enumerator;ComPtr<IMMDeviceCollection> collection;UINT count=0;
    if(SUCCEEDED(CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_ALL,IID_PPV_ARGS(&enumerator)))&&SUCCEEDED(enumerator->EnumAudioEndpoints(eRender,DEVICE_STATE_ACTIVE,&collection)))collection->GetCount(&count);
    for(UINT i=0;i<count;++i){ComPtr<IMMDevice> device;LPWSTR id=nullptr;if(FAILED(collection->Item(i,&device))||FAILED(device->GetId(&id)))continue;
        int channels=2;ComPtr<IAudioClient> client;if(SUCCEEDED(device->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,reinterpret_cast<void**>(client.GetAddressOf())))){WAVEFORMATEX* mix=nullptr;if(SUCCEEDED(client->GetMixFormat(&mix))&&mix){channels=mix->nChannels;CoTaskMemFree(mix);}}
        list.append({backend,QString::fromWCharArray(id),deviceName(device.Get()),channels});CoTaskMemFree(id);}
    if(owned)CoUninitialize();return list;
}
#endif
}

LocalAudioEngine::LocalAudioEngine(QObject* parent):QObject(parent){scratch_.resize(size_t(MaxFrames)*2);}
LocalAudioEngine::~LocalAudioEngine(){stop();}
bool LocalAudioEngine::asioAvailable(){return asioCompiled();}
QString LocalAudioEngine::backendName(AudioBackend backend){switch(backend){case AudioBackend::Wasapi:return "WASAPI exclusive";case AudioBackend::WasapiShared:return "WASAPI shared low-latency";case AudioBackend::Asio:return "ASIO";case AudioBackend::Test:return "Test";}return {};}
QList<AudioDeviceInfo> LocalAudioEngine::devices(AudioBackend backend){
    if(backend==AudioBackend::Asio)return asioDevices();if(backend==AudioBackend::Test)return {{AudioBackend::Test,"8","Test (no device)",8}};
#ifdef Q_OS_WIN
    return wasapiDevices(backend);
#else
    return {};
#endif
}
bool LocalAudioEngine::start(AudioBackend backend,const QString& deviceId,int bufferFrames){
    stop();error_.clear();
    std::unique_ptr<AudioOutputBackend> created;
    if(backend==AudioBackend::Test)created=std::make_unique<TestBackend>(this);
    else if(backend==AudioBackend::Asio)created=makeAsioBackend(this);
#ifdef Q_OS_WIN
    else created=std::make_unique<WasapiBackend>(this,backend==AudioBackend::Wasapi);
#endif
    if(!created){error_=backend==AudioBackend::Asio?QStringLiteral("ASIO support is not included in this build"):QStringLiteral("Backend unavailable");emit stateChanged();return false;}
    callbacks_=0;lateSamples_=0;corrections_=0;reanchors_=0;headroomUs_=10000;renderMsMax_=0;
    {std::lock_guard lock(routesMutex_);for(auto& route:routes_)route.cursor=-1;}
    running_=true;
    if(!created->open(deviceId,bufferFrames,&error_)){running_=false;emit stateChanged();return false;}
    deviceChannels_=created->channels();bufferFrames_=created->bufferFrames();backend_=std::move(created);emit stateChanged();return true;
}
void LocalAudioEngine::stop(){
    if(backend_){running_=false;backend_->close();backend_.reset();}running_=false;deviceChannels_=0;emit stateChanged();
}
void LocalAudioEngine::handleBackendFailure(const QString& message){if(!backend_)return;stop();error_=message;emit stateChanged();}
void LocalAudioEngine::setRoutes(const QList<Route>& routes){
    std::vector<Live> next;for(const auto& route:routes)if(route.channel)next.push_back({route.channel,route.channel.data(),qMax(0,route.firstChannel),-1,0});
    std::lock_guard lock(routesMutex_);for(auto& live:next)for(const auto& old:routes_)if(old.raw==live.raw&&old.firstChannel==live.firstChannel){live.cursor=old.cursor;live.delayUs=old.delayUs;}
    routes_=std::move(next);
}
void LocalAudioEngine::render(float* out,int frames,int channels,qint64 latencyFrames){
    const auto started=std::chrono::steady_clock::now();std::fill(out,out+size_t(frames)*channels,0.0f);++callbacks_;deviceLatencyFrames_=latencyFrames;
    if(!running_.load())return;
    // setRoutes only swaps a vector: it never blocks long. If it holds the lock right now, emit one silent buffer instead of waiting.
    std::unique_lock lock(routesMutex_,std::try_to_lock);if(!lock.owns_lock())return;
    const qint64 latencyUs=latencyFrames*1000000/SampleRate;
    for(auto& route:routes_){
        auto* channel=route.raw;if(!channel||route.firstChannel+1>channels)continue;
        // Sample s is heard at now + device latency; it should be heard when its video frame is published (+ operator offset).
        qint64 desired=offsetUs_.load()-latencyUs;if(autoSync_.load()){const qint64 lag=channel->videoLagUs();if(lag>0)desired+=lag;}
        const qint64 delayUs=qMax(headroomUs_.load(),desired);route.delayUs=delayUs;lastDelayUs_=delayUs;
        const qint64 target=channel->programSampleNow()-delayUs*SampleRate/1000000;
        if(route.cursor<0||std::llabs(target-route.cursor)>SampleRate/20){route.cursor=target;++reanchors_;}
        else if(target-route.cursor>96){++route.cursor;++corrections_;}else if(route.cursor-target>96){--route.cursor;++corrections_;}
        for(int done=0;done<frames;){
            const int chunk=qMin(frames-done,MaxFrames);int missing=0;channel->mixLocal(route.cursor,chunk,scratch_.data(),&missing);
            // A partly filled block means the newest samples had not been decoded yet: give the reader more headroom.
            if(missing>0&&missing<chunk){lateSamples_+=missing;headroomUs_=qMin<qint64>(headroomUs_.load()+2000,120000);}
            float* base=out+size_t(done)*channels+route.firstChannel;for(int i=0;i<chunk;++i){base[size_t(i)*channels]+=scratch_[size_t(i)*2];base[size_t(i)*channels+1]+=scratch_[size_t(i)*2+1];}
            route.cursor+=chunk;done+=chunk;
        }
    }
    for(size_t i=0,n=size_t(frames)*channels;i<n;++i)out[i]=qBound(-1.0f,out[i],1.0f);
    const double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-started).count();if(ms>renderMsMax_.load())renderMsMax_=ms;
}
QJsonObject LocalAudioEngine::statistics()const{
    QJsonArray routes;{std::lock_guard lock(routesMutex_);for(const auto& route:routes_)routes.append(QJsonObject{{"first_channel",route.firstChannel+1},{"sync_delay_ms",route.delayUs/1000.0},{"video_lag_ms",route.raw?route.raw->videoLagUs()/1000.0:-1}});}
    const double bufferMs=bufferFrames_.load()*1000.0/SampleRate,latencyMs=deviceLatencyFrames_.load()*1000.0/SampleRate;
    return {{"running",running()},{"device",backend_?backend_->description():QString()},{"channels",deviceChannels()},{"buffer_frames",double(bufferFrames_.load())},{"buffer_ms",bufferMs},{"device_latency_ms",latencyMs},
        {"headroom_ms",headroomUs_.load()/1000.0},{"callbacks",double(callbacks_.load())},{"late_samples",double(lateSamples_.load())},{"drift_corrections",double(corrections_.load())},{"reanchors",double(reanchors_.load())},{"render_ms_max",renderMsMax_.load()},{"routes",routes},{"error",error_}};
}

#ifndef MIZIN_ENABLE_ASIO
std::unique_ptr<AudioOutputBackend> makeAsioBackend(LocalAudioEngine*){return nullptr;}
QList<AudioDeviceInfo> asioDevices(){return {};}
bool asioCompiled(){return false;}
#endif
