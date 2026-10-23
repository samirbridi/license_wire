#pragma once
#include "channel.hpp"
#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QStringList>
#include <atomic>
#include <functional>
#include <memory>

class QTcpServer;
class QTcpSocket;
class WebStream;

// ADR-017: opt-in, view-only local web monitor. Browsers on the LAN (or this computer only) list
// the Programs and watch them over WebRTC. One encoder per watched Program is shared by all of its
// viewers. Nothing listens until start(); no remote control endpoint exists.
struct WebProgramInfo {int id=0;QString name,media;bool onAir=false,playing=false;};

class WebMonitorServer final : public QObject {
    Q_OBJECT
public:
    using Programs=std::function<QList<WebProgramInfo>()>;
    using Channel=std::function<NativeChannel*(int id)>;
    static constexpr quint16 DefaultPort=8787;
    static constexpr quint16 MediaPortFirst=50200,MediaPortLast=50399;
    WebMonitorServer(Programs programs,Channel channel,QObject* parent=nullptr);
    ~WebMonitorServer() override;
    bool start(quint16 port,bool lan,const QString& code);
    void stop();
    bool running()const;
    quint16 port()const;
    bool lan()const{return lan_;}
    QString code()const{return code_;}
    void setCode(const QString& code);
    QStringList urls()const;
    int viewers()const;
    int encoders()const{return int(streams_.size());}
    QString error()const{return error_;}
    QJsonObject statistics()const;
    void programRemoved(int id);
    // 0 automatic (source size, at most 1080p), 1 720p, 2 1080p, 3 2160p. Applies live to every stream.
    void setQuality(int quality){quality_->store(qBound(0,quality,3));}
    int quality()const{return quality_->load();}
    static QString generateCode();
signals:
    void changed();
private:
    struct Request {QByteArray method,path;QHash<QString,QString> query;QByteArray body;};
    Programs programs_;
    Channel channel_;
    QTcpServer* server_=nullptr;
    bool lan_=false;
    QString code_,error_;
    std::shared_ptr<std::atomic<int>> quality_=std::make_shared<std::atomic<int>>(0);
    QHash<int,std::shared_ptr<WebStream>> streams_;
    QHash<QString,int> sessions_;
    QList<qint64> failures_;
    void read(QTcpSocket* socket);
    void handle(QTcpSocket* socket,const Request& request);
    void respond(QTcpSocket* socket,int status,const QByteArray& type,const QByteArray& body);
    void createSession(QTcpSocket* socket,int programId);
    void closeSession(const QString& session);
    void closeAll();
};

int runWebTests(const QString& directory,const QString& resultPath);
