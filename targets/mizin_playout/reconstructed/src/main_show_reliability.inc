    // Show reliability: autosave/crash recovery, .bak on save, missing-media relink (release roadmap #1).
    // Recovery lives in the operator profile; discarded recoveries are moved aside, never deleted silently.
    QTimer* autosaveTimer_=nullptr;
    QByteArray lastAutosave_;
    QString recoveryDirectory()const{return QDir(stateDirectory_).filePath("recovery");}
    QString recoveryPath()const{return QDir(recoveryDirectory()).filePath("recovery.mizinshow");}
    QString recoveryMetaPath()const{return QDir(recoveryDirectory()).filePath("recovery.json");}
    void startAutosave(){
        if(demo_||autosaveTimer_)return;autosaveTimer_=new QTimer(this);autosaveTimer_->setInterval(5000);
        connect(autosaveTimer_,&QTimer::timeout,this,[this]{autosaveTick();});autosaveTimer_->start();
    }
    // Writes the recovery copy only when the show has unsaved changes that differ from the last copy.
    bool autosaveTick(){
        if(demo_||!dirty_)return false;const auto payload=QJsonDocument(currentShow().json()).toJson();if(payload==lastAutosave_)return false;
        QDir().mkpath(recoveryDirectory());QSaveFile show(recoveryPath());if(!show.open(QIODevice::WriteOnly)||show.write(payload)!=payload.size()||!show.commit())return false;
        const auto meta=QJsonDocument(QJsonObject{{"original_path",projectPath_},{"saved_utc",QDateTime::currentDateTimeUtc().toString(Qt::ISODate)},{"version",QString(MizinVersion)}}).toJson();
        QSaveFile info(recoveryMetaPath());if(info.open(QIODevice::WriteOnly)){info.write(meta);info.commit();}
        lastAutosave_=payload;return true;
    }
    void clearRecovery(){QFile::remove(recoveryPath());QFile::remove(recoveryMetaPath());lastAutosave_.clear();}
    bool hasRecovery()const{return QFileInfo::exists(recoveryPath());}
    void discardRecovery(){
        const QString stamp=QDateTime::currentDateTime().toString("yyyyMMdd-HHmmss");QDir directory(recoveryDirectory());
        QFile::rename(recoveryPath(),directory.filePath("discarded-"+stamp+".mizinshow"));QFile::remove(recoveryMetaPath());
        auto old=directory.entryList({"discarded-*.mizinshow"},QDir::Files,QDir::Name);while(old.size()>5)directory.remove(old.takeFirst());
    }
    bool restoreRecovery(){
        QFile file(recoveryPath());if(!file.open(QIODevice::ReadOnly))return false;QJsonParseError error;const auto doc=QJsonDocument::fromJson(file.readAll(),&error);Show loaded;
        if(error.error!=QJsonParseError::NoError||!Show::read(doc.object(),loaded))return false;
        QFile metaFile(recoveryMetaPath());QString original;if(metaFile.open(QIODevice::ReadOnly))original=QJsonDocument::fromJson(metaFile.readAll()).object()["original_path"].toString();
        if(!applyShow(loaded,original))return false;
        if(original.isEmpty()){projectPath_.clear();showTitle_->setText(tx("Untitled show"));}
        dirty_=true;lastAutosave_.clear();footer_->setText(tx("Show recovered. Save it to keep the changes."));return true;
    }
public:
    // Called once at normal startup (not tests/boards, not when a show is passed on the command line).
    void offerRecovery(){
        if(demo_||!hasRecovery())return;QFile metaFile(recoveryMetaPath());QString when;
        if(metaFile.open(QIODevice::ReadOnly))when=QLocale(language_=="pt-BR"?"pt_BR":"en_US").toString(QDateTime::fromString(QJsonDocument::fromJson(metaFile.readAll()).object()["saved_utc"].toString(),Qt::ISODate).toLocalTime(),QLocale::ShortFormat);
        const auto answer=QMessageBox::question(this,tx("Recover show"),tx("Mizin Playout closed before the show was saved. Restore the automatic copy from %1?").arg(when.isEmpty()?tx("the last session"):when),QMessageBox::Yes|QMessageBox::No,QMessageBox::Yes);
        if(answer==QMessageBox::Yes&&restoreRecovery()){checkMissingMedia(true);return;}
        discardRecovery();
    }
    void checkMissingMedia(bool interactive){
        if(demo_)return;const auto missing=missingMedia();if(missing.isEmpty())return;
        footer_->setText(tx("%1 media files not found").arg(missing.size()));if(!interactive)return;
        if(QMessageBox::question(this,tx("Missing media"),tx("%1 media files of this show were not found (moved drive or folder?). Locate the media folder now?").arg(missing.size()),QMessageBox::Yes|QMessageBox::No,QMessageBox::Yes)==QMessageBox::Yes)relinkMedia();
    }
