#include "link.hpp"
#include "version.hpp"
#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QFutureWatcher>
#include <QJsonArray>
#include <QJsonDocument>
#include <QMessageAuthenticationCode>
#include <QNetworkAccessManager>
#include <QNetworkDatagram>
#include <QNetworkInterface>
#include <QNetworkProxy>
#include <QNetworkReply>
#include <QRandomGenerator>
#include <QSaveFile>
#include <QTcpServer>
#include <QTcpSocket>
#include <QTimer>
#include <QUdpSocket>
#include <QUuid>
#include <QtConcurrent>
#include <algorithm>

namespace {
QByteArray compact(const QJsonObject& object){return QJsonDocument(object).toJson(QJsonDocument::Compact);}
QByteArray randomHex(int bytes){QByteArray data(bytes,Qt::Uninitialized);for(auto& c:data)c=char(QRandomGenerator::system()->bounded(256));return data.toHex();}
QString sha256File(const QString& path){
    QFile file(path);if(!file.open(QIODevice::ReadOnly))return {};QCryptographicHash hash(QCryptographicHash::Sha256);QByteArray buffer(4*1024*1024,Qt::Uninitialized);
    while(!file.atEnd()){const qint64 n=file.read(buffer.data(),buffer.size());if(n<0)return {};hash.addData(QByteArrayView(buffer.constData(),n));}return hash.result().toHex();
}
QString safeName(QString name){name=name.trimmed();for(QChar& c:name)if(QStringLiteral("\\/:*?\"<>|").contains(c))c='_';return name.isEmpty()?QStringLiteral("Show"):name.left(80);}
constexpr qint64 MaxLine=8*1024*1024;
}

LinkNode::LinkNode(const QString& name,const QString& stateDirectory,QObject* parent):QObject(parent),name_(name),stateDirectory_(stateDirectory){
    clock_.start();QDir().mkpath(QDir(stateDirectory_).filePath("link"));QFile file(QDir(stateDirectory_).filePath("link/node-id.txt"));
    if(file.open(QIODevice::ReadOnly))id_=QString::fromUtf8(file.readAll()).trimmed();
    if(id_.size()<8){id_=QUuid::createUuid().toString(QUuid::WithoutBraces);QSaveFile out(file.fileName());if(out.open(QIODevice::WriteOnly)){out.write(id_.toUtf8());out.commit();}}
}
LinkNode::~LinkNode(){stop();}
QString LinkNode::generateCode(){static const QString alphabet="abcdefghjkmnpqrstuvwxyz23456789";QString code;for(int i=0;i<10;++i)code+=alphabet[int(QRandomGenerator::system()->bounded(alphabet.size()))];return code;}
QByteArray LinkNode::deriveKey(const QString& code){return QCryptographicHash::hash(("mizin-link-v1|"+code.trimmed().toLower()).toUtf8(),QCryptographicHash::Sha256);}
QString LinkNode::keyId(const QByteArray& key){return QString::fromLatin1(QCryptographicHash::hash(key,QCryptographicHash::Sha256).toHex().left(12));}
QByteArray LinkNode::mac(const QByteArray& key,const QByteArray& data){return QMessageAuthenticationCode::hash(data,key,QCryptographicHash::Sha256).toHex();}
QString LinkNode::mediaRoot()const{return QDir(stateDirectory_).filePath("link-media");}
quint16 LinkNode::port()const{return server_?server_->serverPort():0;}
quint16 LinkNode::filePort()const{return files_?files_->serverPort():0;}
void LinkNode::fail(const QString& message){error_=message;emit changed();}

