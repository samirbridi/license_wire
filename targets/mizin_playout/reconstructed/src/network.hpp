#pragma once
#include "channel.hpp"
#include <QImage>
#include <QJsonObject>
#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>

enum class NetworkProtocol {Ndi,Omt};
class NetworkSender final {
public:
    NetworkSender();
    ~NetworkSender();
    bool start(NetworkProtocol protocol,const QString& name,qint64 programTimeUs);
    void stop();
    void video(const QImage& image,qint64 timestampUs,qreal fps);
    void audio(const AudioPacket& packet);
    void reset();
    void setAudioEnabled(bool enabled){audioEnabled_=enabled;if(!enabled){std::lock_guard lock(mutex_);audio_.clear();}}
    bool running()const{return running_;}
    QString error()const;
    QString address()const;
    QJsonObject statistics()const;
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
    mutable std::mutex mutex_;
    std::condition_variable wake_;
    std::thread worker_;
    struct Video {QImage image;qint64 time=0;qreal fps=30;};
    std::deque<Video> videoQueue_;
    QImage latest_;
    qint64 videoTimestamp_=0;
    qreal fps_=30;
    std::deque<AudioPacket> audio_;
    QString error_,address_;
    std::atomic<bool> running_{false},stopping_{false},audioEnabled_{true};
    std::atomic<int> videos_{0},audios_{0},droppedAudio_{0},droppedVideo_{0},connections_{0};
    bool newVideo_=false;
    qint64 clockOrigin_=0;
    void work();
};

class NetworkBus final:public QObject {
    Q_OBJECT
public:
    explicit NetworkBus(NativeChannel* channel,QObject* parent=nullptr);
    bool start(NetworkProtocol protocol,const QString& name);
    void stop(NetworkProtocol protocol);
    void setAudioEnabled(bool enabled);
    NetworkSender& sender(NetworkProtocol protocol){return senders_[protocol==NetworkProtocol::Ndi?0:1];}
signals:
    void warning(const QString& text);
private:
    NativeChannel* channel_;
    std::array<NetworkSender,2> senders_;
    bool audioEnabled_=true;
    QString lastWarning_;
    void frame(const QVideoFrame& frame);
};
