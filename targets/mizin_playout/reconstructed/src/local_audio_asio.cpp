// ADR-018 ASIO backend. Compiled only with MIZIN_ENABLE_ASIO: it uses the Steinberg ASIO SDK, whose
// proprietary licence requires a Steinberg-signed agreement before a closed-source build is published.
#include "local_audio.hpp"
#ifdef MIZIN_ENABLE_ASIO
#include <windows.h>
#include "asiosys.h"
#include "asio.h"
#include "asiodrivers.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <vector>

bool loadAsioDriver(char* name);
extern AsioDrivers* asioDrivers;

namespace {
class AsioBackend;
AsioBackend* activeBackend=nullptr;

class AsioBackend final : public AudioOutputBackend {
public:
    using AudioOutputBackend::AudioOutputBackend;
    ~AsioBackend() override {close();}
    bool open(const QString& name,int requested,QString* error) override {
        if(activeBackend){if(error)*error="Another ASIO device is already open";return false;}
        if(!asioDrivers)asioDrivers=new AsioDrivers();
        QByteArray driver=name.toLocal8Bit().left(31);driver.append('\0');
        if(!loadAsioDriver(driver.data())){if(error)*error="ASIO driver could not be loaded";return false;}
        loaded_=true;ASIODriverInfo info{};info.asioVersion=2;info.sysRef=GetDesktopWindow();
        if(ASIOInit(&info)!=ASE_OK){if(error)*error=QString("ASIO driver did not start: %1").arg(QString::fromLocal8Bit(info.errorMessage));unload();return false;}
        initialized_=true;long inputs=0,outputs=0;ASIOGetChannels(&inputs,&outputs);channels_=int(std::clamp<long>(outputs,0,LocalAudioEngine::MaxChannels));
        if(channels_<2){if(error)*error="ASIO device has no stereo output";unload();return false;}
        ASIOSampleRate rate=0;ASIOGetSampleRate(&rate);
        if(rate!=LocalAudioEngine::SampleRate){if(ASIOCanSampleRate(LocalAudioEngine::SampleRate)!=ASE_OK||ASIOSetSampleRate(LocalAudioEngine::SampleRate)!=ASE_OK){if(error)*error="ASIO device must run at 48 kHz";unload();return false;}}
        long minimum=0,maximum=0,preferred=0,granularity=0;ASIOGetBufferSize(&minimum,&maximum,&preferred,&granularity);
        long size=preferred;if(requested>0){size=std::clamp<long>(requested,minimum,maximum);if(granularity>0)size=minimum+((size-minimum+granularity-1)/granularity)*granularity;else if(granularity==-1){long p=minimum;while(p<size&&p*2<=maximum)p*=2;size=p;}size=std::clamp<long>(size,minimum,maximum);}
        frames_=int(size);infos_.assign(size_t(channels_),ASIOBufferInfo{});for(int i=0;i<channels_;++i){infos_[size_t(i)].isInput=ASIOFalse;infos_[size_t(i)].channelNum=i;}
        callbacks_.bufferSwitch=&bufferSwitch;callbacks_.sampleRateDidChange=&sampleRateChanged;callbacks_.asioMessage=&message;callbacks_.bufferSwitchTimeInfo=&bufferSwitchTimeInfo;
        activeBackend=this;
        if(ASIOCreateBuffers(infos_.data(),channels_,size,&callbacks_)!=ASE_OK){activeBackend=nullptr;if(error)*error="ASIO buffers could not be created";unload();return false;}
        buffersCreated_=true;types_.assign(size_t(channels_),ASIOSTFloat32LSB);
        for(int i=0;i<channels_;++i){ASIOChannelInfo channel{};channel.channel=i;channel.isInput=ASIOFalse;if(ASIOGetChannelInfo(&channel)==ASE_OK)types_[size_t(i)]=channel.type;}
        long inputLatency=0,outputLatency=0;ASIOGetLatencies(&inputLatency,&outputLatency);latencyFrames_=outputLatency>0?outputLatency:size;
        outputReady_=ASIOOutputReady()==ASE_OK;scratch_.assign(size_t(frames_)*channels_,0.0f);
        char current[64]={};asioDrivers->getCurrentDriverName(current);
        description_=QString("ASIO · %1 · 48000 Hz · %2 outputs · %3 frames").arg(QString::fromLocal8Bit(current)).arg(channels_).arg(frames_);
        if(ASIOStart()!=ASE_OK){if(error)*error="ASIO device did not start streaming";unload();return false;}
        started_=true;return true;
    }
    void close() override {unload();}
    int channels()const override {return channels_;}
    int bufferFrames()const override {return frames_;}
    QString description()const override {return description_;}
    void process(long index){
        engine_->render(scratch_.data(),frames_,channels_,latencyFrames_);
        for(int c=0;c<channels_;++c)write(infos_[size_t(c)].buffers[index],types_[size_t(c)],c);
        if(outputReady_)ASIOOutputReady();
    }
    void reportFailure(const QString& text){fail(text);}
private:
    std::vector<ASIOBufferInfo> infos_;std::vector<ASIOSampleType> types_;std::vector<float> scratch_;ASIOCallbacks callbacks_{};
    int channels_=0,frames_=0;long latencyFrames_=0;bool loaded_=false,initialized_=false,buffersCreated_=false,started_=false,outputReady_=false;QString description_;
    void unload(){
        if(started_)ASIOStop();started_=false;if(buffersCreated_)ASIODisposeBuffers();buffersCreated_=false;
        if(initialized_)ASIOExit();initialized_=false;if(loaded_&&asioDrivers)asioDrivers->removeCurrentDriver();loaded_=false;if(activeBackend==this)activeBackend=nullptr;
    }
    void write(void* destination,ASIOSampleType type,int channel){
        const float* in=scratch_.data()+channel;const int stride=channels_;
        auto sample=[&](int i){return double(qBound(-1.0f,in[size_t(i)*stride],1.0f));};
        switch(type){
        case ASIOSTFloat32LSB:{auto* o=static_cast<float*>(destination);for(int i=0;i<frames_;++i)o[i]=float(sample(i));break;}
        case ASIOSTFloat64LSB:{auto* o=static_cast<double*>(destination);for(int i=0;i<frames_;++i)o[i]=sample(i);break;}
        case ASIOSTInt32LSB:{auto* o=static_cast<int32_t*>(destination);for(int i=0;i<frames_;++i)o[i]=int32_t(std::lrint(sample(i)*2147483647.0));break;}
        case ASIOSTInt32LSB24:{auto* o=static_cast<int32_t*>(destination);for(int i=0;i<frames_;++i)o[i]=int32_t(std::lrint(sample(i)*8388607.0));break;}
        case ASIOSTInt32LSB20:{auto* o=static_cast<int32_t*>(destination);for(int i=0;i<frames_;++i)o[i]=int32_t(std::lrint(sample(i)*524287.0));break;}
        case ASIOSTInt32LSB18:{auto* o=static_cast<int32_t*>(destination);for(int i=0;i<frames_;++i)o[i]=int32_t(std::lrint(sample(i)*131071.0));break;}
        case ASIOSTInt32LSB16:{auto* o=static_cast<int32_t*>(destination);for(int i=0;i<frames_;++i)o[i]=int32_t(std::lrint(sample(i)*32767.0));break;}
        case ASIOSTInt24LSB:{auto* o=static_cast<uint8_t*>(destination);for(int i=0;i<frames_;++i){const int32_t v=int32_t(std::lrint(sample(i)*8388607.0));o[i*3]=uint8_t(v);o[i*3+1]=uint8_t(v>>8);o[i*3+2]=uint8_t(v>>16);}break;}
        case ASIOSTInt16LSB:{auto* o=static_cast<int16_t*>(destination);for(int i=0;i<frames_;++i)o[i]=int16_t(std::lrint(sample(i)*32767.0));break;}
        default:memset(destination,0,size_t(frames_)*4);break;
        }
    }
    static void bufferSwitch(long index,ASIOBool){if(activeBackend)activeBackend->process(index);}
    static ASIOTime* bufferSwitchTimeInfo(ASIOTime*,long index,ASIOBool direct){bufferSwitch(index,direct);return nullptr;}
    static void sampleRateChanged(ASIOSampleRate rate){if(activeBackend&&rate!=LocalAudioEngine::SampleRate)activeBackend->reportFailure("ASIO sample rate changed; output stopped");}
    static long message(long selector,long value,void*,double*){
        switch(selector){
        case kAsioSelectorSupported:return value==kAsioResetRequest||value==kAsioEngineVersion||value==kAsioResyncRequest||value==kAsioLatenciesChanged||value==kAsioSupportsTimeInfo?1L:0L;
        case kAsioResetRequest:if(activeBackend)activeBackend->reportFailure("ASIO driver requested a reset; start the output again");return 1L;
        case kAsioResyncRequest:case kAsioLatenciesChanged:return 1L;
        case kAsioEngineVersion:return 2L;
        case kAsioSupportsTimeInfo:return 0L;
        default:return 0L;
        }
    }
};
}

std::unique_ptr<AudioOutputBackend> makeAsioBackend(LocalAudioEngine* engine){return std::make_unique<AsioBackend>(engine);}
QList<AudioDeviceInfo> asioDevices(){
    AsioDrivers drivers;std::vector<std::vector<char>> storage(32,std::vector<char>(64,0));std::vector<char*> names;for(auto& item:storage)names.push_back(item.data());
    const long count=drivers.getDriverNames(names.data(),long(names.size()));QList<AudioDeviceInfo> list;
    for(long i=0;i<count;++i){const QString name=QString::fromLocal8Bit(names[size_t(i)]);list.append({AudioBackend::Asio,name,name,0});}
    return list;
}
bool asioCompiled(){return true;}
#endif