bool LinkNode::startMaster(const QString& code,quint16 port){
    stop();key_=deriveKey(code);role_=Role::Master;error_.clear();
    server_=new QTcpServer(this);files_=new QTcpServer(this);
    if(!server_->listen(QHostAddress::AnyIPv4,port)||!files_->listen(QHostAddress::AnyIPv4,port?quint16(port+1):0)){const QString message=server_->isListening()?files_->errorString():server_->errorString();stop();fail(message);return false;}
    connect(server_,&QTcpServer::newConnection,this,&LinkNode::acceptSession);connect(files_,&QTcpServer::newConnection,this,&LinkNode::acceptFile);
    discovery_=new QUdpSocket(this);heartbeat_=new QTimer(this);heartbeat_->setInterval(1000);connect(heartbeat_,&QTimer::timeout,this,&LinkNode::announce);heartbeat_->start();announce();
    emit changed();return true;
}
bool LinkNode::startFollower(const QString& code,bool discover){
    stop();key_=deriveKey(code);role_=Role::Follower;error_.clear();network_=new QNetworkAccessManager(this);network_->setProxy(QNetworkProxy::NoProxy);
    if(discover){discovery_=new QUdpSocket(this);if(discovery_->bind(QHostAddress::AnyIPv4,DiscoveryPort,QUdpSocket::ShareAddress|QUdpSocket::ReuseAddressHint))connect(discovery_,&QUdpSocket::readyRead,this,&LinkNode::readDiscovery);else error_="Discovery port busy; connect by address";}
    heartbeat_=new QTimer(this);heartbeat_->setInterval(500);
    connect(heartbeat_,&QTimer::timeout,this,[this]{
        const qint64 now=QDateTime::currentMSecsSinceEpoch();for(auto it=discovered_.begin();it!=discovered_.end();)if(now-it->lastSeenMs>5000)it=discovered_.erase(it);else ++it;
        if(sessionReady_){send(master_,"ping",{{"t1",double(localTimeUs())}});static int tick=0;if(++tick%4==0)reportMedia();}
        else if(!master_)for(const auto& peer:discovered_)if(peer.keyId==keyId(key_)){connectTo(peer.address,peer.port);break;}
        emit changed();
    });
    heartbeat_->start();emit changed();return true;
}
bool LinkNode::connectTo(const QString& host,quint16 port){
    if(role_!=Role::Follower)return false;if(master_)dropSession(master_);
    auto session=std::make_shared<Session>();auto* socket=new QTcpSocket(this);session->socket=socket;session->address=host;masterHost_=host;master_=session;
    socket->setSocketOption(QAbstractSocket::LowDelayOption,1);
    connect(socket,&QTcpSocket::readyRead,this,[this,session]{readSession(session);});
    connect(socket,&QTcpSocket::disconnected,this,[this,session]{dropSession(session);});
    connect(socket,&QTcpSocket::errorOccurred,this,[this,session](QAbstractSocket::SocketError){dropSession(session);});
    socket->connectToHost(host,port);return true;
}
void LinkNode::stop(){
    if(reply_){reply_->abort();reply_=nullptr;}part_.reset();partHash_.reset();queue_.clear();
    for(const auto& session:sessions_)if(session->socket){session->socket->disconnect(this);session->socket->abort();session->socket->deleteLater();}
    sessions_.clear();if(master_&&master_->socket){master_->socket->disconnect(this);master_->socket->abort();master_->socket->deleteLater();}master_.reset();sessionReady_=false;
    for(QObject* object:std::initializer_list<QObject*>{server_,files_,discovery_,heartbeat_,network_})if(object)object->deleteLater();
    server_=nullptr;files_=nullptr;discovery_=nullptr;heartbeat_=nullptr;network_=nullptr;discovered_.clear();clockSamples_.clear();offsetUs_=rttUs_=0;
    const bool wasActive=role_!=Role::Off;role_=Role::Off;if(wasActive)emit changed();
}

