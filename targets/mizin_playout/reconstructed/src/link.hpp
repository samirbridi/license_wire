#pragma once
#include "cue.hpp"
#include <QElapsedTimer>
#include <QHash>
#include <QJsonObject>
#include <QObject>
#include <QPointer>
#include <QJsonArray>
#include <QSet>
#include <functional>
#include <memory>

class QUdpSocket;
class QTcpServer;
class QTcpSocket;
class QNetworkAccessManager;
class QNetworkReply;
class QFile;
class QCryptographicHash;

// ADR-019 Mizin Link, phase 1: discovery, pairing, authenticated sessions, shared clock and verified
// show + media distribution from one master to many followers on the LAN.
struct LinkPeer {QString id,name,role,version,address,show,keyId;quint16 port=0;qint64 lastSeenMs=0;double offsetMs=0,rttMs=0;int mediaReady=0,mediaTotal=0;double syncMs=-1;QString operatorName;};
struct LinkMedia {QString relative,sha256,source;qint64 size=0;};

class LinkNode final : public QObject {
    Q_OBJECT
public:
    enum class Role {Off,Master,Follower,Control};
    // Phase 4: master-side handler for remote commands; returns an error text, empty when executed.
    using CommandHandler=std::function<QString(const QJsonObject& command,const QString& operatorName)>;
    static constexpr quint16 DiscoveryPort=47800,DefaultPort=47810;
    LinkNode(const QString& name,const QString& stateDirectory,QObject* parent=nullptr);
    ~LinkNode() override;
    static QString generateCode();
    static QByteArray deriveKey(const QString& code);
    static QString keyId(const QByteArray& key);
    static QByteArray mac(const QByteArray& key,const QByteArray& data);
    // The PIN never travels: the station proves it with an HMAC of the session nonce.
    static QByteArray operatorKey(const QString& code,const QString& pin);
    bool startMaster(const QString& code,quint16 port=DefaultPort);
    bool startFollower(const QString& code,bool discover=true);
    bool startControl(const QString& code,const QString& operatorName,const QString& pin,bool discover=true);
    bool connectTo(const QString& host,quint16 port);
    void stop();
    Role role()const{return role_;}
    QString id()const{return id_;}
    QString name()const{return name_;}
    void setName(const QString& name){name_=name;}
    QString error()const{return error_;}
    QString code()const{return code_;}
    quint16 port()const;
    quint16 filePort()const;
    QList<LinkPeer> peers()const;
    // Master
    void publishShow(const Show& show,const QString& showName);
    QJsonObject manifest()const{return manifest_;}
    // Phase 2: playback state for mirroring followers (sent ~10x/s). Media paths are the manifest's relative ones.
    void broadcastState(const QJsonObject& state);
    // Phase 3: a take every node executes at the same master-clock instant.
    void broadcastTake(const QJsonObject& take);
    void setSyncError(double ms){syncErrorMs_=ms;}
    // Phase 4 (master): operators [{name,pin,level:"operator"|"viewer",programs:[ids], empty = all}].
    void setOperators(const QJsonArray& operators);
    void setCommandHandler(CommandHandler handler){commandHandler_=std::move(handler);}
    bool hasControlStations()const;
    void broadcastDesk(const QJsonObject& desk);
    // Phase 4 (control station)
    QString operatorName()const{return operator_;}
    int sendCommand(QJsonObject command);
    QString relativeFor(const QString& absolutePath)const{return relative_.value(absolutePath);}
    int revision()const{return revision_;}
    bool hashing()const{return hashing_;}
    // Follower
    bool connected()const{return sessionReady_;}
    QString masterName()const{return masterName_;}
    double clockOffsetMs()const{return offsetUs_/1000.0;}
    double rttMs()const{return rttUs_/1000.0;}
    qint64 localTimeUs()const{return clock_.nsecsElapsed()/1000;}
    qint64 masterTimeUs()const{return localTimeUs()+offsetUs_;}
    int mediaReady()const{return mediaReady_;}
    int mediaTotal()const{return mediaTotal_;}
    qint64 bytesDone()const{return bytesDone_;}
    qint64 bytesTotal()const{return bytesTotal_;}
    int downloads()const{return downloads_;}
    QString receivedShowPath()const{return receivedShowPath_;}
    int receivedRevision()const{return receivedRevision_;}
    qint64 msSinceState()const{return lastStateMs_<0?-1:clock_.elapsed()-lastStateMs_;}
    QString mediaRoot()const;
signals:
    void changed();
    void showReady(const QString& showPath);
    void stateReceived(const QJsonObject& state);
    void takeReceived(const QJsonObject& take);
    void deskReceived(const QJsonObject& desk);
    void commandAnswered(const QJsonObject& answer);
private:
    struct Session {QPointer<QTcpSocket> socket;QByteArray nonce,buffer;QString peerId,peerName,peerVersion,address;bool authenticated=false;quint64 sendSeq=0,recvSeq=0;double offsetMs=0,rttMs=0;int mediaReady=0,mediaTotal=0;double syncMs=-1;QString role="follower",operatorName,pinTag;};
    QString name_,stateDirectory_,id_,error_,code_;
    Role role_=Role::Off;
    QByteArray key_;
    QElapsedTimer clock_;
    QUdpSocket* discovery_=nullptr;
    QTcpServer* server_=nullptr;
    QTcpServer* files_=nullptr;
    QList<std::shared_ptr<Session>> sessions_;
    QHash<QString,LinkPeer> discovered_;
    QTimer* heartbeat_=nullptr;
    // master state
    QJsonObject manifest_;
    QHash<QString,QString> sources_;
    QHash<QString,QString> relative_;
    QHash<QString,QString> hashCache_;
    bool hashing_=false;
    int revision_=0;
    // follower state
    std::shared_ptr<Session> master_;
    bool sessionReady_=false;
    QString masterName_,masterHost_,receivedShowPath_;
    quint16 masterFilePort_=0;
    qint64 offsetUs_=0,rttUs_=0;
    QList<QPair<qint64,qint64>> clockSamples_;
    QJsonObject pendingManifest_;
    QList<LinkMedia> queue_;
    QNetworkAccessManager* network_=nullptr;
    QPointer<QNetworkReply> reply_;
    std::unique_ptr<QFile> part_;
    std::unique_ptr<QCryptographicHash> partHash_;
    int mediaReady_=0,mediaTotal_=0,downloads_=0,receivedRevision_=0;
    qint64 lastStateMs_=-1;
    double syncErrorMs_=-1;
    QJsonArray operators_;
    CommandHandler commandHandler_;
    QString operator_,pin_;
    bool denied_=false;
    int commandSeq_=0;
    bool client()const{return role_==Role::Follower||role_==Role::Control;}
    bool startClient(const QString& code,Role role,bool discover);
    QJsonObject findOperator(const QString& name)const;
    QJsonArray allowedPrograms(const QJsonObject& op)const{return op["level"].toString()=="operator"?op["programs"].toArray():QJsonArray{};}
    qint64 bytesDone_=0,bytesTotal_=0;
    void announce();
    void readDiscovery();
    void acceptSession();
    void acceptFile();
    void readSession(const std::shared_ptr<Session>& session);
    void send(const std::shared_ptr<Session>& session,const QString& type,const QJsonObject& body);
    void handle(const std::shared_ptr<Session>& session,const QString& type,const QJsonObject& body);
    void dropSession(const std::shared_ptr<Session>& session);
    void finishManifest(const QJsonObject& manifest,const QHash<QString,QString>& sources,const QHash<QString,QString>& cache);
    void receiveManifest(const QJsonObject& manifest);
    void downloadNext();
    void reportMedia();
    void fail(const QString& message);
};

int runLinkTests(const QString& directory,const QString& resultPath);
