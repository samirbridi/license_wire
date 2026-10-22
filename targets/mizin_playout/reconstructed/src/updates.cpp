#include "updates.hpp"
#include "update_key.hpp"
#include "version.hpp"
#include <cmath>
#ifdef Q_OS_WIN
#include <Windows.h>
#include <bcrypt.h>
#endif

// Mizin Playout has its own update origin (Cloudflare Pages + R2), separate from P2PMizin.
static const QUrl updateRoot("https://playoutmizin.pages.dev/updates/");
static constexpr qint64 maximumDownload=512LL*1024*1024;
static QList<quint64> versionParts(const QString& version){
    const auto m=QRegularExpression("^v([0-9]{1,5})\\.([0-9]{1,5})\\.([0-9]{1,5}) \\(build ([0-9]{4,9})\\)$").match(version);
    if(!m.hasMatch())return {};return {m.captured(1).toULongLong(),m.captured(2).toULongLong(),m.captured(3).toULongLong(),m.captured(4).toULongLong()};
}
int UpdateRelease::compare(const QString& a,const QString& b){
    const auto left=versionParts(a),right=versionParts(b);if(left.size()!=4||right.size()!=4)return 0;
    for(int i=0;i<4;++i)if(left[i]!=right[i])return left[i]>right[i]?1:-1;return 0;
}
static bool signatureValid(const QByteArray& payload,const QByteArray& signature){
#ifdef Q_OS_WIN
    auto blob=QByteArray::fromBase64(UpdatePublicBlob);auto digest=QCryptographicHash::hash(payload,QCryptographicHash::Sha256);
    BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_KEY_HANDLE key=nullptr;bool valid=false;
    if(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_RSA_ALGORITHM,nullptr,0)>=0){
        if(BCryptImportKeyPair(algorithm,nullptr,BCRYPT_RSAPUBLIC_BLOB,&key,reinterpret_cast<PUCHAR>(blob.data()),ULONG(blob.size()),0)>=0){
            BCRYPT_PKCS1_PADDING_INFO padding{BCRYPT_SHA256_ALGORITHM};
            valid=BCryptVerifySignature(key,&padding,reinterpret_cast<PUCHAR>(digest.data()),ULONG(digest.size()),reinterpret_cast<PUCHAR>(const_cast<char*>(signature.constData())),ULONG(signature.size()),BCRYPT_PAD_PKCS1)>=0;BCryptDestroyKey(key);
        }BCryptCloseAlgorithmProvider(algorithm,0);
    }return valid;
#else
    Q_UNUSED(payload);Q_UNUSED(signature);return false;
