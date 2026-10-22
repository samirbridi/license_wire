#include "updates.hpp"
#include "version.hpp"
#include <QThread>

static bool updateWait(const std::function<bool()>& predicate,int milliseconds=60000){QElapsedTimer timer;timer.start();while(!predicate()&&timer.elapsed()<milliseconds){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();}
int runUpdateTests(const QString& directory,const QString& resultPath,bool online){
    bool all=true;QJsonArray tests;auto record=[&](const QString& name,bool pass){tests.append(QJsonObject{{"name",name},{"pass",pass}});all&=pass;};
    auto fixture=[&](const QString& name){QFile file(QDir(directory).filePath(name+".json"));if(!file.open(QIODevice::ReadOnly))return QByteArray{};return file.readAll();};
    UpdateRelease release;QString error;const auto valid=fixture("valid");record("signed_manifest_from_compiled_key_is_accepted",UpdateRelease::readSigned(valid,release,error)&&release.version.startsWith("v999.")&&release.notes["en"].toArray().size()==1);
    for(const auto& name:{"product","platform","channel","version","path","url","size","hash","notes"})record("signed_wrong_"+QString(name)+"_is_rejected",!UpdateRelease::readSigned(fixture(name),release,error));
    auto object=QJsonDocument::fromJson(valid).object();auto signature=object["signature"].toString();if(!signature.isEmpty())signature[0]=signature[0]=='A'?'B':'A';object["signature"]=signature;record("tampered_signature_is_rejected",!UpdateRelease::readSigned(QJsonDocument(object).toJson(),release,error));
    object=QJsonDocument::fromJson(valid).object();auto payload=QByteArray::fromBase64(object["payload"].toString().toLatin1());if(!payload.isEmpty())payload[0]='[';object["payload"]=QString::fromLatin1(payload.toBase64());record("tampered_payload_is_rejected",!UpdateRelease::readSigned(QJsonDocument(object).toJson(),release,error));
    record("malformed_json_is_rejected",!UpdateRelease::readSigned("{",release,error));record("oversized_metadata_is_rejected",!UpdateRelease::readSigned(QByteArray(257*1024,'x'),release,error));
    record("version_comparison_is_numeric",UpdateRelease::compare("v0.14.10 (build 0039)","v0.14.2 (build 0040)")>0);
    record("build_breaks_equal_semantic_version_ties",UpdateRelease::compare("v0.14.1 (build 0036)","v0.14.1 (build 0035)")>0);
    record("semantic_version_precedes_build",UpdateRelease::compare("v0.15.0 (build 0001)","v0.14.99 (build 9999)")>0);
    QDir().mkpath(QFileInfo(resultPath).absolutePath());QTemporaryDir temporary(QFileInfo(resultPath).absolutePath()+"/update-qa-XXXXXX");const QString path=temporary.filePath("fixture.bin");const QByteArray bytes="mizin update fixture bytes\n";{QFile file(path);file.open(QIODevice::WriteOnly);file.write(bytes);}
    const auto hash=QString::fromLatin1(QCryptographicHash::hash(bytes,QCryptographicHash::Sha256).toHex());
    record("exact_download_bytes_and_size_match",UpdateRelease::matchesFile(path,hash,bytes.size()));record("wrong_download_hash_rejected",!UpdateRelease::matchesFile(path,QString(64,'0'),bytes.size()));record("truncated_download_size_rejected",!UpdateRelease::matchesFile(path,hash,bytes.size()+1));
    UpdateController offline(MizinVersion,temporary.filePath("offline"));record("startup_does_not_download_or_install",offline.state()=="idle"&&offline.downloadedFile().isEmpty());offline.acceptManifest(valid);record("available_metadata_only_waits_for_user",offline.state()=="available"&&offline.downloadedFile().isEmpty()&&!QFileInfo::exists(temporary.filePath("offline")));
    QJsonObject live;
    if(online){
        UpdateController remote("v0.0.0 (build 0000)",temporary.filePath("online"));remote.check();const bool checked=updateWait([&]{return remote.state()!="checking";});record("live_cloudflare_feed_signature_and_schema_valid",checked&&remote.state()=="available");record("live_check_does_not_start_download",remote.downloadedFile().isEmpty()&&!QFileInfo::exists(temporary.filePath("online")));
        if(remote.state()=="available"){
            bool requestedCancel=false;const auto connection=QObject::connect(&remote,&UpdateController::changed,&remote,[&]{if(!requestedCancel&&remote.state()=="downloading"&&remote.progress()>0){requestedCancel=true;remote.cancel();}});
            remote.download();updateWait([&]{return remote.state()!="downloading";},120000);QObject::disconnect(connection);record("user_cancel_leaves_no_installable_partial",requestedCancel&&remote.state()=="available"&&remote.downloadedFile().isEmpty());
            remote.download();const bool downloaded=updateWait([&]{return remote.state()!="downloading";},180000);record("requested_live_download_is_size_and_hash_verified",downloaded&&remote.state()=="ready"&&UpdateRelease::matchesFile(remote.downloadedFile(),remote.release().sha256,remote.release().size));
            live={{"version",remote.release().version},{"sha256",remote.release().sha256},{"bytes",double(remote.release().size)},{"state",remote.state()},{"error",remote.error()}};
        }
    }
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"version",QString(MizinVersion)},{"tests",tests},{"online",online},{"live",live},{"scope","Native CNG signature/product/platform/path validation, optional actual Cloudflare check/cancel/verified download. No installer launch from these metadata tests. v999 fixtures are test-only, never releases."}};
    QFile file(resultPath);if(!file.open(QIODevice::WriteOnly))return 3;file.write(QJsonDocument(result).toJson());return all?0:2;
}
