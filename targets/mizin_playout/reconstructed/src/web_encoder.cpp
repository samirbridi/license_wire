#include "web_encoder.hpp"
#include <opus.h>
#include <QElapsedTimer>
#include <QThread>
#include <thread>
#include <vector>
#ifdef Q_OS_WIN
#include <windows.h>
#include <mfapi.h>
#include <mferror.h>
#include <mfidl.h>
#include <mftransform.h>
#include <codecapi.h>
#include <wmcodecdsp.h>
#include <wrl/client.h>
using Microsoft::WRL::ComPtr;
#endif

static void rgbToNv12Rows(const QImage& image,uchar* destination,int first,int last){
    const int w=image.width(),h=image.height();uchar* uv=destination+w*h;
    for(int y=first;y<last;y+=2){
        const auto* row0=reinterpret_cast<const QRgb*>(image.constScanLine(y));const auto* row1=reinterpret_cast<const QRgb*>(image.constScanLine(y+1));
        uchar* y0=destination+y*w;uchar* y1=y0+w;uchar* c=uv+(y/2)*w;
        for(int x=0;x<w;x+=2){
            int r=0,g=0,b=0;const QRgb px[4]={row0[x],row0[x+1],row1[x],row1[x+1]};uchar* out[4]={y0+x,y0+x+1,y1+x,y1+x+1};
            for(int i=0;i<4;++i){const int pr=qRed(px[i]),pg=qGreen(px[i]),pb=qBlue(px[i]);*out[i]=uchar(((47*pr+157*pg+16*pb+128)>>8)+16);r+=pr;g+=pg;b+=pb;}
            r=(r+2)>>2;g=(g+2)>>2;b=(b+2)>>2;
            c[x]=uchar(qBound(16,((-26*r-87*g+112*b+128)>>8)+128,240));c[x+1]=uchar(qBound(16,((112*r-102*g-10*b+128)>>8)+128,240));
        }
    }
}
// Large frames (1080p, 4K) are split in row bands over the CPU cores; each band starts on an even row.
void rgbToNv12(const QImage& image,uchar* destination){
    const int h=image.height();const int threads=image.width()*h>=1280*720?int(qBound(1u,std::thread::hardware_concurrency(),8u)):1;
    if(threads==1){rgbToNv12Rows(image,destination,0,h);return;}
    std::vector<std::thread> workers;const int band=((h/threads)+1)&~1;
    for(int first=0;first<h;first+=band)workers.emplace_back([&image,destination,first,band,h]{rgbToNv12Rows(image,destination,first,qMin(h,first+band));});
    for(auto& worker:workers)worker.join();
}

