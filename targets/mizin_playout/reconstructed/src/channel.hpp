#pragma once
#include "cue.hpp"
#include <QObject>
#include <QAudioOutput>
#include <QMediaPlayer>
#include <QTimer>
#include <QVideoFrame>
#include <QVideoSink>
#include <array>

class NativeChannel final : public QObject {
    Q_OBJECT
public:
    explicit NativeChannel(bool preview, QObject* parent = nullptr);
    void load(const QString& path, bool play = true) { loadCue(Cue{path},play); }
    void loadCue(const Cue& cue, bool play = true);
    void prepareCue(const Cue& cue);
    void takePrepared();
    void cancelPrepared();
    void togglePause();
    void seek(qint64 ms);
    void black();
    void setLoop(bool loop) { loop_ = loop; }
    QString path() const;
    Cue cue() const { return decks_[active_].cue; }
    qint64 position() const;
    qint64 duration() const;
    qint64 rangeEnd() const { return cue().end(duration()); }
    bool playing() const;
    bool loop() const { return loop_; }
    bool pending() const { return pending_ && autoTake_; }
    bool prepared() const { return ready_; }
    bool transitioning() const { return outgoing_ >= 0; }
    bool ended() const { return ended_; }
    int frames() const;
    int composedFrames() const { return composedFrames_; }
    QVideoFrame lastFrame() const { return output_; }
signals:
    void frameReady(const QVideoFrame& frame);
    void changed();
    void failed(const QString& message);
    void preparedReady();
    void started();
    void rangeEnded();
private:
    struct Deck {
        QMediaPlayer* player;
        QAudioOutput* audio;
        QVideoSink* sink;
        Cue cue;
        QVideoFrame last;
        int frames = 0;
        bool seekSet = false;
    };
    std::array<Deck,2> decks_{};
    int active_ = 0, incoming_ = 1, outgoing_ = -1;
    bool pending_ = false, ready_ = false, autoTake_ = false;
    bool playIncoming_ = true, preview_ = false, loop_ = false, ended_ = false;
    qint64 blendMs_ = 0;
    Transition blendType_ = Transition::Cut;
    int composedFrames_ = 0;
    QVideoFrame output_;
    QTimer timeout_, boundary_;
    void beginPrepare(const Cue& cue, bool autoTake, bool play);
    void setupSeek(int index);
    void acceptPrepared();
    void renderActive();
    void finishRange();
    void stopOutgoing();
    void reject(int index, const QString& message);
};
