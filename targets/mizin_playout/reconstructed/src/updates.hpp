#pragma once
#include <QtCore>
#include <QtNetwork>
#include <QtWidgets>
#include <functional>
#include <memory>

struct UpdateRelease {
    QString version,sourceCommit,file,sha256;
    qint64 size=0;
    QJsonObject notes;
    static bool readSigned(const QByteArray& envelope,UpdateRelease& release,QString& error);
    static int compare(const QString& a,const QString& b);
    static bool matchesFile(const QString& path,const QString& sha256,qint64 size);
};

class UpdateController final:public QObject {
    Q_OBJECT
public:
    explicit UpdateController(QString currentVersion,QString cacheDirectory,QObject* parent=nullptr);
    ~UpdateController() override;
    QString state()const{return state_;}
    QString error()const{return error_;}
    QString currentVersion()const{return current_;}
    const UpdateRelease& release()const{return release_;}
    int progress()const{return progress_;}
    QString downloadedFile()const{return downloaded_;}
    void check();
    void download();
    void cancel();
    bool acceptManifest(const QByteArray& data);
    bool launchInstaller(const QString& stateDirectory,const QString& showPath,const QString& language,bool portable,QString& error);
signals:
    void changed();
    void available();
private:
    QNetworkAccessManager network_;
    QPointer<QNetworkReply> reply_;
    QString current_,cache_,state_="idle",error_,downloaded_;
    UpdateRelease release_;
    int progress_=0;
    bool canceled_=false;
    std::unique_ptr<QSaveFile> output_;
    QCryptographicHash hash_{QCryptographicHash::Sha256};
    qint64 received_=0;
    void fail(QString error);
};

class UpdatePanel final:public QFrame {
public:
    using Translate=std::function<QString(const QString&)>;
    UpdatePanel(UpdateController* controller,Translate translate,std::function<void()> install,QWidget* parent=nullptr);
    void retranslate();
private:
    UpdateController* controller_;
    Translate tx_;
    QLabel *current_,*status_,*hint_;
    QPlainTextEdit* notes_;
    QProgressBar* progress_;
    QPushButton *check_,*download_,*cancel_,*install_;
};
int runUpdateTests(const QString& fixtures,const QString& resultPath,bool online);
