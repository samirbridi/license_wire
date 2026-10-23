#pragma once
#include <QByteArray>
#include <QImage>
#include <QString>
#include <memory>

// ADR-017 encoders for the local web monitor. Both objects belong to one worker thread:
// open, encode and close must be called from that same thread.

// H.264 Annex-B (Constrained Baseline, no B-frames, low-latency CBR) through Windows Media Foundation:
// the graphics card's hardware encoder (NVENC, Quick Sync, AMF) when one accepts the stream, otherwise the
// software encoder MFT shipped with the OS. No FFmpeg/x264 dependency.
class H264Encoder final {
public:
    H264Encoder();
    ~H264Encoder();
    bool open(int width,int height,int fps,int bitrate,bool hardware=true);
    // True when the hardware encoder stopped working or ignored Baseline: reopen with hardware=false.
    bool failed()const{return failed_;}
    bool hardware()const;
    QString name()const;
    void close();
    bool isOpen()const;
    // image: width x height, any 32-bit RGB format. Returns one access unit (may be empty while priming).
    QByteArray encode(const QImage& image,qint64 timeUs,bool keyframe,bool* isKey=nullptr);
    QString error()const{return error_;}
private:
    struct Impl;
    std::unique_ptr<Impl> d_;
    QString error_;
    bool failed_=false;
    bool openHardware(int width,int height,int fps,int bitrate);
    void configure(int fps,int bitrate);
    bool setTypes(int width,int height,int fps,int bitrate);
};

// Opus 48 kHz stereo, 20 ms frames (960 samples per channel).
class OpusAudioEncoder final {
public:
    static constexpr int FrameSamples=960;
    OpusAudioEncoder()=default;
    ~OpusAudioEncoder();
    bool open(int bitrate);
    QByteArray encode(const float* interleaved);
private:
    void* encoder_=nullptr;
};

// BT.709 limited-range NV12 from 32-bit RGB (even width/height).
void rgbToNv12(const QImage& image,uchar* destination);
