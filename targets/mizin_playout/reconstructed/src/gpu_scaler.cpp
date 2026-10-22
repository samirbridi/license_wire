#include "gpu_scaler.hpp"
#include "scaler.hpp"
#include <QOpenGLContext>
#include <QOpenGLFunctions>
#include <QSurfaceFormat>
#include <cmath>

// Original separable Lanczos-3, normalized at edges. Widen the kernel on reduction
// to suppress aliasing. Support up to 4:1 reduction per axis (24 taps per pass).
static const char* vertex=R"GLSL(#version 330 core
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0,1);}
)GLSL";
static const char* resample=R"GLSL(#version 330 core
uniform sampler2D source;
uniform ivec2 sourceSize;
uniform ivec2 targetSize;
uniform int axis;
out vec4 color;
float sinc(float x){if(abs(x)<0.00001)return 1.0;float a=3.14159265359*x;return sin(a)/a;}
void main(){
  vec2 pos=gl_FragCoord.xy*vec2(sourceSize)/vec2(targetSize)-0.5;
  float ratio=max(1.0,float(sourceSize[axis])/float(targetSize[axis]));
  float center=pos[axis];int first=int(ceil(center-3.0*ratio));
  vec4 sum=vec4(0);float total=0.0;
  for(int j=0;j<25;++j){
    int sampleIndex=first+j;float d=(float(sampleIndex)-center)/ratio;
    if(abs(d)>=3.0)continue;
    float w=sinc(d)*sinc(d/3.0);
    ivec2 p=ivec2(floor(pos+0.5));p[axis]=sampleIndex;
    sum+=texelFetch(source,clamp(p,ivec2(0),sourceSize-1),0)*w;total+=w;
  }
  color=sum/total;
}
)GLSL";
static const char* presentFragment=R"GLSL(#version 330 core
uniform sampler2D source;in vec2 uv;out vec4 color;
void main(){vec4 p=texture(source,vec2(uv.x,1.0-uv.y));color=vec4(p.rgb,1.0);}
)GLSL";