void LinkNode::announce(){
    if(!discovery_||role_!=Role::Master)return;
    const QByteArray datagram=compact({{"t","mizin-link"},{"id",id_},{"name",name_},{"role","master"},{"version",QString(MizinVersion)},{"port",int(port())},{"keyId",keyId(key_)},{"show",manifest_["name"].toString()}});
    discovery_->writeDatagram(datagram,QHostAddress::Broadcast,DiscoveryPort);
    for(const auto& interface:QNetworkInterface::allInterfaces())if(interface.flags().testFlag(QNetworkInterface::IsUp)&&interface.flags().testFlag(QNetworkInterface::CanBroadcast))
        for(const auto& entry:interface.addressEntries())if(!entry.broadcast().isNull())discovery_->writeDatagram(datagram,entry.broadcast(),DiscoveryPort);
}
void LinkNode::readDiscovery(){
    while(discovery_&&discovery_->hasPendingDatagrams()){
        const auto datagram=discovery_->receiveDatagram(4096);const auto object=QJsonDocument::fromJson(datagram.data()).object();
        if(object["t"].toString()!="mizin-link"||object["role"].toString()!="master"||object["id"].toString()==id_)continue;
        LinkPeer peer;peer.id=object["id"].toString();peer.name=object["name"].toString().left(80);peer.role="master";peer.version=object["version"].toString().left(40);peer.keyId=object["keyId"].toString();
        peer.port=quint16(object["port"].toInt());peer.show=object["show"].toString().left(120);bool ok=false;const quint32 ip=datagram.senderAddress().toIPv4Address(&ok);if(!ok||!peer.port)continue;
        peer.address=QHostAddress(ip).toString();peer.lastSeenMs=QDateTime::currentMSecsSinceEpoch();discovered_.insert(peer.id,peer);
    }
}

void LinkNode::acceptSession(){
    while(server_&&server_->hasPendingConnections()){
        auto* socket=server_->nextPendingConnection();socket->setSocketOption(QAbstractSocket::LowDelayOption,1);
        auto session=std::make_shared<Session>();session->socket=socket;session->nonce=randomHex(16);session->address=QHostAddress(socket->peerAddress().toIPv4Address()).toString();sessions_.append(session);
        connect(socket,&QTcpSocket::readyRead,this,[this,session]{readSession(session);});connect(socket,&QTcpSocket::disconnected,this,[this,session]{dropSession(session);});
        send(session,"hello",{{"nonce",QString::fromLatin1(session->nonce)},{"id",id_},{"name",name_},{"version",QString(MizinVersion)}});
        // Unauthenticated connections are closed after 5 s.
        QTimer::singleShot(5000,this,[this,session]{if(!session->authenticated)dropSession(session);});
    }
}
void LinkNode::send(const std::shared_ptr<Session>& session,const QString& type,const QJsonObject& body){
    if(!session||!session->socket)return;const quint64 seq=++session->sendSeq;
    const QByteArray signature=mac(key_,session->nonce+"|"+QByteArray::number(seq)+"|"+type.toUtf8()+"|"+compact(body));
    session->socket->write(compact({{"type",type},{"seq",double(seq)},{"body",body},{"mac",QString::fromLatin1(signature)}})+"\n");
}
void LinkNode::readSession(const std::shared_ptr<Session>& session){
    if(!session->socket)return;session->buffer+=session->socket->readAll();if(session->buffer.size()>MaxLine){dropSession(session);return;}
    for(int end=session->buffer.indexOf('\n');end>=0;end=session->buffer.indexOf('\n')){
        const QByteArray line=session->buffer.left(end);session->buffer.remove(0,end+1);const auto message=QJsonDocument::fromJson(line).object();
        const QString type=message["type"].toString();const auto body=message["body"].toObject();const quint64 seq=quint64(message["seq"].toDouble());
        if(role_==Role::Follower&&type=="hello"&&!session->authenticated&&session->nonce.isEmpty())session->nonce=body["nonce"].toString().toLatin1();
        const QByteArray expected=mac(key_,session->nonce+"|"+QByteArray::number(seq)+"|"+type.toUtf8()+"|"+compact(body));
        // Wrong code, tampering or replay: the session is closed.
        if(session->nonce.isEmpty()||message["mac"].toString().toLatin1()!=expected||seq<=session->recvSeq){
            if(role_==Role::Follower&&!sessionReady_)fail("Link code does not match the master");dropSession(session);return;}
        session->recvSeq=seq;
        if(role_==Role::Master&&!session->authenticated&&type!="auth"){dropSession(session);return;}
        handle(session,type,body);if(!session->socket)return;
    }
}
void LinkNode::handle(const std::shared_ptr<Session>& session,const QString& type,const QJsonObject& body){
    if(role_==Role::Master){
        if(type=="auth"){session->authenticated=true;session->peerId=body["id"].toString().left(64);session->peerName=body["name"].toString().left(80);session->peerVersion=body["version"].toString().left(40);
            send(session,"welcome",{{"name",name_},{"filePort",int(filePort())}});if(!manifest_.isEmpty())send(session,"show",manifest_);emit changed();}
        else if(type=="ping")send(session,"pong",{{"t1",body["t1"]},{"t2",double(localTimeUs())}});
        else if(type=="status"){session->offsetMs=body["offsetMs"].toDouble();session->rttMs=body["rttMs"].toDouble();session->mediaReady=body["mediaReady"].toInt();session->mediaTotal=body["mediaTotal"].toInt();emit changed();}
        return;
    }
    if(type=="hello")send(session,"auth",{{"id",id_},{"name",name_},{"version",QString(MizinVersion)}});
    else if(type=="welcome"){session->authenticated=true;sessionReady_=true;error_.clear();masterName_=body["name"].toString().left(80);masterFilePort_=quint16(body["filePort"].toInt());emit changed();}
    else if(type=="pong"){
        const qint64 t4=localTimeUs(),t1=qint64(body["t1"].toDouble()),t2=qint64(body["t2"].toDouble());if(t4<t1)return;
        clockSamples_.append({t4-t1,t2-(t1+t4)/2});while(clockSamples_.size()>16)clockSamples_.removeFirst();
        const auto best=*std::min_element(clockSamples_.cbegin(),clockSamples_.cend(),[](const auto& a,const auto& b){return a.first<b.first;});rttUs_=best.first;offsetUs_=best.second;emit changed();
    }
    else if(type=="show")receiveManifest(body);
}
void LinkNode::dropSession(const std::shared_ptr<Session>& session){
    if(!session)return;if(session->socket){session->socket->disconnect(this);session->socket->abort();session->socket->deleteLater();session->socket=nullptr;}
    sessions_.removeAll(session);if(session==master_){master_.reset();sessionReady_=false;if(reply_){reply_->abort();}}emit changed();
}
QList<LinkPeer> LinkNode::peers()const{
    QList<LinkPeer> list;
    if(role_==Role::Master){for(const auto& session:sessions_)if(session->authenticated)list.append({session->peerId,session->peerName,"follower",session->peerVersion,session->address,manifest_["name"].toString(),{},0,0,session->offsetMs,session->rttMs,session->mediaReady,session->mediaTotal});}
    else for(const auto& peer:discovered_)list.append(peer);
    return list;
}

