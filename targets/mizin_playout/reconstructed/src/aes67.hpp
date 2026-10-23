#pragma once
#include <QByteArray>
#include <QJsonObject>
#include <QString>
#include <atomic>
#include <memory>
#include <mutex>
#include <thread>

// ADR-021 AES67 network audio. PtpClock is a PTPv2 (IEEE 1588-2008, E2E, multicast) ordinary clock with
// software timestamps: it follows the best grandmaster on the network (Dante devices in AES67 mode are one)
// and, in Auto mode, becomes a low-priority grandmaster itself when the network has none.
class PtpClock {
public:
    enum class Mode {Auto,SlaveOnly,MasterOnly};
    struct Status {bool running=false,locked=false,master=false;QString grandmaster,error;int domain=0;double offsetUs=0,pathDelayUs=0,rateppm=0;qint64 syncs=0,steps=0;};
    PtpClock();
    ~PtpClock();
    bool start(const QString& interfaceIp,int domain,Mode mode,QString* error);
    void stop();
    // Current PTP time (TAI nanoseconds since the PTP epoch). Valid from start(): own clock until locked.
    qint64 nowNs()const;
    Status status()const;
    QByteArray grandmasterIdentity()const;
    static QString identityText(const QByteArray& identity);
    static qint64 monotonicNs();
    // Tests: two clocks in one process need different identities.
    void setIdentity(const QByteArray& identity){identity_=identity;}
private:
    struct Impl;
    std::unique_ptr<Impl> d_;
    QByteArray identity_;
};

// RTP L24/48 kHz sender with 1 ms packets, up to 8 channels per stream, announced by SAP/SDP (RFC 2974 /
// RFC 4566 / RFC 7273) so Dante Controller and other AES67 receivers list it.
struct Aes67Options {
    QString interfaceIp,name="Mizin Playout",multicast;
    int channels=8,ttl=32,latencyMs=2,domain=0;
    PtpClock::Mode ptpMode=PtpClock::Mode::Auto;
    static Aes67Options fromJson(const QJsonObject& object,const QString& interfaceIp);
};
QString aes67DefaultMulticast(const QString& interfaceIp,int stream);
QByteArray aes67Sdp(const QString& name,const QString& sourceIp,const QString& multicast,int ttl,int channels,int domain,quint32 session,quint32 version,const QByteArray& grandmaster);
QByteArray sapPacket(bool deletion,quint16 hash,const QString& sourceIp,const QByteArray& sdp);

int runAes67Tests(const QString& directory,const QString& resultPath);
