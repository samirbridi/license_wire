#pragma once
#include "cue.hpp"
#include "audio.hpp"
#include <QAudioBufferOutput>
#include <QAudioDevice>
#include <QElapsedTimer>
#include <QObject>
#include <QAudioOutput>
#include <QMediaPlayer>
#include <QTimer>
#include <QVideoFrame>
#include <QVideoSink>
#include <array>
#include <deque>
#include <QJsonObject>

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
    bool preparing() const { return pending_; }
    bool prepared() const { return ready_; }
    quint64 requestGeneration() const { return requestGeneration_; }
    quint64 activeGeneration() const { return activeGeneration_; }
    quint64 publishedFrames() const { return publishedFrames_; }
    QString preparationState() const { return preparationState_; }
    QString preparationError() const { return preparationError_; }
    bool hasVideo() const { return decks_[active_].player->hasVideo(); }
    bool hasAudio() const { return decks_[active_].player->hasAudio(); }
    bool seekable() const { return decks_[active_].player->isSeekable(); }
    QJsonObject diagnostics() const;
    bool transitioning() const { return outgoing_ >= 0; }
    bool ended() const { return ended_; }
    int frames() const;
    int composedFrames() const { return composedFrames_; }
    QVideoFrame lastFrame() const { return output_; }
    void setMasterVolume(float volume);
    void setAudioMuted(bool muted);
    void setLocalAudioEnabled(bool enabled);
    void setAudioDevice(const QByteArray& id);
    float masterVolume()const{return volume_;}
    bool audioMuted()const{return muted_;}
    bool localAudioEnabled()const{return localAudio_;}
    bool audioDeviceAvailable()const{return deviceAvailable_;}
    QByteArray audioDeviceId()const{return deviceId_;}
    qint64 programTimeUs()const{return clock_.nsecsElapsed()/1000;}
    qint64 videoTimeUs()const;
    int audioBuffers()const{return audioBuffers_;}
    float localDeckVolume(int index)const{return decks_[index].audio->volume();}
signals:
    void frameReady(const QVideoFrame& frame);
    void changed();
    void failed(const QString& message);
    void preparedReady();
    void started();
    void rangeEnded();
    void audioReady(const AudioPacket& packet);
    void audioReset();
    void audioMeter(float left,float right);
    void audioWarning(const QString& message);
private:
    struct Deck {
        QMediaPlayer* player;
        QAudioOutput* audio;
        QVideoSink* sink;
        QAudioBufferOutput* tap=nullptr;
        Cue cue;
        QVideoFrame last;
        int frames = 0;
        bool seekSet = false;
        bool sourceLoaded = false;
        float gain=0;
        qint64 offsetUs=0;
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
    QTimer audioTimer_;
    QElapsedTimer clock_;
    AudioMixRing audioMix_;
    qint64 audioCursor_=0,pausedAtUs_=-1;
    float volume_=1;
    bool muted_=false,localAudio_=true,deviceAvailable_=true;
    QByteArray deviceId_;
    int audioBuffers_=0;
    quint64 requestGeneration_=0,activeGeneration_=0,publishedFrames_=0,receivedFrames_=0,prerollFiltered_=0;
    QString preparationState_="empty",preparationPath_,preparationError_,lastError_;
    QElapsedTimer preparationClock_;
    qint64 preparationMs_=0;
    std::deque<qint64> publishedTimes_;
    quint64 compositionSamples_=0;
    double compositionLastMs_=0,compositionPeakMs_=0,compositionTotalMs_=0;
    void preparationFailed(const QString& message);
    void applyLocalAudio();
    void receiveAudio(int deck,const QAudioBuffer& buffer);
    void pumpAudio();
    void syncAudioTimeline(int deck,qint64 mediaUs);
    void flushAudio();
    void beginPrepare(const Cue& cue, bool autoTake, bool play);
    void setupSeek(int index);
    void acceptPrepared();
    void renderActive();
    void finishRange();
    void stopOutgoing();
    void reject(int index, const QString& message);
};
