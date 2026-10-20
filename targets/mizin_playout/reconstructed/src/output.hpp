#pragma once
#include "channel.hpp"
#include "scaler.hpp"
#include "gpu_scaler.hpp"
#include <QFutureWatcher>
#include <QPointer>
#include <QScreen>
#include <QVideoWidget>
#include <QWidget>
#include <QStackedLayout>

enum class OutputScaling {Native,CpuLanczos,GpuLanczos};

class QualityFeed final:public QObject {
    Q_OBJECT
public:
    QualityFeed(NativeChannel* channel,QSize pixels,QObject* parent=nullptr);
    ~QualityFeed() override;
    void refresh();
    int jobs()const{return jobs_;}
    int dropped()const{return dropped_;}
    double lastMs()const{return lastMs_;}
    QVideoFrame lastFrame()const{return published_;}
    bool idle()const{return !busy_ && !pending_.isValid();}
    QSize pixels()const{return pixels_;}
    bool inUse()const;
signals:
    void frameReady(const QVideoFrame& frame);
    void warning(const QString& message);
private:
    struct Result {QImage image;qint64 generation=0,start=-1,end=-1; qreal fps=0;QString subtitle;double ms=0;};
    QPointer<NativeChannel> channel_;
    QSize pixels_;
    std::shared_ptr<LanczosScaler> scaler_;
    QFutureWatcher<Result> worker_;
    QVideoFrame pending_,published_,lastSubmitted_;
    QString sourcePath_,note_;
    qint64 generation_=0;
    bool busy_=false;
    bool latencyWarned_=false;
    int jobs_=0,dropped_=0;
    double lastMs_=0;
    void submit(const QVideoFrame& frame);
    void start(const QVideoFrame& frame);
    void fallback(const QVideoFrame& frame,const QString& note);
};

class OutputRouter final:public QObject {
public:
    using QObject::QObject;
    QualityFeed* feed(NativeChannel* channel,QSize pixels);
    QSharedPointer<GpuFrameCache> gpuCache(NativeChannel* channel);
    void prune();
private:
    struct Entry {QPointer<NativeChannel> channel;QSize pixels;QPointer<QualityFeed> feed;};
    QList<Entry> feeds_;
    struct GpuEntry {QPointer<NativeChannel> channel;QWeakPointer<GpuFrameCache> cache;};
    QList<GpuEntry> gpuCaches_;
};

class OutputWindow final:public QWidget {
    Q_OBJECT
public:
    OutputWindow(NativeChannel* channel,OutputRouter* router,bool lanczos,QWidget* parent=nullptr);
    OutputWindow(NativeChannel* channel,OutputRouter* router,OutputScaling scaling,QWidget* parent=nullptr);
    ~OutputWindow() override;
    void openOn(QScreen* screen);
    QSize targetPixels()const;
    QSize sourcePixels()const{return channel_?channel_->lastFrame().size():QSize{};}
    QVideoWidget* video()const{return video_;}
    GpuSurface* gpu()const{return gpu_;}
    bool gpuActive()const{return gpu_ && !gpuFailed_ && stack_->currentWidget()==gpu_;}
    int frames()const{return frames_;}
    bool highQuality()const{return scaling_!=OutputScaling::Native;}
signals:
    void warning(const QString& message);
protected:
    void resizeEvent(QResizeEvent* event) override;
    bool event(QEvent* event) override;
private:
    QPointer<NativeChannel> channel_;
    QPointer<OutputRouter> router_;
    QVideoWidget* video_;
    OutputScaling scaling_;
    QStackedLayout* stack_;
    GpuSurface* gpu_=nullptr;
    bool gpuFailed_=false;
    QString gpuWarning_;
    QPointer<QScreen> target_;
    QPointer<QualityFeed> feed_;
    QMetaObject::Connection framesConnection_,warningConnection_;
    QTimer resizeTimer_;
    int frames_=0;
    void updateFeed();
    void present(const QVideoFrame& frame);
    void presentGpu(const QVideoFrame& frame);
};