bool GpuLanczos::initialize(){
    if(!initializeOpenGLFunctions()){error_="GPU Lanczos requires OpenGL 3.3; using Native scaling";return false;}
    device_={{"vendor",QString::fromLatin1(reinterpret_cast<const char*>(glGetString(GL_VENDOR)))},{"renderer",QString::fromLatin1(reinterpret_cast<const char*>(glGetString(GL_RENDERER)))},{"version",QString::fromLatin1(reinterpret_cast<const char*>(glGetString(GL_VERSION)))}};
    const auto renderer=device_["renderer"].toString().toLower();
    if(renderer.contains("llvmpipe") || renderer.contains("softpipe") || renderer.contains("software") || renderer.contains("gdi generic") || renderer.contains("basic render")){error_="GPU context unavailable; using Native scaling";return false;}
    auto program=[&](const char* fragment){auto p=std::make_unique<QOpenGLShaderProgram>();if(!p->addShaderFromSourceCode(QOpenGLShader::Vertex,vertex) || !p->addShaderFromSourceCode(QOpenGLShader::Fragment,fragment) || !p->link()){error_=p->log();return std::unique_ptr<QOpenGLShaderProgram>{};}return p;};
    filter_=program(resample);copy_=program(presentFragment);if(!filter_ || !copy_)return false;
    glGenVertexArrays(1,&vao_);glGenTextures(1,&input_);glBindTexture(GL_TEXTURE_2D,input_);
    glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
    glGenQueries(1,&query_);
    ready_=true;return true;
}
void GpuLanczos::release(){
    if(query_)glDeleteQueries(1,&query_);query_=0;horizontal_.reset();output_.reset();filter_.reset();copy_.reset();
    if(input_)glDeleteTextures(1,&input_);if(vao_)glDeleteVertexArrays(1,&vao_);input_=vao_=0;inputSize_={};queryPending_=ready_=false;
}
void GpuLanczos::draw(QOpenGLShaderProgram& program,GLuint texture){
    glDisable(GL_BLEND);glDisable(GL_DEPTH_TEST);glDisable(GL_SCISSOR_TEST);glDisable(GL_FRAMEBUFFER_SRGB);
    glActiveTexture(GL_TEXTURE0);glBindTexture(GL_TEXTURE_2D,texture);program.bind();program.setUniformValue("source",0);
    glBindVertexArray(vao_);glDrawArrays(GL_TRIANGLES,0,3);glBindVertexArray(0);program.release();
}
bool GpuLanczos::scale(const QImage& image,QSize target){
    if(!ready_ || image.isNull() || target.isEmpty())return false;
    GLint limit=0;glGetIntegerv(GL_MAX_TEXTURE_SIZE,&limit);
    if(image.width()>limit || image.height()>limit || target.width()>limit || target.height()>limit ||
       image.width()>4096 || image.height()>4096 || target.width()>4096 || target.height()>4096 ||
       qint64(target.width())*target.height()>qint64(4096)*2160 || image.width()>target.width()*4 || image.height()>target.height()*4){error_="GPU scaling exceeds tested size or ratio; using Native scaling";return false;}
    const QSize middle(target.width(),image.height());
    if(!horizontal_ || horizontal_->size()!=middle){QOpenGLFramebufferObjectFormat format;format.setInternalTextureFormat(GL_RGBA16F);horizontal_=std::make_unique<QOpenGLFramebufferObject>(middle,format);}
    if(!output_ || output_->size()!=target){QOpenGLFramebufferObjectFormat format;format.setInternalTextureFormat(GL_RGBA8);output_=std::make_unique<QOpenGLFramebufferObject>(target,format);}
    if(!horizontal_->isValid() || !output_->isValid()){error_="GPU framebuffer allocation failed; using Native scaling";return false;}
    const QImage rgba=image.convertToFormat(QImage::Format_RGBA8888_Premultiplied);
    glBindTexture(GL_TEXTURE_2D,input_);glPixelStorei(GL_UNPACK_ALIGNMENT,4);glPixelStorei(GL_UNPACK_ROW_LENGTH,rgba.bytesPerLine()/4);
    if(inputSize_!=rgba.size()){glTexImage2D(GL_TEXTURE_2D,0,GL_RGBA8,rgba.width(),rgba.height(),0,GL_RGBA,GL_UNSIGNED_BYTE,rgba.constBits());inputSize_=rgba.size();}
    else glTexSubImage2D(GL_TEXTURE_2D,0,0,0,rgba.width(),rgba.height(),GL_RGBA,GL_UNSIGNED_BYTE,rgba.constBits());
    glPixelStorei(GL_UNPACK_ROW_LENGTH,0);
    GLint available=0;if(queryPending_)glGetQueryObjectiv(query_,GL_QUERY_RESULT_AVAILABLE,&available);
    if(available){GLuint64 ns=0;glGetQueryObjectui64v(query_,GL_QUERY_RESULT,&ns);gpuMs_=double(ns)/1e6;queryPending_=false;}
    const bool measure=query_ && !queryPending_;if(measure)glBeginQuery(GL_TIME_ELAPSED,query_);
    auto pass=[&](QOpenGLFramebufferObject& fbo,GLuint texture,QSize source,int axis){
        fbo.bind();glViewport(0,0,fbo.width(),fbo.height());filter_->bind();
        glUniform2i(filter_->uniformLocation("sourceSize"),source.width(),source.height());glUniform2i(filter_->uniformLocation("targetSize"),fbo.width(),fbo.height());filter_->setUniformValue("axis",axis);draw(*filter_,texture);
    };
    pass(*horizontal_,input_,image.size(),0);pass(*output_,horizontal_->texture(),middle,1);
    if(measure){glEndQuery(GL_TIME_ELAPSED);queryPending_=true;}
    if(glGetError()!=GL_NO_ERROR){error_="GPU rendering failed; using Native scaling";return false;}return true;
}
void GpuLanczos::present(GLuint framebuffer,QSize viewport){
    glBindFramebuffer(GL_FRAMEBUFFER,framebuffer);glViewport(0,0,viewport.width(),viewport.height());glDisable(GL_SCISSOR_TEST);glClearColor(0,0,0,1);glClear(GL_COLOR_BUFFER_BIT);
    if(!output_)return;const auto fit=fittedPixels(output_->size(),viewport);glViewport((viewport.width()-fit.width())/2,(viewport.height()-fit.height())/2,fit.width(),fit.height());draw(*copy_,output_->texture());
}
QImage GpuLanczos::readback(){return output_?output_->toImage(false):QImage{};}

