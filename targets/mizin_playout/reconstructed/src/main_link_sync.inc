    // ADR-019 phase 3: several PCs playing together. With "Synchronized takes" the master turns CUT/FADE into a
    // prepare-now / start-at-T take that every mirroring node executes at the same master-clock instant; followers
    // then hold sync by nudging playback speed (±5%) instead of jumping, and seek only beyond 250 ms.
    static constexpr int SyncLeadMs=400;
    static constexpr qint64 SyncSeekMs=250,SyncDeadbandMs=8;
    QCheckBox* linkSync_=nullptr;
    QHash<int,qint64> pendingTakeUntil_;
    bool syncMode()const{return linkSync_&&linkSync_->isChecked()&&link_&&link_->role()==LinkNode::Role::Master&&!link_->peers().isEmpty()&&link_->revision()>0;}
    // Runs takePrepared() on channel at atLocalUs (this node's Link clock). A node whose preparation is late starts
    // as soon as it is ready and jumps ahead by the delay, so its picture is at the same point as everyone else's.
    void scheduleTake(NativeChannel* channel,qint64 atLocalUs){
        QPointer<NativeChannel> guard=channel;
        auto run=[this,guard,atLocalUs]{if(!guard)return;if(guard->prepared()){guard->takePrepared();return;}
            auto* c=guard.data();auto connection=std::make_shared<QMetaObject::Connection>();
            *connection=connect(c,&NativeChannel::preparedReady,c,[this,c,connection,atLocalUs]{disconnect(*connection);c->takePrepared();
                const qint64 lateMs=(link_->localTimeUs()-atLocalUs)/1000;if(lateMs>SyncDeadbandMs)c->seek(c->cue().in+lateMs);});};
        auto* timer=new QTimer(this);timer->setSingleShot(true);timer->setTimerType(Qt::PreciseTimer);connect(timer,&QTimer::timeout,this,[timer,run]{run();timer->deleteLater();});
        timer->start(int(qMax<qint64>(0,(atLocalUs-link_->localTimeUs())/1000)));
    }
    bool syncTake(PlaylistController::ManualTake mode){storeActivePlaylist();return syncTakeOn(selectedProgram_,cuedRow_,mode,manualFadeTime_->value());}
    bool syncTakeOn(int index,int row,PlaylistController::ManualTake mode,int fadeMs){
        const auto items=programDefinitions_[index].cues;if(row<0||row>=items.size())return false;Cue incoming=items[row];
        incoming.transition=mode==PlaylistController::ManualTake::Cut?Transition::Cut:Transition::Dissolve;
        incoming.transitionMs=incoming.enterMs=mode==PlaylistController::ManualTake::Cut?0:fadeMs;
        const QString relative=link_->relativeFor(incoming.path);
        if(relative.isEmpty()){footer_->setText(tx("This media was not sent to the other machines. Send the show again to take it in sync."));return false;}
        auto* c=channelAt(index);controllerAt(index)->adoptTake(items,row);c->cancelPrepared();c->prepareCue(incoming);
        const qint64 at=link_->localTimeUs()+SyncLeadMs*1000;Cue sent=incoming;sent.path=relative;
        link_->broadcastTake({{"id",programDefinitions_[index].id},{"cue",sent.json()},{"serial",double(c->requestGeneration())},{"atUs",double(at)}});
        scheduleTake(c,at);return true;
    }
    void applyLinkTake(const QJsonObject& take){
        if(!mirroring())return;const QString showPath=link_->receivedShowPath();if(showPath.isEmpty()||QDir::cleanPath(projectPath_)!=QDir::cleanPath(showPath))return;
        const int id=take["id"].toInt(),index=programIndexById(id);Cue cue;if(index<0||!Cue::read(take["cue"],cue))return;
        if(!mirrorClock_.isValid())mirrorClock_.start();
        cue.path=QDir::cleanPath(QFileInfo(showPath).absoluteDir().absoluteFilePath(cue.path));auto* c=channelAt(index);
        mirroredSerial_[id]=quint64(take["serial"].toDouble());
        // Master time -> this node's clock (masterTime = local + offset). State for this Program waits until the take ran.
        const qint64 atLocal=qint64(take["atUs"].toDouble())-(link_->masterTimeUs()-link_->localTimeUs());
        pendingTakeUntil_[id]=mirrorClock_.elapsed()+qMax<qint64>(0,(atLocal-link_->localTimeUs())/1000)+700;
        c->cancelPrepared();c->prepareCue(cue);scheduleTake(c,atLocal);
    }
    // Speed-based correction used while the master runs synchronized takes. Returns true when handled.
    bool syncCorrect(NativeChannel* c,int id,qint64 error){
        if(std::llabs(error)>SyncSeekMs){if(mirrorClock_.elapsed()-mirrorSeekAt_.value(id,-100000)>MirrorSeekCooldownMs){c->setPlaybackRate(1.0);c->seek(qMax<qint64>(0,c->position()-error));mirrorSeekAt_[id]=mirrorClock_.elapsed();++mirrorCorrections_;}return true;}
        c->setPlaybackRate(std::llabs(error)<=SyncDeadbandMs?1.0:1.0-std::clamp(double(error)/500.0,-0.05,0.05));return true;
    }
    // Per-display AREA: which part of the Program this screen shows (LED wall split across outputs or PCs).
    QList<QComboBox*> areaBoxes_;
    QList<QList<QDoubleSpinBox*>> areaValues_;
    static const QList<QPair<QString,QRectF>>& areaPresets(){
        static const QList<QPair<QString,QRectF>> presets{{"Full frame",{0,0,1,1}},{"Left half",{0,0,.5,1}},{"Right half",{.5,0,.5,1}},{"Top half",{0,0,1,.5}},{"Bottom half",{0,.5,1,.5}},
            {"Left third",{0,0,1.0/3,1}},{"Center third",{1.0/3,0,1.0/3,1}},{"Right third",{2.0/3,0,1.0/3,1}},
            {"Top-left quarter",{0,0,.5,.5}},{"Top-right quarter",{.5,0,.5,.5}},{"Bottom-left quarter",{0,.5,.5,.5}},{"Bottom-right quarter",{.5,.5,.5,.5}}};
        return presets;
    }
    QRectF routeRegion(int index)const{
        if(index<0||index>=areaBoxes_.size())return {0,0,1,1};const int preset=areaBoxes_[index]->currentIndex();
        if(preset>=0&&preset<areaPresets().size())return areaPresets()[preset].second;const auto& v=areaValues_[index];return QRectF(v[0]->value()/100,v[1]->value()/100,v[2]->value()/100,v[3]->value()/100);
    }
    void applyRouteArea(int index){
        const bool custom=areaBoxes_[index]->currentIndex()==areaPresets().size();for(auto* box:areaValues_[index])box->setVisible(custom);
        if(!demo_){settings_->setValue(QString("outputArea%1").arg(index),areaBoxes_[index]->currentIndex());QStringList v;for(auto* box:areaValues_[index])v<<QString::number(box->value());settings_->setValue(QString("outputRegion%1").arg(index),v.join(','));}
        if(index<routeWindows_.size()&&routeWindows_[index])routeWindows_[index]->setRegion(routeRegion(index));
    }
    void appendRouteArea(QVBoxLayout* body,int i){
        auto* row=new QHBoxLayout;row->setSpacing(8);row->addWidget(label("AREA","eyebrow"));auto* area=new QComboBox;area->setObjectName("routeArea");area->setToolTip(tx("Area of the video shown on this screen (LED wall split across PCs). X, Y, width and height in % of the video."));
        for(const auto& preset:areaPresets())area->addItem(tx(preset.first));area->addItem(tx("Custom area"));row->addWidget(area,1);areaBoxes_.append(area);
        const QStringList saved=settings_->value(QString("outputRegion%1").arg(i),"0,0,100,100").toString().split(',');QList<QDoubleSpinBox*> values;
        for(int k=0;k<4;++k){auto* box=new QDoubleSpinBox;box->setRange(k<2?0:1,k<2?99:100);box->setDecimals(2);box->setSuffix(" %");box->setPrefix(QStringList{"X ","Y ","W ","H "}[k]);box->setValue(saved.size()==4?saved[k].toDouble():(k<2?0:100));values.append(box);row->addWidget(box);}
        areaValues_.append(values);body->addLayout(row);
        area->setCurrentIndex(std::clamp(settings_->value(QString("outputArea%1").arg(i),0).toInt(),0,int(areaPresets().size())));applyRouteArea(i);
        connect(area,&QComboBox::currentIndexChanged,this,[this,i]{applyRouteArea(i);});for(auto* box:values)connect(box,&QDoubleSpinBox::valueChanged,this,[this,i]{applyRouteArea(i);});
    }
