#pragma once
#include <QByteArray>
#include <QVector>
#include <array>
#include <limits>
#include <mutex>

struct AudioPacket {
    QByteArray samples; // Interleaved, stereo float32, 48000 Hz.
    qint64 timestampUs=0;
    int frames()const{return int(samples.size()/(2*sizeof(float)));}
};
QByteArray planarAudio(const AudioPacket& packet);

struct AudioEnvelope {
    qint64 startUs=0,fadeInUs=0,fadeOutStartUs=-1,fadeOutUs=0,cutoffUs=std::numeric_limits<qint64>::max();
    bool fadeBlackIn=false;
    float gain(qint64 timeUs)const;
    void shift(qint64 delta);
};

// One second of fixed storage per deck; absolute sample tags reject stale slots.
class AudioMixRing final {
public:
    static constexpr int rate=48000,channels=2,capacity=48000;
    AudioMixRing();
    std::array<AudioEnvelope,2> envelope;
    void clear(int deck=-1);
    void push(int deck,const float* stereo,int frames,qint64 firstSample);
    AudioPacket mix(qint64 firstSample,int frames,float master,bool muted)const;
    // Allocation-free variant for real-time audio threads (ADR-018); out holds frames*2 floats.
    void mixInto(qint64 firstSample,int frames,float master,bool muted,float* out,int* missing=nullptr)const;
    // Envelope edits on the GUI thread take this guard so an audio thread never reads a half-written fade.
    std::unique_lock<std::recursive_mutex> guard()const{return std::unique_lock<std::recursive_mutex>(lock_);}
private:
    mutable std::recursive_mutex lock_;
    struct Deck {QVector<float> pcm;QVector<qint64> tags;};
    std::array<Deck,2> decks_;
};
