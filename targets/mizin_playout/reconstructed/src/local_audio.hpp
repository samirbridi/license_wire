#pragma once
#include "channel.hpp"
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QStringList>
#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

// ADR-018: application-owned low-latency local audio output. Programs keep their Qt players (and
// playback clock); while the engine runs, their Qt sinks are muted and the engine pulls each Program's
// mix directly from the ring on a real-time thread, writes it to a chosen stereo pair of one device
// and delays it just enough to land with the published video (plus an operator offset for the display).
// Aes67: network audio (ADR-021). Dante: native Dante through the Audinate Dante Application Library (ADR-020),
// only in builds made after Audinate's licence; until then it is listed but unavailable.
enum class AudioBackend {Wasapi,WasapiShared,Asio,Test,Aes67,Dante};

struct AudioDeviceInfo {AudioBackend backend=AudioBackend::Wasapi;QString id,name;int channels=2;};

class AudioOutputBackend;

class LocalAudioEngine final : public QObject {
    Q_OBJECT
public:
    static constexpr int SampleRate=48000,MaxFrames=8192,MaxChannels=128;
    struct Route {QPointer<NativeChannel> channel;int firstChannel=0;};
    explicit LocalAudioEngine(QObject* parent=nullptr);
    ~LocalAudioEngine() override;
    static QList<AudioDeviceInfo> devices(AudioBackend backend);
    static bool asioAvailable();
    static bool danteAvailable();
    static QString backendName(AudioBackend backend);
    bool start(AudioBackend backend,const QString& deviceId,int bufferFrames);
    void stop();
    bool running()const{return running_.load();}
    QString error()const{return error_;}
    int deviceChannels()const{return deviceChannels_.load();}
    void setRoutes(const QList<Route>& routes);
    void setOffsetMs(int ms){offsetUs_=qint64(qBound(-200,ms,500))*1000;}
    void setAutoSync(bool enabled){autoSync_=enabled;}
    QJsonObject statistics()const;
    // Settings a backend reads when it opens (AES67: stream name, channels, multicast, latency, PTP).
    void setBackendOptions(const QJsonObject& options){backendOptions_=options;}
    QJsonObject backendOptions()const{return backendOptions_;}
    // Called by backends on their audio thread: fill frames x channels interleaved float.
    void render(float* out,int frames,int channels,qint64 deviceLatencyFrames);
    // Test backend support: open a backend that only calls render when asked.
    void renderTest(float* out,int frames,int channels,qint64 latencyFrames){render(out,frames,channels,latencyFrames);}
signals:
    void stateChanged();
private:
    friend class AudioOutputBackend;
    std::unique_ptr<AudioOutputBackend> backend_;
    std::atomic<bool> running_{false},autoSync_{true};
    std::atomic<int> deviceChannels_{0};
    std::atomic<qint64> offsetUs_{0};
    QString error_;
    QJsonObject backendOptions_;
    struct Live {QPointer<NativeChannel> channel;NativeChannel* raw=nullptr;int firstChannel=0;qint64 cursor=-1;qint64 delayUs=0;};
    mutable std::mutex routesMutex_;
    std::vector<Live> routes_;
    std::vector<float> scratch_;
    std::atomic<qint64> callbacks_{0},lateSamples_{0},corrections_{0},reanchors_{0},headroomUs_{10000},lastDelayUs_{0},bufferFrames_{0},deviceLatencyFrames_{0};
    std::atomic<double> renderMsMax_{0};
    void handleBackendFailure(const QString& message);
};

// One open device. Implementations run their own audio thread (WASAPI) or driver callbacks (ASIO).
class AudioOutputBackend {
public:
    explicit AudioOutputBackend(LocalAudioEngine* engine):engine_(engine){}
    virtual ~AudioOutputBackend()=default;
    virtual bool open(const QString& deviceId,int bufferFrames,QString* error)=0;
    virtual void close()=0;
    virtual int channels()const=0;
    virtual int bufferFrames()const=0;
    virtual QString description()const=0;
    // Backend-specific live status for the UI and tests (AES67: streams and PTP).
    virtual QJsonObject details()const{return {};}
protected:
    LocalAudioEngine* engine_;
    void fail(const QString& message){QMetaObject::invokeMethod(engine_,[engine=QPointer<LocalAudioEngine>(engine_),message]{if(engine)engine->handleBackendFailure(message);},Qt::QueuedConnection);}
};

int runAudioEngineTests(const QString& directory,const QString& resultPath);
