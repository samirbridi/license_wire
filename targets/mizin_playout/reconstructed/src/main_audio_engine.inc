    // ADR-018 low-latency local output panel. Manual start (optionally at launch). If the device fails or
    // is removed, every Program falls back to its normal Qt output automatically.
    std::unique_ptr<LocalAudioEngine> engine_;
    QComboBox *engineBackend_=nullptr,*engineDevice_=nullptr,*engineBuffer_=nullptr;
    QCheckBox *engineSync_=nullptr,*engineAutoStart_=nullptr;
    QSpinBox* engineOffset_=nullptr;
    QPushButton *engineStart_=nullptr,*engineStop_=nullptr;
    QLabel* engineStatus_=nullptr;
    QGridLayout* engineRoutes_=nullptr;
    QList<QComboBox*> enginePairs_;
    static constexpr int EnginePairs=32;
    QWidget* localEnginePanel(){
        engine_=std::make_unique<LocalAudioEngine>();
        auto* panel=new QFrame;panel->setObjectName("panel");auto* body=new QVBoxLayout(panel);body->setContentsMargins(16,16,16,16);body->setSpacing(12);
        body->addWidget(label("LOW-LATENCY OUTPUT","eyebrow"));
        auto* intro=label("Plays every Program through one audio interface with minimum delay (ASIO or WASAPI exclusive) and keeps it in sync with the video. Network outputs are not affected.","muted");intro->setWordWrap(true);body->addWidget(intro);
        auto* row=new QHBoxLayout;row->setSpacing(10);
        auto column=[&](const QString& key,QWidget* widget,int stretch){auto* c=new QVBoxLayout;c->addWidget(label(key,"eyebrow"));c->addWidget(widget);row->addLayout(c,stretch);};
        engineBackend_=new QComboBox;engineBackend_->setObjectName("engineBackend");engineBackend_->addItem(tx("WASAPI exclusive"),int(AudioBackend::Wasapi));engineBackend_->addItem(tx("WASAPI shared low-latency"),int(AudioBackend::WasapiShared));
        engineBackend_->addItem(LocalAudioEngine::asioAvailable()?QStringLiteral("ASIO"):tx("ASIO (needs the Steinberg licence build)"),int(AudioBackend::Asio));
        if(!LocalAudioEngine::asioAvailable())if(auto* model=qobject_cast<QStandardItemModel*>(engineBackend_->model()))model->item(2)->setEnabled(false);
        column("ENGINE",engineBackend_,2);
        engineDevice_=new QComboBox;engineDevice_->setObjectName("engineDevice");engineDevice_->setSizeAdjustPolicy(QComboBox::AdjustToMinimumContentsLengthWithIcon);engineDevice_->setMinimumContentsLength(18);column("DEVICE",engineDevice_,4);
        engineBuffer_=new QComboBox;engineBuffer_->setObjectName("engineBuffer");engineBuffer_->addItem(tx("Device minimum"),0);for(int frames:{64,96,128,256,512})engineBuffer_->addItem(tx("%1 samples (%2 ms)").arg(frames).arg(QLocale(language_=="pt-BR"?"pt_BR":"en_US").toString(frames/48.0,'f',1)),frames);column("BUFFER",engineBuffer_,2);
        engineStart_=button("Start low-latency output");engineStart_->setObjectName("engineStart");row->addWidget(engineStart_,0,Qt::AlignBottom);engineStop_=button("Stop");engineStop_->setObjectName("engineStop");row->addWidget(engineStop_,0,Qt::AlignBottom);body->addLayout(row);
        auto* sync=new QHBoxLayout;sync->setSpacing(10);engineSync_=new QCheckBox;bindings_.append({engineSync_,"Sync with the video automatically"});sync->addWidget(engineSync_);
        sync->addWidget(label("Fine adjust","muted"));engineOffset_=new QSpinBox;engineOffset_->setObjectName("engineOffset");engineOffset_->setRange(-200,500);engineOffset_->setSuffix(" ms");engineOffset_->setToolTip(tx("Positive values delay the audio, e.g. for projector or LED processing delay."));sync->addWidget(engineOffset_);
        sync->addStretch();engineAutoStart_=new QCheckBox;bindings_.append({engineAutoStart_,"Start when the app opens"});sync->addWidget(engineAutoStart_);body->addLayout(sync);
        auto* routes=new QWidget;engineRoutes_=new QGridLayout(routes);engineRoutes_->setContentsMargins(0,0,0,0);engineRoutes_->setHorizontalSpacing(10);body->addWidget(routes);
        engineStatus_=new QLabel;engineStatus_->setObjectName("muted");engineStatus_->setWordWrap(true);body->addWidget(engineStatus_);
        auto& s=*settings_;engineBackend_->setCurrentIndex(qMax(0,engineBackend_->findData(s.value("localAudio/backend",int(AudioBackend::Wasapi)).toInt())));if(engineBackend_->currentIndex()==2&&!LocalAudioEngine::asioAvailable())engineBackend_->setCurrentIndex(0);
        engineBuffer_->setCurrentIndex(qMax(0,engineBuffer_->findData(s.value("localAudio/buffer",0).toInt())));engineSync_->setChecked(s.value("localAudio/sync",true).toBool());engineOffset_->setValue(s.value("localAudio/offsetMs",0).toInt());engineAutoStart_->setChecked(s.value("localAudio/autoStart",false).toBool());
        engine_->setAutoSync(engineSync_->isChecked());engine_->setOffsetMs(engineOffset_->value());refreshEngineDevices();
        auto save=[this](const QString& key,const QVariant& value){if(!demo_)settings_->setValue("localAudio/"+key,value);};
        connect(engineBackend_,&QComboBox::currentIndexChanged,this,[this,save]{save("backend",engineBackend_->currentData());refreshEngineDevices();});
        connect(engineDevice_,&QComboBox::currentIndexChanged,this,[this,save]{if(engineDevice_->currentIndex()>=0)save("device",engineDevice_->currentData());});
        connect(engineBuffer_,&QComboBox::currentIndexChanged,this,[this,save]{save("buffer",engineBuffer_->currentData());});
        connect(engineSync_,&QCheckBox::toggled,this,[this,save](bool on){save("sync",on);engine_->setAutoSync(on);});
        connect(engineOffset_,&QSpinBox::valueChanged,this,[this,save](int ms){save("offsetMs",ms);engine_->setOffsetMs(ms);});
        connect(engineAutoStart_,&QCheckBox::toggled,this,[save](bool on){save("autoStart",on);});
        connect(engineStart_,&QPushButton::clicked,this,[this]{startLocalEngine(AudioBackend(engineBackend_->currentData().toInt()),engineDevice_->currentData().toString(),engineBuffer_->currentData().toInt());});
        connect(engineStop_,&QPushButton::clicked,this,[this]{engine_->stop();});
        connect(engine_.get(),&LocalAudioEngine::stateChanged,this,[this]{applyEngineOwnership();refreshEngineStatus();});
        auto* timer=new QTimer(panel);timer->setInterval(1000);connect(timer,&QTimer::timeout,this,[this]{if(engine_->running())refreshEngineStatus();});timer->start();
        if(!demo_&&engineAutoStart_->isChecked())QTimer::singleShot(0,this,[this]{startLocalEngine(AudioBackend(engineBackend_->currentData().toInt()),engineDevice_->currentData().toString(),engineBuffer_->currentData().toInt());});
        refreshEngineStatus();return panel;
    }
    void refreshEngineDevices(){
        const QSignalBlocker block(engineDevice_);const QString saved=settings_->value("localAudio/device").toString();engineDevice_->clear();
        for(const auto& device:LocalAudioEngine::devices(AudioBackend(engineBackend_->currentData().toInt())))engineDevice_->addItem(device.channels>0?QString("%1 · %2 ch").arg(device.name).arg(device.channels):device.name,device.id);
        engineDevice_->setCurrentIndex(qMax(0,engineDevice_->findData(saved)));if(engineStart_)refreshEngineStatus();
    }
    bool startLocalEngine(AudioBackend backend,const QString& device,int buffer){
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return false;}
        const bool started=engine_->start(backend,device,buffer);if(!started)footer_->setText(tx("Low-latency output could not start")+": "+tx(engine_->error()));
        applyEngineOwnership();refreshEngineStatus();return started;
    }
    QList<LocalAudioEngine::Route> engineRouteList(int skip=-1){
        QList<LocalAudioEngine::Route> routes;for(int i=0;i<programCount_;++i)if(i!=skip)routes.append({channelAt(i),2*qBound(0,settings_->value("localAudio/pair/"+preferencesId(i),0).toInt(),EnginePairs-1)});return routes;
    }
    // Programs hand local output to the engine only while it runs; otherwise Qt plays them as before.
    void applyEngineOwnership(int skip=-1){
        if(!engine_)return;const bool on=engine_->running();engine_->setRoutes(on?engineRouteList(skip):QList<LocalAudioEngine::Route>{});
        for(int i=0;i<programCount_;++i)if(i!=skip&&channelAt(i)->localEngine()!=on)channelAt(i)->setLocalEngine(on);
    }
    void rebuildEngineRoutes(){
        if(!engineRoutes_)return;while(auto* item=engineRoutes_->takeAt(0)){delete item->widget();delete item;}enginePairs_.clear();
        for(int i=0;i<programCount_;++i){
            auto* name=new QLabel(programLabel(i));engineRoutes_->addWidget(name,i/4,(i%4)*2);auto* pair=new QComboBox;pair->setObjectName("enginePair"+preferencesId(i));
            for(int p=0;p<EnginePairs;++p)pair->addItem(tx("Outputs %1–%2").arg(2*p+1).arg(2*p+2),p);pair->setCurrentIndex(qBound(0,settings_->value("localAudio/pair/"+preferencesId(i),0).toInt(),EnginePairs-1));
            const QString id=preferencesId(i);connect(pair,&QComboBox::currentIndexChanged,this,[this,id](int p){if(!demo_)settings_->setValue("localAudio/pair/"+id,p);applyEngineOwnership();refreshEngineStatus();});
            engineRoutes_->addWidget(pair,i/4,(i%4)*2+1);enginePairs_.append(pair);
        }
        applyEngineOwnership();refreshEngineStatus();
    }
    void refreshEngineStatus(){
        if(!engineStatus_)return;const bool on=engine_->running();engineStart_->setEnabled(!on&&engineDevice_->count()>0);engineStop_->setEnabled(on);engineBackend_->setEnabled(!on);engineDevice_->setEnabled(!on);engineBuffer_->setEnabled(!on);
        const int channels=engine_->deviceChannels();for(auto* pair:enginePairs_){if(auto* model=qobject_cast<QStandardItemModel*>(pair->model()))for(int p=0;p<pair->count();++p)model->item(p)->setEnabled(!on||2*p+2<=channels);}
        if(!on){engineStatus_->setText(engine_->error().isEmpty()?tx("Off. Programs play through their normal output (Audio routing below)."):tx("Low-latency output stopped")+": "+tx(engine_->error()));return;}
        const auto s=engine_->statistics();const QLocale locale(language_=="pt-BR"?"pt_BR":"en_US");double sync=0;for(const auto& route:s["routes"].toArray())sync=qMax(sync,route.toObject()["sync_delay_ms"].toDouble());
        engineStatus_->setText(tx("Running · %1 · device latency %2 ms · sync delay %3 ms · late samples %4").arg(s["device"].toString(),locale.toString(s["device_latency_ms"].toDouble(),'f',1),locale.toString(sync,'f',1)).arg(qint64(s["late_samples"].toDouble())));
    }