GpuFrameCache::GpuFrameCache(NativeChannel* channel,QObject* parent):QObject(parent){
    connect(channel,&NativeChannel::frameReady,this,[this](const QVideoFrame& frame){if(frame!=frame_){frame_={};image_={};}});
}
QImage GpuFrameCache::image(const QVideoFrame& frame){
    if(frame!=frame_ || image_.isNull()){QElapsedTimer time;time.start();image_=frame.toImage();frame_=frame;conversionMs_=time.nsecsElapsed()/1e6;++conversions_;}return image_;
}
QString gpuFrameUnsupported(const QVideoFrame& frame){
    const auto f=frame.surfaceFormat();const auto p=f.pixelFormat();
    if(p==QVideoFrameFormat::Format_P010 || p==QVideoFrameFormat::Format_P016 || p==QVideoFrameFormat::Format_YUV420P10 || p==QVideoFrameFormat::Format_Y16 || p==QVideoFrameFormat::Format_SamplerExternalOES || p==QVideoFrameFormat::Format_SamplerRect || f.colorTransfer()==QVideoFrameFormat::ColorTransfer_ST2084 || f.colorTransfer()==QVideoFrameFormat::ColorTransfer_STD_B67 || frame.rotation()!=QtVideo::Rotation::None || f.rotation()!=QtVideo::Rotation::None || frame.mirrored() || f.isMirrored() || f.viewport()!=QRect(QPoint(0,0),frame.size()) || !frame.subtitleText().isEmpty())return "High-depth, HDR or transformed frame: using Native scaling";
    return {};
}
GpuSurface::GpuSurface(QSharedPointer<GpuFrameCache> cache,QWidget* parent):QOpenGLWidget(parent),cache_(std::move(cache)){
    QSurfaceFormat f;f.setRenderableType(QSurfaceFormat::OpenGL);f.setVersion(3,3);f.setProfile(QSurfaceFormat::CoreProfile);f.setDepthBufferSize(0);f.setStencilBufferSize(0);setFormat(f);
}
GpuSurface::~GpuSurface(){cleanup();}
void GpuSurface::cleanup(){if(context()){makeCurrent();renderer_.release();doneCurrent();}ready_=false;}
void GpuSurface::initializeGL(){
    ready_=renderer_.initialize();error_=ready_?QString{}:renderer_.error();
    connect(context(),&QOpenGLContext::aboutToBeDestroyed,this,&GpuSurface::cleanup,Qt::DirectConnection);
    if(!ready_)emit failed(error_);
}
void GpuSurface::submit(const QVideoFrame& frame){if(dirty_ && pending_!=frame)++superseded_;pending_=frame;dirty_=true;update();}
void GpuSurface::paintGL(){
    if(!ready_)return;
    const QSize pixels=displayPixels(size(),devicePixelRatioF()),target=stretch_?pixels:fittedPixels(pending_.size(),pixels);
    if(dirty_ || scaledSize_!=target){
        dirty_=false;
        if(pending_.isValid()){
            QElapsedTimer time;time.start();const auto image=cache_?cache_->image(pending_):pending_.toImage();
            if(!renderer_.scale(image,target)){error_=image.isNull()?"Frame readback failed; using Native scaling":renderer_.error();emit failed(error_);return;}
            serviceMs_=time.nsecsElapsed()/1e6;rendered_=pending_;scaledSize_=target;++frames_;
        }else{rendered_={};scaledSize_={};}
    }
    if(rendered_.isValid())renderer_.present(defaultFramebufferObject(),pixels);
    else {auto* f=context()->functions();f->glDisable(GL_SCISSOR_TEST);f->glClearColor(0,0,0,1);f->glClear(GL_COLOR_BUFFER_BIT);}
}