// ---- Master: show manifest and file service ----
void LinkNode::publishShow(const Show& show,const QString& showName){
    if(role_!=Role::Master)return;hashing_=true;emit changed();
    Show copy=show;QStringList media=copy.library;for(const auto& program:copy.definitions())for(const auto& cue:program.cues)media.append(cue.path);media.removeDuplicates();media.removeAll(QString());
    QHash<QString,QString> relative;QSet<QString> used;
    for(const auto& path:media){const QFileInfo info(path);if(!info.isFile())continue;QString file=info.fileName();
        for(int n=2;used.contains(file.toLower());++n)file=info.completeBaseName()+QString(" (%1)").arg(n)+(info.suffix().isEmpty()?QString():"."+info.suffix());used.insert(file.toLower());relative.insert(path,"media/"+file);}
    auto fix=[&](QString& path){const auto it=relative.constFind(path);if(it!=relative.cend())path=it.value();};
    copy.programs=copy.definitions();for(auto& path:copy.library)fix(path);for(auto& cue:copy.cues)fix(cue.path);for(auto& program:copy.programs)for(auto& cue:program.cues)fix(cue.path);
    const QJsonObject showJson=copy.json();const auto cache=hashCache_;const QString name=safeName(showName);
    auto* watcher=new QFutureWatcher<QPair<QJsonObject,QHash<QString,QString>>>(this);
    connect(watcher,&QFutureWatcherBase::finished,this,[this,watcher]{const auto result=watcher->result();watcher->deleteLater();
        QHash<QString,QString> sources;for(const auto& item:result.first["media"].toArray())sources.insert(item.toObject()["sha256"].toString(),item.toObject()["source"].toString());
        QJsonObject manifest=result.first;QJsonArray clean;for(const auto& item:manifest["media"].toArray()){auto o=item.toObject();o.remove("source");clean.append(o);}manifest["media"]=clean;
        finishManifest(manifest,sources,result.second);});
    watcher->setFuture(QtConcurrent::run([relative,cache,showJson,name]{
        QHash<QString,QString> hashes=cache;QJsonArray items;
        for(auto it=relative.cbegin();it!=relative.cend();++it){const QFileInfo info(it.key());const QString cacheKey=it.key()+"|"+QString::number(info.size())+"|"+QString::number(info.lastModified().toMSecsSinceEpoch());
            QString sha=hashes.value(cacheKey);if(sha.isEmpty()){sha=sha256File(it.key());if(sha.isEmpty())continue;hashes.insert(cacheKey,sha);}
            items.append(QJsonObject{{"relative",it.value()},{"size",double(info.size())},{"sha256",sha},{"source",it.key()}});}
        return qMakePair(QJsonObject{{"name",name},{"show",showJson},{"media",items}},hashes);}));
}
void LinkNode::finishManifest(const QJsonObject& manifest,const QHash<QString,QString>& sources,const QHash<QString,QString>& cache){
    hashing_=false;if(role_!=Role::Master){emit changed();return;}
    manifest_=manifest;manifest_["revision"]=++revision_;sources_=sources;hashCache_=cache;
    for(const auto& session:sessions_)if(session->authenticated)send(session,"show",manifest_);announce();emit changed();
}
void LinkNode::acceptFile(){
    while(files_&&files_->hasPendingConnections()){
        auto* socket=files_->nextPendingConnection();QTimer::singleShot(30000,socket,[socket]{if(socket->property("serving").toBool()==false)socket->abort();});
        connect(socket,&QTcpSocket::disconnected,socket,&QObject::deleteLater);
        connect(socket,&QTcpSocket::readyRead,this,[this,socket]{
            if(socket->property("serving").toBool())return;QByteArray head=socket->property("head").toByteArray()+socket->readAll();
            if(head.size()>16384){socket->abort();return;}const int end=head.indexOf("\r\n\r\n");if(end<0){socket->setProperty("head",head);return;}
            const auto lines=head.left(end).split('\n');const auto first=lines.value(0).trimmed().split(' ');QByteArray proof;
            for(const auto& line:lines.mid(1)){const int colon=line.indexOf(':');if(colon>0&&line.left(colon).trimmed().toLower()=="x-mizin-link-proof")proof=line.mid(colon+1).trimmed();}
            const QByteArray path=first.value(1);const QString sha=QString::fromLatin1(path.mid(7));
            auto reply=[socket](const QByteArray& status){socket->write("HTTP/1.1 "+status+"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");socket->disconnectFromHost();};
            if(first.value(0)!="GET"||!path.startsWith("/media/")){reply("404 Not Found");return;}
            if(proof!=mac(key_,"file|"+sha.toLatin1())||!sources_.contains(sha)){reply("403 Forbidden");return;}
            auto* file=new QFile(sources_.value(sha),socket);if(!file->open(QIODevice::ReadOnly)){reply("404 Not Found");return;}
            socket->setProperty("serving",true);
            socket->write("HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: "+QByteArray::number(file->size())+"\r\nConnection: close\r\n\r\n");
            auto pump=[socket,file]{while(socket->bytesToWrite()<4*1024*1024&&!file->atEnd()){const QByteArray chunk=file->read(1024*1024);if(chunk.isEmpty())break;socket->write(chunk);}if(file->atEnd()&&socket->bytesToWrite()==0)socket->disconnectFromHost();};
            connect(socket,&QTcpSocket::bytesWritten,socket,pump);pump();
        });
    }
}

