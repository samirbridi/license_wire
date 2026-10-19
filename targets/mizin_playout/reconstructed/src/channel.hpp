#pragma once
#include <QObject>
#include <QAudioOutput>
#include <QMediaPlayer>
#include <QTimer>
#include <QVideoFrame>
#include <QVideoSink>
#include <array>

// One native decoder per deck. Mirrored views share the resulting QVideoFrame.
// UI and output windows never independently reopen the same media for mirroring.
class NativeChannel final : public QObject {
    Q_OBJECT
public:
    explicit NativeChannel(bool preview, QObject* parent = nullptr);
    void load(const QString& path, bool play = true);
    void togglePause();
    void black();
    void setLoop(bool loop);
    QString path() const;
    qint64 position() const;
    qint64 duration() const;
    bool playing() const;
    bool loop() const { return loop_; }
    bool pending() const { return pending_; }
    int frames() const;
    QVideoFrame lastFrame() const;
signals:
    void frameReady(const QVideoFrame& frame);
    void changed();
    void failed(const QString& message);
private:
    struct Deck {
        QMediaPlayer* player;
        QAudioOutput* audio;
        QVideoSink* sink;
        QString path;
        QVideoFrame last;
        int frames = 0;
    };
    std::array<Deck, 2> decks_{};
    int active_ = 0;
    int incoming_ = 1;
    bool pending_ = false;
    bool playIncoming_ = true;
    bool preview_ = false;
    bool loop_ = false;
    QTimer timeout_;
    void promote(int index);
    void reject(int index, const QString& message);
};