private:
    QStringList allShowMedia(){
        storeActivePlaylist();QStringList paths=library_;for(const auto& definition:programDefinitions_)for(const auto& cue:definition.cues)paths.append(cue.path);
        paths.removeDuplicates();paths.removeAll(QString());return paths;
    }
    QStringList missingMedia(){QStringList missing;for(const auto& path:allShowMedia())if(!QFileInfo::exists(path))missing.append(path);return missing;}
    // Finds each missing file by name under folder; with several same-named files the one sharing the longest
    // trailing folder path wins, and a tie is left unresolved rather than guessed. Returns old -> new.
    static QHash<QString,QString> relinkPlan(const QStringList& missing,const QString& folder){
        QHash<QString,QStringList> wanted;for(const auto& path:missing)wanted[QFileInfo(path).fileName().toLower()].append(path);
        QHash<QString,QStringList> found;int scanned=0;
        for(QDirIterator it(folder,QDir::Files|QDir::NoDotAndDotDot,QDirIterator::Subdirectories);it.hasNext()&&scanned<500000;++scanned){
            const QString path=it.next();const QString name=it.fileName().toLower();if(wanted.contains(name))found[name].append(QDir::cleanPath(path));}
        auto segments=[](const QString& path){return QDir::fromNativeSeparators(path).toLower().split('/',Qt::SkipEmptyParts);};
        QHash<QString,QString> plan;
        for(const auto& old:missing){
            const auto candidates=found.value(QFileInfo(old).fileName().toLower());if(candidates.isEmpty())continue;
            if(candidates.size()==1){plan.insert(old,candidates.first());continue;}
            const auto oldParts=segments(old);int best=-1,bestScore=-1;bool tie=false;
            for(int i=0;i<candidates.size();++i){const auto parts=segments(candidates[i]);int score=0;
                while(score<oldParts.size()&&score<parts.size()&&oldParts[oldParts.size()-1-score]==parts[parts.size()-1-score])++score;
                if(score>bestScore){bestScore=score;best=i;tie=false;}else if(score==bestScore)tie=true;}
            if(!tie&&best>=0)plan.insert(old,candidates[best]);
        }
        return plan;
    }
    int applyRelink(const QHash<QString,QString>& plan){
        if(plan.isEmpty())return 0;storeActivePlaylist();int changed=0;
        auto fix=[&](QString& path){const auto it=plan.constFind(path);if(it!=plan.cend()){path=it.value();++changed;}};
        for(auto& path:library_)fix(path);for(auto& definition:programDefinitions_)for(auto& cue:definition.cues)fix(cue.path);
        playlist_=programDefinitions_[selectedProgram_].cues;library_.removeDuplicates();dirty_=true;refreshTables();return changed;
    }
    void relinkMedia(){
        if(demo_)return;const auto missing=missingMedia();if(missing.isEmpty()){QMessageBox::information(this,tx("Missing media"),tx("All media files of this show were found."));return;}
        const QString folder=QFileDialog::getExistingDirectory(this,tx("Locate the media folder"));if(folder.isEmpty())return;
        footer_->setText(tx("Searching for missing media…"));QApplication::setOverrideCursor(Qt::WaitCursor);
        QFutureWatcher<QHash<QString,QString>> watcher;QEventLoop loop;connect(&watcher,&QFutureWatcher<QHash<QString,QString>>::finished,&loop,&QEventLoop::quit);
        watcher.setFuture(QtConcurrent::run([missing,folder]{return relinkPlan(missing,folder);}));loop.exec();QApplication::restoreOverrideCursor();
        const auto plan=watcher.result();applyRelink(plan);const auto remaining=missingMedia();
        QString text=tx("Relinked %1 of %2 media files.").arg(plan.size()).arg(missing.size());
        if(!remaining.isEmpty()){QStringList names;for(const auto& path:remaining.mid(0,12))names<<QFileInfo(path).fileName();text+="\n\n"+tx("Still missing:")+"\n"+names.join("\n")+(remaining.size()>12?"\n…":"");}
        footer_->setText(tx("Relinked %1 of %2 media files.").arg(plan.size()).arg(missing.size()));QMessageBox::information(this,tx("Missing media"),text);
    }
