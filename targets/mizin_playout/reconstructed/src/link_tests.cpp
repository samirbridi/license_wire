#include "link.hpp"
#include <QApplication>
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QTcpSocket>
#include <QTemporaryDir>
#include <QThread>
#include <cmath>
#include <functional>

namespace {
bool waitFor(const std::function<bool()>& predicate,int ms=15000){QElapsedTimer t;t.start();while(!predicate()&&t.elapsed()<ms){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();}
}

int runLinkTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);bool all=true;QJsonArray tests;
    auto record=[&](const QString& name,bool pass,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=pass;tests.append(details);all&=pass;qInfo().noquote()<<name<<(pass?"PASS":"FAIL")<<QJsonDocument(details).toJson(QJsonDocument::Compact);};
    QTemporaryDir work;const QString root=work.path();for(auto folder:{"master","f1","f2","bad","listen","media/a","media/b"})QDir().mkpath(root+"/"+folder);
    QFile::copy(QDir(directory).absoluteFilePath("01-h264.mp4"),root+"/media/a/clip.mp4");QFile::copy(QDir(directory).absoluteFilePath("03-h264.mkv"),root+"/media/b/clip.mp4");
    const QByteArray key=LinkNode::deriveKey("code-one");
    record("message_mac_detects_tampering",LinkNode::mac(key,"n|1|show|{}")!=LinkNode::mac(key,"n|1|show|{\"x\":1}")&&LinkNode::mac(key,"n|1|show|{}")!=LinkNode::mac(LinkNode::deriveKey("code-two"),"n|1|show|{}")&&LinkNode::keyId(key)==LinkNode::keyId(LinkNode::deriveKey(" CODE-ONE ")));
    LinkNode master("Main",root+"/master"),f1("Wall 1",root+"/f1"),f2("Backup",root+"/f2"),bad("Stranger",root+"/bad");
    const bool started=master.startMaster("code-one",0);record("master_starts",started&&master.port()>0&&master.filePort()>0,{{"error",master.error()}});
    f1.startFollower("code-one",false);f2.startFollower("code-one",false);bad.startFollower("wrong-code",false);
    f1.connectTo("127.0.0.1",master.port());f2.connectTo("127.0.0.1",master.port());bad.connectTo("127.0.0.1",master.port());
    const bool joined=waitFor([&]{return f1.connected()&&f2.connected();},8000);waitFor([]{return false;},800);
    record("followers_with_the_code_join",joined&&master.peers().size()==2&&f1.masterName()=="Main");
    record("wrong_code_is_rejected",!bad.connected()&&master.peers().size()==2&&!bad.error().isEmpty(),{{"error",bad.error()}});
    {   // A raw client sending forged messages is disconnected.
        QTcpSocket raw;raw.connectToHost("127.0.0.1",master.port());const bool open=raw.waitForConnected(3000);waitFor([&]{return raw.bytesAvailable()>0;},3000);raw.readAll();
        raw.write("{\"type\":\"auth\",\"seq\":1,\"body\":{\"id\":\"x\"},\"mac\":\"00\"}\n");raw.flush();const bool dropped=waitFor([&]{return raw.state()==QAbstractSocket::UnconnectedState;},4000);
        record("forged_messages_close_the_session",open&&dropped&&master.peers().size()==2);
    }
    waitFor([&]{return f1.rttMs()>0&&f2.rttMs()>0;},6000);waitFor([]{return false;},2000);
    // Each node has its own clock origin; the follower's estimate of master time must match the master's clock.
    const double error1=(f1.masterTimeUs()-master.localTimeUs())/1000.0,error2=(f2.masterTimeUs()-master.localTimeUs())/1000.0;
    record("follower_tracks_master_clock",f1.rttMs()>0&&f1.rttMs()<20&&std::abs(error1)<3&&std::abs(error2)<3,{{"offset_ms",f1.clockOffsetMs()},{"rtt_ms",f1.rttMs()},{"error_ms",error1},{"error2_ms",error2}});
    Show show;show.library={root+"/media/a/clip.mp4"};show.programs={ProgramDefinition{1,"Program A",{Cue{root+"/media/a/clip.mp4"},Cue{root+"/media/b/clip.mp4"},Cue{root+"/media/missing.mov"}}}};
    QString ready1,ready2;QObject::connect(&f1,&LinkNode::showReady,&f1,[&](const QString& path){ready1=path;});QObject::connect(&f2,&LinkNode::showReady,&f2,[&](const QString& path){ready2=path;});
    master.publishShow(show,"Opening Night");const bool delivered=waitFor([&]{return !ready1.isEmpty()&&!ready2.isEmpty();},30000);
    QFile file(ready1);Show received;const bool read=file.open(QIODevice::ReadOnly)&&Show::read(QJsonDocument::fromJson(file.readAll()).object(),received);file.close();
    const QString folder=QFileInfo(ready1).absolutePath();const auto cues=read?received.definitions()[0].cues:QList<Cue>{};
    record("show_and_media_reach_every_follower_verified",delivered&&read&&cues.size()==3&&cues[0].path=="media/clip.mp4"&&cues[1].path=="media/clip (2).mp4"
        &&QFileInfo(folder+"/media/clip.mp4").size()==QFileInfo(root+"/media/a/clip.mp4").size()&&QFileInfo(folder+"/media/clip (2).mp4").size()==QFileInfo(root+"/media/b/clip.mp4").size()
        &&QFileInfo::exists(folder+"/media/clip.mp4.sha256")&&f1.downloads()==2&&f2.downloads()==2&&f1.mediaReady()==2&&f1.mediaTotal()==2,{{"f1_downloads",f1.downloads()},{"folder",folder}});
    waitFor([&]{bool ok=true;for(const auto& p:master.peers())ok&=p.mediaReady==2;return ok;},5000);bool reported=true;for(const auto& p:master.peers())reported&=p.mediaReady==2&&p.mediaTotal==2;
    record("master_sees_follower_media_status",reported);
    QFile::remove(folder+"/media/clip (2).mp4");ready1.clear();ready2.clear();master.publishShow(show,"Opening Night");
    const bool resumed=waitFor([&]{return !ready1.isEmpty()&&!ready2.isEmpty();},30000);
    record("republish_downloads_only_missing_files",resumed&&f1.downloads()==3&&f2.downloads()==2&&QFileInfo(folder+"/media/clip (2).mp4").size()==QFileInfo(root+"/media/b/clip.mp4").size(),{{"f1_downloads",f1.downloads()},{"f2_downloads",f2.downloads()}});
    // Phase 4: control stations sign in with operator name + PIN; permissions are enforced by the master.
    master.setOperators(QJsonArray{QJsonObject{{"name","Ana"},{"pin","4321"},{"level","operator"},{"programs",QJsonArray{1}}},QJsonObject{{"name","Guest"},{"pin","1111"},{"level","viewer"},{"programs",QJsonArray{}}}});
    QList<QPair<QJsonObject,QString>> executed;master.setCommandHandler([&](const QJsonObject& command,const QString& op){executed.append({command,op});return QString();});
    LinkNode ana("Desk",root+"/ana"),guest("Lobby",root+"/guest"),intruder("Fake",root+"/intruder");
    ana.startControl("code-one","ana","4321",false);guest.startControl("code-one","Guest","1111",false);intruder.startControl("code-one","Ana","9999",false);
    for(auto* node:{&ana,&guest,&intruder})node->connectTo("127.0.0.1",master.port());
    const bool signedIn=waitFor([&]{return ana.connected()&&guest.connected();},8000);waitFor([&]{return !intruder.error().isEmpty();},4000);
    int stations=0;for(const auto& p:master.peers())if(p.role=="control")++stations;
    record("operators_sign_in_and_a_wrong_pin_is_refused",signedIn&&stations==2&&master.hasControlStations()&&!intruder.connected()&&intruder.error().contains("PIN"),{{"stations",stations},{"intruder",intruder.error()}});
    QJsonObject deskAna,deskGuest;bool followerDesk=false;
    QObject::connect(&ana,&LinkNode::deskReceived,&ana,[&](const QJsonObject& d){deskAna=d;});QObject::connect(&guest,&LinkNode::deskReceived,&guest,[&](const QJsonObject& d){deskGuest=d;});QObject::connect(&f1,&LinkNode::deskReceived,&f1,[&](const QJsonObject&){followerDesk=true;});
    master.broadcastDesk({{"master","Main"},{"programs",QJsonArray{QJsonObject{{"id",1}},QJsonObject{{"id",2}}}}});waitFor([&]{return !deskAna.isEmpty()&&!deskGuest.isEmpty();},5000);
    record("desk_carries_each_operator_permission",deskAna["level"].toString()=="operator"&&deskAna["allowed"].toArray()==QJsonArray{1}&&deskGuest["level"].toString()=="viewer"&&deskAna["programs"].toArray().size()==2&&!followerDesk);
    QList<QJsonObject> answersAna,answersGuest;QObject::connect(&ana,&LinkNode::commandAnswered,&ana,[&](const QJsonObject& a){answersAna.append(a);});QObject::connect(&guest,&LinkNode::commandAnswered,&guest,[&](const QJsonObject& a){answersGuest.append(a);});
    ana.sendCommand({{"action","cut"},{"program",1},{"row",0}});ana.sendCommand({{"action","black"},{"program",2}});guest.sendCommand({{"action","black"},{"program",1}});
    waitFor([&]{return answersAna.size()==2&&answersGuest.size()==1;},5000);
    record("commands_respect_permissions",executed.size()==1&&executed[0].second=="Ana"&&executed[0].first["action"].toString()=="cut"&&answersAna.size()==2&&answersAna[0]["ok"].toBool()&&!answersAna[1]["ok"].toBool()&&answersGuest.size()==1&&!answersGuest[0]["ok"].toBool(),
        {{"executed",int(executed.size())},{"ana_second",answersAna.size()>1?answersAna[1]["error"].toString():QString()},{"guest",answersGuest.isEmpty()?QString():answersGuest[0]["error"].toString()}});
    master.setOperators(QJsonArray{QJsonObject{{"name","Ana"},{"pin","5555"},{"level","operator"},{"programs",QJsonArray{}}}});
    const bool signedOut=waitFor([&]{return !ana.connected()&&!guest.connected();},5000);
    record("changing_a_pin_or_removing_an_operator_signs_the_station_out",signedOut&&ana.error().contains("PIN")&&f1.connected(),{{"ana",ana.error()},{"guest",guest.error()}});
    ana.stop();guest.stop();intruder.stop();
    LinkNode listener("Listener",root+"/listen");listener.startFollower("code-one",true);const bool heard=waitFor([&]{for(const auto& p:listener.peers())if(p.name=="Main")return true;return false;},5000);
    record("master_is_discovered_on_the_lan",heard||listener.error().contains("Discovery"),{{"heard",heard},{"note",heard?QString():listener.error()}});
    master.stop();const bool closed=waitFor([&]{return !f1.connected()&&!f2.connected();},5000);record("stopping_master_disconnects_followers",closed);
    listener.stop();f1.stop();f2.stop();bad.stop();
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"tests",tests},{"scope","In-process master and followers over loopback TCP plus LAN broadcast discovery on this computer. Not a multi-computer LAN or wireless qualification."}};
    QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return all?0:2;
}
