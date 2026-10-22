    // ADR-019 phase 2: main + backup. The master publishes every Program's state ~10x/s; a follower with
    // "Mirror the master" applies it to its own Programs (same takes, pause, black, position). If the master
    // goes silent the follower keeps playing and shows MASTER LOST with a one-click take-over.
    static constexpr qint64 MirrorToleranceMs=80,MirrorSeekCooldownMs=1000,MasterLostMs=1500;
    QTimer* linkStateTimer_=nullptr;
    QCheckBox* linkMirror_=nullptr;
    QFrame* masterLostBanner_=nullptr;
    QLabel* masterLostText_=nullptr;
    bool masterLost_=false;
    QHash<int,quint64> mirroredSerial_;
    QHash<int,qint64> mirrorSeekAt_;
    int mirrorCorrections_=0;
    double mirrorErrorMs_=0;
    QString mirrorNote_;
    QElapsedTimer mirrorClock_;
    QFrame* createMasterLostBanner(){
        masterLostBanner_=new QFrame;masterLostBanner_->setObjectName("masterLost");auto* row=new QHBoxLayout(masterLostBanner_);row->setContentsMargins(12,8,12,8);
        masterLostText_=new QLabel;masterLostText_->setObjectName("masterLostText");masterLostText_->setWordWrap(true);row->addWidget(masterLostText_,1);
        auto* take=button("Take over as master");take->setObjectName("takeOver");row->addWidget(take);connect(take,&QPushButton::clicked,this,[this]{takeOverAsMaster();});
        masterLostBanner_->hide();return masterLostBanner_;
    }
    bool mirroring()const{return linkMirror_&&linkMirror_->isChecked()&&link_&&link_->role()==LinkNode::Role::Follower;}
    QJsonObject buildLinkState(){
        QJsonArray programs;
        for(int i=0;i<programCount_;++i){
            auto* c=channelAt(i);QJsonObject p{{"id",programDefinitions_[i].id},{"playing",c->playing()},{"pending",c->pending()},{"positionMs",double(c->position())},{"serial",double(c->activeGeneration())},{"loop",c->loop()}};
            if(!c->path().isEmpty()){const QString relative=link_->relativeFor(c->path());p["media"]=relative;p["unpublished"]=relative.isEmpty();Cue cue=c->cue();cue.path=relative;p["cue"]=cue.json();}
            else p["media"]=QString();
            programs.append(p);
        }
        return {{"revision",link_->revision()},{"sampleUs",double(link_->localTimeUs())},{"sync",syncMode()},{"programs",programs}};
    }
    void applyLinkState(const QJsonObject& state){
        if(!mirroring())return;if(!mirrorClock_.isValid())mirrorClock_.start();
        const QString showPath=link_->receivedShowPath();
        if(showPath.isEmpty()||QDir::cleanPath(projectPath_)!=QDir::cleanPath(showPath)||state["revision"].toInt()!=link_->receivedRevision()){mirrorNote_="Load the show received from the master to mirror it.";return;}
        mirrorNote_.clear();const QDir base=QFileInfo(showPath).absoluteDir();const qint64 elapsedUs=link_->masterTimeUs()-qint64(state["sampleUs"].toDouble());
        for(const auto& value:state["programs"].toArray()){
            const auto p=value.toObject();const int id=p["id"].toInt(),index=programIndexById(id);if(index<0)continue;auto* c=channelAt(index);auto* controller=controllerAt(index);
            if(mirrorClock_.elapsed()<pendingTakeUntil_.value(id,-1))continue; // a synchronized take is scheduled
            if(controller->sequential())controller->setSequential(false); // every take comes from the master
            if(c->loop()!=p["loop"].toBool())c->setLoop(p["loop"].toBool());
            const QString media=p["media"].toString();
            if(media.isEmpty()){
                if(p["unpublished"].toBool()){mirrorNote_="The master plays media that was not sent to this machine.";continue;}
                if(!c->path().isEmpty()||c->pending())controller->stop();mirroredSerial_.remove(id);continue;
            }
            const QString local=QDir::cleanPath(base.absoluteFilePath(media));const quint64 serial=quint64(p["serial"].toDouble());
            if(mirroredSerial_.value(id)!=serial){Cue cue;if(!Cue::read(p["cue"],cue))continue;cue.path=local;mirroredSerial_[id]=serial;mirrorSeekAt_[id]=mirrorClock_.elapsed();c->cancelPrepared();c->loadCue(cue,true);continue;}
            if(c->pending()||p["pending"].toBool())continue;
            const bool playing=p["playing"].toBool();if(c->playing()!=playing){c->setPlaybackRate(1.0);c->togglePause();continue;}
            const qint64 expected=qint64(p["positionMs"].toDouble())+(playing?elapsedUs/1000:0);qint64 error=c->position()-expected;
            // Looping: compare on the loop circle, so one side wrapping a moment earlier is not a 3 s error.
            if(const qint64 span=c->cue().end(c->duration())-c->cue().in;c->loop()&&span>0)error=((error%span)+span+span/2)%span-span/2;
            mirrorErrorMs_=double(error);link_->setSyncError(std::abs(double(error)));
            if(state["sync"].toBool()&&playing&&syncCorrect(c,id,error))continue;
            if(c->playbackRate()!=1.0)c->setPlaybackRate(1.0);
            if(std::llabs(error)>MirrorToleranceMs&&mirrorClock_.elapsed()-mirrorSeekAt_.value(id,-100000)>MirrorSeekCooldownMs){c->seek(qMax<qint64>(0,c->position()-error));mirrorSeekAt_[id]=mirrorClock_.elapsed();++mirrorCorrections_;}
        }
    }
    void watchMaster(){
        const bool lost=mirroring()&&!link_->receivedShowPath().isEmpty()&&(!link_->connected()||link_->msSinceState()<0||link_->msSinceState()>MasterLostMs);
        if(lost!=masterLost_){masterLost_=lost;if(lost)footer_->setText(tx("MASTER LOST — this machine keeps playing on its own."));}
        if(masterLostBanner_){masterLostText_->setText(tx("MASTER LOST — this machine keeps playing on its own. Switch the screens to it if needed, or take over as master."));masterLostBanner_->setVisible(masterLost_);}
    }
    bool takeOverAsMaster(){
        if(!link_||demo_)return false;const bool wasMirroring=mirroring();if(linkCode_->text().trimmed().size()<6)linkCode_->setText(link_->code());link_->stop();linkRole_->setCurrentIndex(0);masterLost_=false;watchMaster();
        const bool started=startLink();if(started&&wasMirroring){storeActivePlaylist();link_->publishShow(currentShow(),QFileInfo(projectPath_).completeBaseName());}
        footer_->setText(started?tx("This machine is now the master."):tx("Mizin Link could not start")+": "+link_->error());return started;
    }
    void setupMirroring(QVBoxLayout* body){
        linkMirror_=new QCheckBox;linkMirror_->setObjectName("linkMirror");bindings_.append({linkMirror_,"Mirror the master (backup): repeat every take, pause, black and position"});linkMirror_->setChecked(settings_->value("link/mirror",false).toBool());body->addWidget(linkMirror_);
        connect(linkMirror_,&QCheckBox::toggled,this,[this](bool on){if(!demo_)settings_->setValue("link/mirror",on);mirroredSerial_.clear();mirrorCorrections_=0;watchMaster();refreshLink();});
        linkStateTimer_=new QTimer(this);linkStateTimer_->setInterval(100);
        connect(linkStateTimer_,&QTimer::timeout,this,[this]{
            if(link_->role()==LinkNode::Role::Master&&!link_->manifest().isEmpty()&&!link_->peers().isEmpty())link_->broadcastState(buildLinkState());
            watchMaster();});
        linkStateTimer_->start();
        connect(link_.get(),&LinkNode::stateReceived,this,[this](const QJsonObject& state){applyLinkState(state);});
        connect(link_.get(),&LinkNode::takeReceived,this,[this](const QJsonObject& take){applyLinkTake(take);});
        linkSync_=new QCheckBox;linkSync_->setObjectName("linkSync");bindings_.append({linkSync_,"Synchronized takes (several PCs playing together): every machine switches at the same instant; CUT/FADE wait 0.4 s"});linkSync_->setChecked(settings_->value("link/sync",false).toBool());body->addWidget(linkSync_);
        connect(linkSync_,&QCheckBox::toggled,this,[this](bool on){if(!demo_)settings_->setValue("link/sync",on);refreshLink();});
    }
    QString mirrorStatus()const{
        if(!mirroring())return {};if(!mirrorNote_.isEmpty())return tx(mirrorNote_);
        return tx("mirroring · position error %1 ms · corrections %2").arg(qRound(mirrorErrorMs_)).arg(mirrorCorrections_);
    }
public:
    // End-to-end: a real master window and a real backup window in one process, over loopback.
    static int runLinkMirrorTests(const QString& directory,const QString& resultPath);
private:
