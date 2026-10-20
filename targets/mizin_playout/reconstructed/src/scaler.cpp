#include "scaler.hpp"
#include <QCoreApplication>
#include <QColorSpace>
#include <QLibrary>
#include <QPainter>
#include <cstdint>

QSize fittedPixels(QSize source,QSize output) {
    if(source.isEmpty() || output.isEmpty())return {};
    return source.scaled(output,Qt::KeepAspectRatio);
}
QSize displayPixels(QSize logical,qreal ratio) {
    if(logical.isEmpty() || !qIsFinite(ratio) || ratio<=0)return {};
    return {qRound(logical.width()*ratio),qRound(logical.height()*ratio)};
}

struct SwsContext;
struct SwsFilter;
struct LanczosScaler::Impl {
    QLibrary sws,util;
    using Cached=SwsContext* (*)(SwsContext*,int,int,int,int,int,int,int,SwsFilter*,SwsFilter*,const double*);
    using Scale=int (*)(SwsContext*,const uint8_t* const[],const int[],int,int,uint8_t* const[],const int[]);
    using Free=void (*)(SwsContext*);
    using Pixel=int (*)(const char*);
    using Version=unsigned (*)();
    Cached cached=nullptr;Scale scale=nullptr;Free free=nullptr;
    SwsContext* context=nullptr;int rgba=-1;QString error;
    Impl(){
#ifdef Q_OS_WIN
        sws.setFileName(QCoreApplication::applicationDirPath()+"/swscale-8.dll");
        util.setFileName(QCoreApplication::applicationDirPath()+"/avutil-59.dll");
#else
        sws.setFileNameAndVersion("swscale",8);util.setFileNameAndVersion("avutil",59);
#endif
        if(!sws.load() || !util.load()){error="Lanczos runtime could not be loaded";return;}
        auto swsVersion=reinterpret_cast<Version>(sws.resolve("swscale_version"));
        auto utilVersion=reinterpret_cast<Version>(util.resolve("avutil_version"));
        auto pixel=reinterpret_cast<Pixel>(util.resolve("av_get_pix_fmt"));
        cached=reinterpret_cast<Cached>(sws.resolve("sws_getCachedContext"));
        scale=reinterpret_cast<Scale>(sws.resolve("sws_scale"));free=reinterpret_cast<Free>(sws.resolve("sws_freeContext"));
        if(!swsVersion || !utilVersion || !pixel || !cached || !scale || !free || (swsVersion()>>16)!=8 || (utilVersion()>>16)!=59){error="Lanczos runtime ABI mismatch";return;}
        rgba=pixel("rgba");if(rgba<0)error="Lanczos RGBA format unavailable";
    }
    ~Impl(){if(context && free)free(context);}
};
LanczosScaler::LanczosScaler():impl_(std::make_unique<Impl>()){}
LanczosScaler::~LanczosScaler()=default;
bool LanczosScaler::available()const{return impl_->error.isEmpty();}
QString LanczosScaler::error()const{return impl_->error;}
QImage LanczosScaler::scale(const QImage& source,QSize target){
    if(!available() || source.isNull() || target.isEmpty() || qint64(target.width())*target.height()>qint64(4096)*2160)return {};
    if(source.size()==target)return source;
    QImage input=source.convertToFormat(QImage::Format_RGBA8888);
    QImage output(target,QImage::Format_RGBA8888);if(output.isNull())return {};
    // SWS_LANCZOS | SWS_ACCURATE_RND, verified against FFmpeg 7.1 API.
    impl_->context=impl_->cached(impl_->context,input.width(),input.height(),impl_->rgba,target.width(),target.height(),impl_->rgba,0x200|0x40000,nullptr,nullptr,nullptr);
    if(!impl_->context)return {};
    const uint8_t* src[4]={input.constBits(),nullptr,nullptr,nullptr};
    uint8_t* dst[4]={output.bits(),nullptr,nullptr,nullptr};
    int srcStride[4]={int(input.bytesPerLine()),0,0,0},dstStride[4]={int(output.bytesPerLine()),0,0,0};
    if(impl_->scale(impl_->context,src,srcStride,0,input.height(),dst,dstStride)!=target.height())return {};
    output.setColorSpace(source.colorSpace());return output;
}