// ---- Follower: manifest, downloads, verification ----
void LinkNode::receiveManifest(const QJsonObject& manifest){
    if(reply_){reply_->abort();reply_=nullptr;}part_.reset();partHash_.reset();
    pendingManifest_=manifest;queue_.clear();const QString folder=QDir(mediaRoot()).filePath(safeName(manifest["name"].toString()));
    const auto items=manifest["media"].toArray();mediaTotal_=items.size();bytesTotal_=0;bytesDone_=0;
    for(const auto& value:items){const auto o=value.toObject();LinkMedia media{o["relative"].toString(),o["sha256"].toString(),{},qint64(o["size"].toDouble())};
        if(!media.relative.startsWith("media/")||media.relative.contains("..")||media.sha256.size()!=64)continue;
        const QString target=QDir(folder).filePath(media.relative);QFile sidecar(target+".sha256");
        const bool present=QFileInfo(target).size()==media.size&&sidecar.open(QIODevice::ReadOnly)&&QString::fromLatin1(sidecar.readAll()).trimmed()==media.sha256;
        if(!present){queue_.append(media);bytesTotal_+=media.size;}}
    mediaReady_=mediaTotal_-queue_.size();reportMedia();emit changed();downloadNext();
}
void LinkNode::reportMedia(){if(sessionReady_)send(master_,"status",{{"offsetMs",clockOffsetMs()},{"rttMs",rttMs()},{"mediaReady",mediaReady_},{"mediaTotal",mediaTotal_}});}
void LinkNode::downloadNext(){
    if(reply_||!network_)return;const QString folder=QDir(mediaRoot()).filePath(safeName(pendingManifest_["name"].toString()));
    if(queue_.isEmpty()){
        if(pendingManifest_.isEmpty())return;QDir().mkpath(folder);const QString showPath=QDir(folder).filePath(safeName(pendingManifest_["name"].toString())+".mizinshow");
        QSaveFile file(showPath);const QByteArray payload=QJsonDocument(pendingManifest_["show"].toObject()).toJson();
        if(file.open(QIODevice::WriteOnly)&&file.write(payload)==payload.size()&&file.commit()){receivedShowPath_=showPath;reportMedia();emit changed();emit showReady(showPath);}
        else fail("Could not write the received show");
        return;
    }
    if(!sessionReady_||!masterFilePort_)return;
    const LinkMedia media=queue_.first();const QString target=QDir(folder).filePath(media.relative);QDir().mkpath(QFileInfo(target).absolutePath());
    part_=std::make_unique<QFile>(target+".part");if(!part_->open(QIODevice::WriteOnly)){fail("Cannot write "+target);queue_.removeFirst();downloadNext();return;}
    partHash_=std::make_unique<QCryptographicHash>(QCryptographicHash::Sha256);
    QNetworkRequest request(QUrl(QString("http://%1:%2/media/%3").arg(masterHost_).arg(masterFilePort_).arg(media.sha256)));
    request.setRawHeader("X-Mizin-Link-Proof",mac(key_,"file|"+media.sha256.toLatin1()));request.setRawHeader("X-Mizin-Link-Id",id_.toLatin1());
    reply_=network_->get(request);auto* reply=reply_.data();
    connect(reply,&QNetworkReply::readyRead,this,[this,reply]{const QByteArray chunk=reply->readAll();if(part_)part_->write(chunk);if(partHash_)partHash_->addData(chunk);bytesDone_+=chunk.size();});
    connect(reply,&QNetworkReply::finished,this,[this,reply,media,target]{
        reply->deleteLater();if(reply_==reply)reply_=nullptr;const QByteArray rest=reply->readAll();if(part_){part_->write(rest);part_->close();}if(partHash_)partHash_->addData(rest);
        const bool ok=reply->error()==QNetworkReply::NoError&&partHash_&&QString::fromLatin1(partHash_->result().toHex())==media.sha256&&QFileInfo(target+".part").size()==media.size;
        part_.reset();partHash_.reset();
        if(ok){QFile::remove(target);QFile::rename(target+".part",target);QSaveFile sidecar(target+".sha256");if(sidecar.open(QIODevice::WriteOnly)){sidecar.write(media.sha256.toLatin1());sidecar.commit();}++mediaReady_;++downloads_;}
        else{QFile::remove(target+".part");if(reply->error()!=QNetworkReply::OperationCanceledError)fail("Download failed or did not match: "+media.relative);}
        if(!queue_.isEmpty()&&queue_.first().sha256==media.sha256)queue_.removeFirst();reportMedia();emit changed();if(reply->error()!=QNetworkReply::OperationCanceledError)downloadNext();
    });
}
