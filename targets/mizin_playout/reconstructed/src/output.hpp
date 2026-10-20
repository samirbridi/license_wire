#pragma once
#include "channel.hpp"
#include "scaler.hpp"
#include <QFutureWatcher>
#include <QPointer>
#include <QScreen>
#include <QVideoWidget>
#include <QWidget>

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
    void prune();
private:
    struct Entry {QPointer<NativeChannel> channel;QSize pixels;QPointer<QualityFeed> feed;};
    QList<Entry> feeds_;
};

class OutputWindow final:public QWidget {
    Q_OBJECT
public:
    OutputWindow(NativeChannel* channel,OutputRouter* router,bool lanczos,QWidget* parent=nullptr);
    ~OutputWindow() override;
    void openOn(QScreen* screen);
    QSize targetPixels()const;
    QSize sourcePixels()const{return channel_?channel_->lastFrame().size():QSize{};}
    QVideoWidget* video()const{return video_;}
    int frames()const{return frames_;}
    bool highQuality()const{return lanczos_;}
signals:
    void warning(const QString& message);
protected:
    void resizeEvent(QResizeEvent* event) override;
    bool event(QEvent* event) override;
private:
    QPointer<NativeChannel> channel_;
    QPointer<OutputRouter> router_;
    QVideoWidget* video_;
    bool lanczos_;
    QPointer<QScreen> target_;
    QPointer<QualityFeed> feed_;
    QMetaObject::Connection framesConnection_,warningConnection_;
    QTimer resizeTimer_;
    int frames_=0;
    void updateFeed();
    void present(const QVideoFrame& frame);
};