#endif
}
bool UpdateRelease::readSigned(const QByteArray& bytes,UpdateRelease& release,QString& error){
    release={};auto invalid=[&](const QString& message){error=message;return false;};
    if(bytes.isEmpty()||bytes.size()>256*1024)return invalid("Invalid update metadata size");
    QJsonParseError parse;const auto envelope=QJsonDocument::fromJson(bytes,&parse);
    if(parse.error!=QJsonParseError::NoError||!envelope.isObject())return invalid("Invalid update metadata");
    const auto object=envelope.object();
    if(object["key_id"].toString()!=UpdateKeyId)return invalid("Update signature could not be verified");
    const auto payload=QByteArray::fromBase64(object["payload"].toString().toLatin1(),QByteArray::AbortOnBase64DecodingErrors);
    const auto signature=QByteArray::fromBase64(object["signature"].toString().toLatin1(),QByteArray::AbortOnBase64DecodingErrors);
    if(payload.isEmpty()||payload.size()>128*1024||!signatureValid(payload,signature))return invalid("Update signature could not be verified");
    const auto document=QJsonDocument::fromJson(payload,&parse);if(parse.error!=QJsonParseError::NoError||!document.isObject())return invalid("Invalid update metadata");
    const auto data=document.object();
    if(data["schema"].toInt()!=1||data["product"].toString()!="mizin-playout"||data["channel"].toString()!="preview"||data["platform"].toString()!="windows-x64")return invalid("Update is for another product or platform");
    const auto version=data["version"].toString();if(versionParts(version).isEmpty())return invalid("Invalid update version");
    const auto setup=data["artifacts"].toObject()["setup"].toObject();const auto file=setup["file"].toString(),sha=setup["sha256"].toString();const double size=setup["size"].toDouble(-1);
    if(!file.startsWith("releases/MizinPlayout-")||!file.endsWith("-setup.exe")||file.contains("..")||!QRegularExpression("^[A-Za-z0-9_./-]+$").match(file).hasMatch())return invalid("Invalid update download path");
    const auto url=updateRoot.resolved(QUrl(file));if(url.scheme()!="https"||url.host()!=updateRoot.host()||!url.path().startsWith("/updates/")||!url.userInfo().isEmpty()||url.hasQuery()||url.hasFragment())return invalid("Invalid update download path");
    if(!QRegularExpression("^[0-9a-f]{64}$").match(sha).hasMatch()||!std::isfinite(size)||size<=0||size>maximumDownload||std::floor(size)!=size)return invalid("Invalid update file size or hash");
    const auto notes=data["notes"].toObject();for(const auto& lang:{"en","pt-BR"}){
        const auto lines=notes[lang].toArray();if(lines.isEmpty()||lines.size()>80)return invalid("Update notes are unavailable");
        for(const auto& line:lines)if(!line.isString()||line.toString().isEmpty()||line.toString().size()>2000)return invalid("Invalid update notes");
    }
    release.version=version;release.sourceCommit=data["source_commit"].toString();release.file=file;release.sha256=sha;release.size=qint64(size);release.notes=notes;error.clear();return true;
}
bool UpdateRelease::matchesFile(const QString& path,const QString& expected,qint64 size){
    QFile file(path);if(!file.open(QIODevice::ReadOnly)||file.size()!=size)return false;QCryptographicHash hash(QCryptographicHash::Sha256);return hash.addData(&file)&&QString::fromLatin1(hash.result().toHex())==expected;
}
UpdateController::UpdateController(QString current,QString cache,QObject* parent):QObject(parent),current_(std::move(current)),cache_(std::move(cache)){}
UpdateController::~UpdateController(){if(reply_){reply_->disconnect(this);reply_->abort();}}
void UpdateController::fail(QString error){state_="error";error_=std::move(error);emit changed();}
static QNetworkRequest updateRequest(const QUrl& url){QNetworkRequest request(url);request.setAttribute(QNetworkRequest::RedirectPolicyAttribute,QNetworkRequest::ManualRedirectPolicy);request.setAttribute(QNetworkRequest::CacheLoadControlAttribute,QNetworkRequest::AlwaysNetwork);request.setTransferTimeout(30000);request.setRawHeader("User-Agent","MizinPlayout/"+QByteArray(MizinVersion));return request;}
bool UpdateController::acceptManifest(const QByteArray& data){
    QString error;if(!UpdateRelease::readSigned(data,release_,error)){fail(error);return false;}
    error_.clear();downloaded_.clear();progress_=0;
    state_=UpdateRelease::compare(release_.version,current_)>0?"available":"current";emit changed();if(state_=="available")emit available();return true;
}
void UpdateController::check(){
    if(reply_||state_=="downloading"||state_=="ready")return;
    canceled_=false;state_="checking";error_.clear();emit changed();
    auto* reply=network_.get(updateRequest(updateRoot.resolved(QUrl("preview/latest.json"))));reply->setReadBufferSize(64*1024);reply_=reply;
    auto bytes=std::make_shared<QByteArray>();connect(reply,&QNetworkReply::readyRead,this,[reply,bytes]{bytes->append(reply->readAll());if(bytes->size()>256*1024)reply->abort();});
    connect(reply,&QNetworkReply::finished,this,[this,reply,bytes]{
        bytes->append(reply->readAll());const bool ok=reply->error()==QNetworkReply::NoError&&reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt()==200;reply_=nullptr;reply->deleteLater();
        if(canceled_){state_="idle";emit changed();return;}if(!ok){fail("Could not check for updates. Playback is unaffected.");return;}acceptManifest(*bytes);
    });
}
void UpdateController::download(){
    if(reply_||release_.version.isEmpty()||(state_!="available"&&state_!="error"))return;
    if(!QDir().mkpath(cache_)){fail("Could not create the update download folder");return;}
    downloaded_=QDir(cache_).filePath(QFileInfo(release_.file).fileName());output_=std::make_unique<QSaveFile>(downloaded_);
    if(!output_->open(QIODevice::WriteOnly)){output_.reset();fail("Could not save the update download");return;}
    canceled_=false;received_=0;hash_.reset();progress_=0;state_="downloading";error_.clear();emit changed();
    auto* reply=network_.get(updateRequest(updateRoot.resolved(QUrl(release_.file))));reply->setReadBufferSize(1024*1024);reply_=reply;
    connect(reply,&QNetworkReply::readyRead,this,[this,reply]{
        const auto bytes=reply->readAll();received_+=bytes.size();
        if(received_>release_.size||received_>maximumDownload||!output_||output_->write(bytes)!=bytes.size()){reply->abort();return;}hash_.addData(bytes);progress_=int(100*received_/release_.size);emit changed();
    });
    connect(reply,&QNetworkReply::finished,this,[this,reply]{
        const bool ok=reply->error()==QNetworkReply::NoError&&reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt()==200&&received_==release_.size&&QString::fromLatin1(hash_.result().toHex())==release_.sha256;
        reply_=nullptr;reply->deleteLater();
        if(!ok||canceled_){if(output_)output_->cancelWriting();output_.reset();downloaded_.clear();if(canceled_){state_="available";error_.clear();emit changed();}else fail("Update download did not pass verification. Nothing was installed.");return;}
        if(!output_->commit()){output_.reset();downloaded_.clear();fail("Could not save the update download");return;}output_.reset();progress_=100;state_="ready";emit changed();
    });
}
void UpdateController::cancel(){canceled_=true;if(reply_)reply_->abort();}
bool UpdateController::launchInstaller(const QString& stateDirectory,const QString& showPath,const QString& language,bool portable,QString& error){
    if(state_!="ready"||!UpdateRelease::matchesFile(downloaded_,release_.sha256,release_.size)){error="Update download did not pass verification. Nothing was installed.";return false;}
    const auto app=QCoreApplication::applicationDirPath();
    if(!QFileInfo::exists(app+"/build-info.json")){error="Install updates from a packaged application.";return false;}
    const auto source=app+"/MizinUpdater.exe",helper=QDir(cache_).filePath("MizinUpdater-"+QUuid::createUuid().toString(QUuid::WithoutBraces)+".exe");
    if(!QFile::copy(source,helper)){error="Could not start the update installer";return false;}
    QStringList args{"--parent-pid",QString::number(QCoreApplication::applicationPid()),"--installer",downloaded_,"--sha256",release_.sha256,"--size",QString::number(release_.size),"--target",app,"--restart",QCoreApplication::applicationFilePath(),"--state-dir",stateDirectory,"--lang",language};
    if(!showPath.isEmpty())args<<"--show"<<showPath;if(portable)args<<"--portable";
    if(!QProcess::startDetached(helper,args,cache_)){error="Could not start the update installer";return false;}return true;
}
UpdatePanel::UpdatePanel(UpdateController* controller,Translate translate,std::function<void()> install,QWidget* parent):QFrame(parent),controller_(controller),tx_(std::move(translate)){
    setObjectName("panel");auto* layout=new QVBoxLayout(this);layout->setContentsMargins(24,24,24,24);layout->setSpacing(14);
    current_=new QLabel;status_=new QLabel;status_->setWordWrap(true);layout->addWidget(current_);layout->addWidget(status_);
    notes_=new QPlainTextEdit;notes_->setReadOnly(true);notes_->setMinimumHeight(180);layout->addWidget(notes_,1);
    progress_=new QProgressBar;progress_->setRange(0,100);layout->addWidget(progress_);
    auto* buttons=new QHBoxLayout;check_=new QPushButton;download_=new QPushButton;cancel_=new QPushButton;install_=new QPushButton;
    for(auto* b:{check_,download_,cancel_,install_})buttons->addWidget(b);buttons->addStretch();layout->addLayout(buttons);
    hint_=new QLabel;hint_->setWordWrap(true);layout->addWidget(hint_);
    connect(check_,&QPushButton::clicked,controller,&UpdateController::check);connect(download_,&QPushButton::clicked,controller,&UpdateController::download);connect(cancel_,&QPushButton::clicked,controller,&UpdateController::cancel);connect(install_,&QPushButton::clicked,this,[install]{install();});connect(controller,&UpdateController::changed,this,[this]{retranslate();});retranslate();
}
void UpdatePanel::retranslate(){
    current_->setText(tx_("Current version")+": "+controller_->currentVersion());const auto state=controller_->state();
    const QMap<QString,QString> labels{{"idle","Check for updates"},{"checking","Checking for updates…"},{"current","You are up to date"},{"available","Update available"},{"downloading","Downloading update…"},{"ready","Update ready to install"},{"error",controller_->error()}};
    status_->setText(tx_(labels.value(state))+((state=="available"||state=="ready")?" · "+controller_->release().version:QString()));
    QStringList lines;const auto lang=tx_("LANGUAGE_CODE")=="pt-BR"?"pt-BR":"en";for(const auto& note:controller_->release().notes[lang].toArray())lines<<"• "+note.toString();notes_->setPlainText(lines.join("\n\n"));
    check_->setText(tx_("Check now"));download_->setText(tx_("Download update"));cancel_->setText(tx_("Cancel download"));install_->setText(tx_("Install and restart"));
    check_->setEnabled(state!="checking"&&state!="downloading"&&state!="ready");download_->setEnabled(state=="available");cancel_->setVisible(state=="downloading");install_->setEnabled(state=="ready");progress_->setVisible(state=="downloading"||state=="ready");progress_->setValue(controller_->progress());
    hint_->setText(tx_("Updates are optional. Downloads start only when you choose. Stop playback and close outputs before installation; save your show first."));
}
