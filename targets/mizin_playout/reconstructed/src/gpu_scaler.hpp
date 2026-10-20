#pragma once
#include "channel.hpp"
#include <QElapsedTimer>
#include <QJsonObject>
#include <QOpenGLFunctions_3_3_Core>
#include <QOpenGLFramebufferObject>
#include <QOpenGLShaderProgram>
#include <QOpenGLWidget>
#include <QPointer>
#include <memory>

// Current-context renderer. Production presents textures, readback is QA only.
class GpuLanczos final:protected QOpenGLFunctions_3_3_Core {
public:
    bool initialize();
    void release();
    bool scale(const QImage& image,QSize target);
    void present(GLuint framebuffer,QSize viewport);
    QImage readback();
    QString error()const{return error_;}
    QJsonObject device()const{return device_;}
    double gpuMs()const{return gpuMs_;}
    bool timerAvailable()const{return query_!=0;}
private:
    std::unique_ptr<QOpenGLShaderProgram> filter_,copy_;
    std::unique_ptr<QOpenGLFramebufferObject> horizontal_,output_;
    GLuint query_=0;
    GLuint input_=0,vao_=0;
    QSize inputSize_;
    bool queryPending_=false,ready_=false;
    double gpuMs_=-1;
    QString error_;
    QJsonObject device_;
    void draw(QOpenGLShaderProgram& program,GLuint texture);
};

// One CPU readback/conversion per Program frame, shared by mirrored GPU outputs.
class GpuFrameCache final:public QObject {
public:
    explicit GpuFrameCache(NativeChannel* channel,QObject* parent=nullptr);
    QImage image(const QVideoFrame& frame);
    int conversions()const{return conversions_;}
    double conversionMs()const{return conversionMs_;}
private:
    QVideoFrame frame_;
    QImage image_;
    int conversions_=0;
    double conversionMs_=0;
};

QString gpuFrameUnsupported(const QVideoFrame& frame);

class GpuSurface final:public QOpenGLWidget {
    Q_OBJECT
public:
    explicit GpuSurface(QSharedPointer<GpuFrameCache> cache,QWidget* parent=nullptr);
    ~GpuSurface()override;
    void submit(const QVideoFrame& frame);
    int frames()const{return frames_;}
    int superseded()const{return superseded_;}
    double serviceMs()const{return serviceMs_;}
    double gpuMs()const{return renderer_.gpuMs();}
    QJsonObject device()const{return renderer_.device();}
    QString error()const{return error_;}
    qint64 timestamp()const{return rendered_.startTime();}
signals:
    void failed(const QString& message);
protected:
    void initializeGL()override;
    void paintGL()override;
private:
    QSharedPointer<GpuFrameCache> cache_;
    GpuLanczos renderer_;
    QVideoFrame pending_,rendered_;
    QSize scaledSize_;
    QString error_;
    int frames_=0,superseded_=0;
    bool dirty_=false,ready_=false;
    double serviceMs_=0;
    void cleanup();
};
