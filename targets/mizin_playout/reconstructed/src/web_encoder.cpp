#include "web_encoder.hpp"
#include <opus.h>
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

void rgbToNv12(const QImage& image,uchar* destination){
    const int w=image.width(),h=image.height();uchar* uv=destination+w*h;
    for(int y=0;y<h;y+=2){
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

#ifdef Q_OS_WIN
struct H264Encoder::Impl {
    ComPtr<IMFTransform> mft;ComPtr<ICodecAPI> codec;int width=0,height=0,fps=30;bool com=false,mf=false;QByteArray header;std::vector<uchar> nv12;
};
H264Encoder::H264Encoder()=default;
H264Encoder::~H264Encoder(){close();}
bool H264Encoder::isOpen()const{return d_&&d_->mft;}
void H264Encoder::close(){
    if(!d_)return;
    if(d_->mft){d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM,0);d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING,0);}
    d_->codec.Reset();d_->mft.Reset();if(d_->mf)MFShutdown();if(d_->com)CoUninitialize();d_.reset();
}
static void setCodec(ICodecAPI* codec,const GUID& key,VARTYPE type,ULONG value){if(!codec)return;VARIANT v;VariantInit(&v);v.vt=type;if(type==VT_BOOL)v.boolVal=value?VARIANT_TRUE:VARIANT_FALSE;else v.ulVal=value;codec->SetValue(&key,&v);}
bool H264Encoder::open(int width,int height,int fps,int bitrate){
    close();d_=std::make_unique<Impl>();d_->width=width;d_->height=height;d_->fps=fps;d_->nv12.resize(size_t(width)*height*3/2);
    const HRESULT co=CoInitializeEx(nullptr,COINIT_MULTITHREADED);d_->com=SUCCEEDED(co);
    if(FAILED(MFStartup(MF_VERSION,MFSTARTUP_LITE))){error_="Media Foundation is unavailable";close();return false;}d_->mf=true;
    if(FAILED(CoCreateInstance(CLSID_CMSH264EncoderMFT,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&d_->mft)))){error_="Windows H.264 encoder is unavailable";close();return false;}
    d_->mft.As(&d_->codec);
    ComPtr<IMFMediaType> out,in;MFCreateMediaType(&out);MFCreateMediaType(&in);
    for(auto* type:{out.Get(),in.Get()}){type->SetGUID(MF_MT_MAJOR_TYPE,MFMediaType_Video);MFSetAttributeSize(type,MF_MT_FRAME_SIZE,UINT32(width),UINT32(height));MFSetAttributeRatio(type,MF_MT_FRAME_RATE,UINT32(fps),1);MFSetAttributeRatio(type,MF_MT_PIXEL_ASPECT_RATIO,1,1);type->SetUINT32(MF_MT_INTERLACE_MODE,MFVideoInterlace_Progressive);type->SetUINT32(MF_MT_YUV_MATRIX,MFVideoTransferMatrix_BT709);type->SetUINT32(MF_MT_VIDEO_NOMINAL_RANGE,MFNominalRange_16_235);type->SetUINT32(MF_MT_VIDEO_PRIMARIES,MFVideoPrimaries_BT709);type->SetUINT32(MF_MT_TRANSFER_FUNCTION,MFVideoTransFunc_709);}
    out->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_H264);out->SetUINT32(MF_MT_AVG_BITRATE,UINT32(bitrate));out->SetUINT32(MF_MT_MPEG2_PROFILE,eAVEncH264VProfile_Base);
    in->SetGUID(MF_MT_SUBTYPE,MFVideoFormat_NV12);
    if(FAILED(d_->mft->SetOutputType(0,out.Get(),0))||FAILED(d_->mft->SetInputType(0,in.Get(),0))){error_="H.264 encoder rejected the stream format";close();return false;}
    setCodec(d_->codec.Get(),CODECAPI_AVEncCommonRateControlMode,VT_UI4,eAVEncCommonRateControlMode_CBR);setCodec(d_->codec.Get(),CODECAPI_AVEncCommonMeanBitRate,VT_UI4,ULONG(bitrate));
    setCodec(d_->codec.Get(),CODECAPI_AVLowLatencyMode,VT_BOOL,1);setCodec(d_->codec.Get(),CODECAPI_AVEncMPVDefaultBPictureCount,VT_UI4,0);setCodec(d_->codec.Get(),CODECAPI_AVEncMPVGOPSize,VT_UI4,ULONG(fps*2));
    d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,0);d_->mft->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM,0);error_.clear();return true;
}
static bool hasNal(const QByteArray& data,int type){for(int i=0;i+3<data.size();++i)if(data[i]==0&&data[i+1]==0&&data[i+2]==1&&(data[i+3]&0x1f)==type)return true;return false;}
QByteArray H264Encoder::encode(const QImage& image,qint64 timeUs,bool keyframe,bool* isKey){
    if(isKey)*isKey=false;if(!isOpen()||image.width()!=d_->width||image.height()!=d_->height)return {};
    if(keyframe)setCodec(d_->codec.Get(),CODECAPI_AVEncVideoForceKeyFrame,VT_UI4,1);
    rgbToNv12(image.format()==QImage::Format_RGB32||image.format()==QImage::Format_ARGB32?image:image.convertToFormat(QImage::Format_RGB32),d_->nv12.data());
    ComPtr<IMFMediaBuffer> buffer;if(FAILED(MFCreateMemoryBuffer(DWORD(d_->nv12.size()),&buffer)))return {};
    BYTE* bytes=nullptr;buffer->Lock(&bytes,nullptr,nullptr);memcpy(bytes,d_->nv12.data(),d_->nv12.size());buffer->Unlock();buffer->SetCurrentLength(DWORD(d_->nv12.size()));
    ComPtr<IMFSample> sample;MFCreateSample(&sample);sample->AddBuffer(buffer.Get());sample->SetSampleTime(timeUs*10);sample->SetSampleDuration(10000000/d_->fps);
    QByteArray result;bool key=false;
    auto drain=[&]{
        for(;;){
            MFT_OUTPUT_STREAM_INFO info{};d_->mft->GetOutputStreamInfo(0,&info);ComPtr<IMFSample> output;ComPtr<IMFMediaBuffer> outBuffer;
            if(!(info.dwFlags&(MFT_OUTPUT_STREAM_PROVIDES_SAMPLES|MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES))){MFCreateSample(&output);MFCreateMemoryBuffer(qMax<DWORD>(info.cbSize,DWORD(d_->nv12.size())),&outBuffer);output->AddBuffer(outBuffer.Get());}
            MFT_OUTPUT_DATA_BUFFER data{};data.pSample=output.Get();DWORD status=0;const HRESULT hr=d_->mft->ProcessOutput(0,1,&data,&status);
            if(data.pEvents)data.pEvents->Release();
            if(hr==MF_E_TRANSFORM_NEED_MORE_INPUT)return;
            if(hr==MF_E_TRANSFORM_STREAM_CHANGE){ComPtr<IMFMediaType> type;if(SUCCEEDED(d_->mft->GetOutputAvailableType(0,0,&type)))d_->mft->SetOutputType(0,type.Get(),0);continue;}
            if(FAILED(hr))return;
            IMFSample* produced=data.pSample;if(!produced)return;ComPtr<IMFMediaBuffer> contiguous;if(SUCCEEDED(produced->ConvertToContiguousBuffer(&contiguous))){BYTE* p=nullptr;DWORD length=0;contiguous->Lock(&p,nullptr,&length);result.append(reinterpret_cast<const char*>(p),int(length));contiguous->Unlock();}
            UINT32 clean=0;if(SUCCEEDED(produced->GetUINT32(MFSampleExtension_CleanPoint,&clean))&&clean)key=true;
            if(!output)produced->Release();
        }
    };
    HRESULT hr=d_->mft->ProcessInput(0,sample.Get(),0);if(hr==MF_E_NOTACCEPTING){drain();hr=d_->mft->ProcessInput(0,sample.Get(),0);}
    if(FAILED(hr)){error_="H.264 encoder rejected a frame";return {};}
    drain();key|=hasNal(result,5);
    if(key&&!hasNal(result,7)){
        // Some encoder builds keep SPS/PPS only in the media type: prepend them so a joining browser can decode.
        if(d_->header.isEmpty()){ComPtr<IMFMediaType> current;UINT32 size=0;if(SUCCEEDED(d_->mft->GetOutputCurrentType(0,&current))&&SUCCEEDED(current->GetBlobSize(MF_MT_MPEG_SEQUENCE_HEADER,&size))&&size){d_->header.resize(int(size));current->GetBlob(MF_MT_MPEG_SEQUENCE_HEADER,reinterpret_cast<UINT8*>(d_->header.data()),size,nullptr);}}
        result.prepend(d_->header);
    }
    if(isKey)*isKey=key;return result;
}
#else
struct H264Encoder::Impl {};
H264Encoder::H264Encoder()=default;
H264Encoder::~H264Encoder()=default;
bool H264Encoder::open(int,int,int,int){error_="H.264 web encoder is only implemented on Windows";return false;}
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