#ifdef Q_OS_WIN
struct H264Encoder::Impl {
    ComPtr<IMFTransform> mft;ComPtr<ICodecAPI> codec;ComPtr<IMFMediaEventGenerator> events;int width=0,height=0,fps=30;bool com=false,mf=false,hardware=false,async=false,checkedProfile=false;
    int needInput=0;QString name;QByteArray header;std::vector<uchar> nv12;
};
H264Encoder::H264Encoder()=default;
H264Encoder::~H264Encoder(){close();}
bool H264Encoder::isOpen()const{return d_&&d_->mft;}
bool H264Encoder::hardware()const{return d_&&d_->hardware;}
QString H264Encoder::name()const{return d_?d_->name:QString();}
void H264Encoder::close(){
    if(!d_)return;
    if(d_->mft){d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM,0);d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING,0);}
    if(d_->hardware&&d_->mft){ComPtr<IMFShutdown> shutdown;if(SUCCEEDED(d_->mft.As(&shutdown)))shutdown->Shutdown();}
    d_->events.Reset();d_->codec.Reset();d_->mft.Reset();if(d_->mf)MFShutdown();if(d_->com)CoUninitialize();d_.reset();
}
static void setCodec(ICodecAPI* codec,const GUID& key,VARTYPE type,ULONG value){if(!codec)return;VARIANT v;VariantInit(&v);v.vt=type;if(type==VT_BOOL)v.boolVal=value?VARIANT_TRUE:VARIANT_FALSE;else v.ulVal=value;codec->SetValue(&key,&v);}
void H264Encoder::configure(int fps,int bitrate){
    setCodec(d_->codec.Get(),CODECAPI_AVEncCommonRateControlMode,VT_UI4,eAVEncCommonRateControlMode_CBR);setCodec(d_->codec.Get(),CODECAPI_AVEncCommonMeanBitRate,VT_UI4,ULONG(bitrate));
    setCodec(d_->codec.Get(),CODECAPI_AVLowLatencyMode,VT_BOOL,1);setCodec(d_->codec.Get(),CODECAPI_AVEncMPVDefaultBPictureCount,VT_UI4,0);setCodec(d_->codec.Get(),CODECAPI_AVEncMPVGOPSize,VT_UI4,ULONG(fps*2));
}
bool H264Encoder::setTypes(int width,int height,int fps,int bitrate){
    ComPtr<IMFMediaType> out,in;MFCreateMediaType(&out);MFCreateMediaType(&in);
    for(auto* type:{out.Get(),in.Get()}){type->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Video);MFSetAttributeSize(type,MF_MT_FRAME_SIZE,UINT32(width),UINT32(height));MFSetAttributeRatio(type,MF_MT_FRAME_RATE,UINT32(fps),1);MFSetAttributeRatio(type,MF_MT_PIXEL_ASPECT_RATIO,1,1);type->SetUINT32(MF_MT_INTERLACE_MODE,MFVideoInterlace_Progressive);type->SetUINT32(MF_MT_YUV_MATRIX,MFVideoTransferMatrix_BT709);type->SetUINT32(MF_MT_VIDEO_NOMINAL_RANGE,MFNominalRange_16_235);type->SetUINT32(MF_MT_VIDEO_PRIMARIES,MFVideoPrimaries_BT709);type->SetUINT32(MF_MT_TRANSFER_FUNCTION,MFVideoTransFunc_709);}
    out->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_H264);out->SetUINT32(MF_MT_AVG_BITRATE,UINT32(bitrate));out->SetUINT32(MF_MT_MPEG2_PROFILE,eAVEncH264VProfile_Base);
    in->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_NV12);
    return SUCCEEDED(d_->mft->SetOutputType(0,out.Get(),0))&&SUCCEEDED(d_->mft->SetInputType(0,in.Get(),0));
}
// Hardware encoders are asynchronous MFTs: they ask for input and announce output through events.
bool H264Encoder::openHardware(int width,int height,int fps,int bitrate){
    MFT_REGISTER_TYPE_INFO input{MFMediaType_Video,MFVideoFormat_NV12},output{MFMediaType_Video,MFVideoFormat_H264};IMFActivate** list=nullptr;UINT32 count=0;
    if(FAILED(MFTEnumEx(MFT_CATEGORY_VIDEO_ENCODER,MFT_ENUM_FLAG_HARDWARE|MFT_ENUM_FLAG_SORTANDFILTER,&input,&output,&list,&count)))return false;
    bool ready=false;
    for(UINT32 i=0;i<count&&!ready;++i){
        ComPtr<IMFTransform> mft;if(FAILED(list[i]->ActivateObject(IID_PPV_ARGS(&mft))))continue;
        ComPtr<IMFAttributes> attributes;UINT32 async=0;if(SUCCEEDED(mft->GetAttributes(&attributes))){attributes->GetUINT32(MF_TRANSFORM_ASYNC,&async);if(async)attributes->SetUINT32(MF_TRANSFORM_ASYNC_UNLOCK,TRUE);attributes->SetUINT32(MF_LOW_LATENCY,TRUE);}
        d_->mft=mft;d_->codec.Reset();mft.As(&d_->codec);d_->async=async!=0;d_->events.Reset();if(d_->async&&FAILED(mft.As(&d_->events))){d_->mft.Reset();list[i]->ShutdownObject();continue;}
        configure(fps,bitrate);
        if(!setTypes(width,height,fps,bitrate)){d_->mft.Reset();d_->codec.Reset();d_->events.Reset();list[i]->ShutdownObject();continue;}
        configure(fps,bitrate);
        LPWSTR name=nullptr;UINT32 length=0;if(SUCCEEDED(list[i]->GetAllocatedString(MFT_FRIENDLY_NAME_Attribute,&name,&length))){d_->name=QString::fromWCharArray(name,int(length));CoTaskMemFree(name);}
        if(d_->name.isEmpty())d_->name="Hardware H.264";ready=true;
    }
    for(UINT32 i=0;i<count;++i)list[i]->Release();CoTaskMemFree(list);
    if(!ready)return false;
    d_->hardware=true;d_->needInput=0;d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,0);d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM,0);return true;
}
bool H264Encoder::open(int width,int height,int fps,int bitrate,bool hardware){
    close();failed_=false;d_=std::make_unique<Impl>();d_->width=width;d_->height=height;d_->fps=fps;d_->nv12.resize(size_t(width)*height*3/2);
    const HRESULT co=CoInitializeEx(nullptr,COINIT_MULTITHREADED);d_->com=SUCCEEDED(co);
    if(FAILED(MFStartup(MF_VERSION,MFSTARTUP_LITE))){error_="Media Foundation is unavailable";close();return false;}d_->mf=true;
    // MIZIN_WEB_SOFTWARE_ENCODER forces the software encoder (diagnostics, comparisons).
    if(hardware&&!qEnvironmentVariableIsSet("MIZIN_WEB_SOFTWARE_ENCODER")&&openHardware(width,height,fps,bitrate)){error_.clear();return true;}
    d_->mft.Reset();d_->codec.Reset();d_->events.Reset();d_->hardware=d_->async=false;
    if(FAILED(CoCreateInstance(CLSID_CMSH264EncoderMFT,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&d_->mft)))){error_="Windows H.264 encoder is unavailable";close();return false;}
    d_->mft.As(&d_->codec);d_->name="Windows H.264 (software)";
    if(!setTypes(width,height,fps,bitrate)){error_="H.264 encoder rejected the stream format";close();return false;}
    configure(fps,bitrate);
    d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,0);d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM,0);error_.clear();return true;
}
static bool hasNal(const QByteArray& data,int type){for(int i=0;i+3<data.size();++i)if(data[i]==0&&data[i+1]==0&&data[i+2]==1&&(data[i+3]&0x1f)==type)return true;return false;}
static int spsProfile(const QByteArray& data){for(int i=0;i+4<data.size();++i)if(data[i]==0&&data[i+1]==0&&data[i+2]==1&&(data[i+3]&0x1f)==7)return uchar(data[i+4]);return -1;}
// One ProcessOutput call; returns false when the encoder has nothing more (or failed).
static bool takeOutput(IMFTransform* mft,DWORD minimum,QByteArray& result,bool& key,bool& failed){
    MFT_OUTPUT_STREAM_INFO info{};mft->GetOutputStreamInfo(0,&info);ComPtr<IMFSample> output;ComPtr<IMFMediaBuffer> outBuffer;
    if(!(info.dwFlags&(MFT_OUTPUT_STREAM_PROVIDES_SAMPLES|MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES))){MFCreateSample(&output);MFCreateMemoryBuffer(qMax<DWORD>(info.cbSize,minimum),&outBuffer);output->AddBuffer(outBuffer.Get());}
    MFT_OUTPUT_DATA_BUFFER data{};data.pSample=output.Get();DWORD status=0;const HRESULT hr=mft->ProcessOutput(0,1,&data,&status);
    if(data.pEvents)data.pEvents->Release();
    if(hr==MF_E_TRANSFORM_NEED_MORE_INPUT)return false;
    if(hr==MF_E_TRANSFORM_STREAM_CHANGE){ComPtr<IMFMediaType> type;if(SUCCEEDED(mft->GetOutputAvailableType(0,0,&type)))mft->SetOutputType(0,type.Get(),0);return true;}
    if(FAILED(hr)){failed=true;return false;}
    IMFSample* produced=data.pSample;if(!produced)return false;ComPtr<IMFMediaBuffer> contiguous;if(SUCCEEDED(produced->ConvertToContiguousBuffer(&contiguous))){BYTE* p=nullptr;DWORD length=0;contiguous->Lock(&p,nullptr,&length);result.append(reinterpret_cast<const char*>(p),int(length));contiguous->Unlock();}
    UINT32 clean=0;if(SUCCEEDED(produced->GetUINT32(MFSampleExtension_CleanPoint,&clean))&&clean)key=true;
    if(!output)produced->Release();return true;
}
QByteArray H264Encoder::encode(const QImage& image,qint64 timeUs,bool keyframe,bool* isKey){
    if(isKey)*isKey=false;if(!isOpen()||failed_||image.width()!=d_->width||image.height()!=d_->height)return {};
    if(keyframe)setCodec(d_->codec.Get(),CODECAPI_AVEncVideoForceKeyFrame,VT_UI4,1);
    rgbToNv12(image.format()==QImage::Format_RGB32||image.format()==QImage::Format_ARGB32?image:image.convertToFormat(QImage::Format_RGB32),d_->nv12.data());
    ComPtr<IMFMediaBuffer> buffer;if(FAILED(MFCreateMemoryBuffer(DWORD(d_->nv12.size()),&buffer)))return {};
    BYTE* bytes=nullptr;buffer->Lock(&bytes,nullptr,nullptr);memcpy(bytes,d_->nv12.data(),d_->nv12.size());buffer->Unlock();buffer->SetCurrentLength(DWORD(d_->nv12.size()));
    ComPtr<IMFSample> sample;MFCreateSample(&sample);sample->AddBuffer(buffer.Get());sample->SetSampleTime(timeUs*10);sample->SetSampleDuration(10000000/d_->fps);
    QByteArray result;bool key=false,broken=false;const DWORD minimum=DWORD(d_->nv12.size());
    if(d_->async){
        // Never block a whole frame: collect what is already done, hand this frame over as soon as the encoder asks for
        // input, then give it a few ms for this frame's output. Anything later is returned by the next call.
        bool submitted=false;QElapsedTimer waited;waited.start();const qint64 limit=qMax(20,1000/d_->fps);
        auto submit=[&]{if(FAILED(d_->mft->ProcessInput(0,sample.Get(),0)))broken=true;submitted=true;};
        auto next=[&]()->bool{ // handles one pending event; false when none is waiting
            ComPtr<IMFMediaEvent> event;const HRESULT hr=d_->events->GetEvent(MF_EVENT_FLAG_NO_WAIT,&event);
            if(hr==MF_E_NO_EVENTS_AVAILABLE)return false;if(FAILED(hr)){broken=true;return false;}
            MediaEventType type=MEUnknown;event->GetType(&type);
            if(type==METransformNeedInput){if(!submitted)submit();else ++d_->needInput;}
            else if(type==METransformHaveOutput)takeOutput(d_->mft.Get(),minimum,result,key,broken);
            else if(type==MEError)broken=true;
            return true;
        };
        if(d_->needInput>0){--d_->needInput;submit();}
        while(!broken&&next()){}
        while(!broken&&!submitted&&waited.elapsed()<limit)if(!next())QThread::usleep(200);
        QElapsedTimer tail;tail.start();
        while(!broken&&submitted&&result.isEmpty()&&tail.elapsed()<4)if(!next())QThread::usleep(200);
    }else{
        HRESULT hr=d_->mft->ProcessInput(0,sample.Get(),0);if(hr==MF_E_NOTACCEPTING){while(takeOutput(d_->mft.Get(),minimum,result,key,broken)){}hr=d_->mft->ProcessInput(0,sample.Get(),0);}
        if(FAILED(hr)){error_="H.264 encoder rejected a frame";return {};}
        while(takeOutput(d_->mft.Get(),minimum,result,key,broken)){}
    }
    if(broken&&d_->hardware){failed_=true;error_="Hardware H.264 encoder stopped; using the software encoder";return {};}
    key|=hasNal(result,5);
    if(key&&!hasNal(result,7)){
        // Some encoder builds keep SPS/PPS only in the media type: prepend them so a joining browser can decode.
        if(d_->header.isEmpty()){ComPtr<IMFMediaType> current;UINT32 size=0;if(SUCCEEDED(d_->mft->GetOutputCurrentType(0,&current))&&SUCCEEDED(current->GetBlobSize(MF_MT_MPEG_SEQUENCE_HEADER,&size))&&size){d_->header.resize(int(size));current->GetBlob(MF_MT_MPEG_SEQUENCE_HEADER,reinterpret_cast<UINT8*>(d_->header.data()),size,nullptr);}}
        result.prepend(d_->header);
    }
    // Browsers were offered Constrained Baseline: a hardware encoder that ignores it is replaced by the software one.
    if(d_->hardware&&!d_->checkedProfile&&hasNal(result,7)){d_->checkedProfile=true;const int profile=spsProfile(result);if(profile!=66){failed_=true;error_=QString("Hardware encoder produced H.264 profile %1; using the software encoder").arg(profile);return {};}}
    if(isKey)*isKey=key;return result;
}
#else
struct H264Encoder::Impl {};
H264Encoder::H264Encoder()=default;
H264Encoder::~H264Encoder()=default;
bool H264Encoder::open(int,int,int,int,bool){error_="H.264 web encoder is only implemented on Windows";return false;}
bool H264Encoder::hardware()const{return false;}
QString H264Encoder::name()const{return {};}
void H264Encoder::close(){}
bool H264Encoder::isOpen()const{return false;}
QByteArray H264Encoder::encode(const QImage&,qint64,bool,bool* isKey){if(isKey)*isKey=false;return {};}
#endif

OpusAudioEncoder::~OpusAudioEncoder(){if(encoder_)opus_encoder_destroy(static_cast<OpusEncoder*>(encoder_));}
bool OpusAudioEncoder::open(int bitrate){
    int error=0;auto* encoder=opus_encoder_create(48000,2,OPUS_APPLICATION_AUDIO,&error);if(error!=OPUS_OK||!encoder)return false;
    opus_encoder_ctl(encoder,OPUS_SET_BITRATE(bitrate));opus_encoder_ctl(encoder,OPUS_SET_COMPLEXITY(5));encoder_=encoder;return true;
}
QByteArray OpusAudioEncoder::encode(const float* interleaved){
    if(!encoder_)return {};QByteArray packet(4000,Qt::Uninitialized);
    const int size=opus_encode_float(static_cast<OpusEncoder*>(encoder_),interleaved,FrameSamples,reinterpret_cast<unsigned char*>(packet.data()),packet.size());
    if(size<=0)return {};packet.resize(size);return packet;
}
