    // ADR-019 Mizin Link page (phase 1): pair machines with a code, send the show + media from the master,
    // load it on followers. Off until started; never restored automatically at launch.
    std::unique_ptr<LinkNode> link_;
    QComboBox* linkRole_=nullptr;
    QLineEdit *linkName_=nullptr,*linkCode_=nullptr,*linkAddress_=nullptr;
    QPushButton *linkStart_=nullptr,*linkStop_=nullptr,*linkNewCode_=nullptr,*linkSend_=nullptr,*linkLoad_=nullptr;
    QLabel *linkStatus_=nullptr,*linkHint_=nullptr;
    QTableWidget* linkPeers_=nullptr;
    QWidget* linkPage(){
        const QString host=QSysInfo::machineHostName();link_=std::make_unique<LinkNode>(settings_->value("link/name",host).toString(),stateDirectory_);
        auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(16,16,16,16);l->setSpacing(14);l->addWidget(label("Mizin Link","heading"));
        auto* intro=label("Connect several Mizin Playout machines on the same network. The master sends the show and its media to the others, verified file by file. Backup mirroring and synchronized playback come next.","muted");intro->setWordWrap(true);l->addWidget(intro);
        auto* panel=new QFrame;panel->setObjectName("panel");auto* body=new QVBoxLayout(panel);body->setContentsMargins(16,16,16,16);body->setSpacing(12);
        auto* row=new QHBoxLayout;row->setSpacing(10);auto column=[&](const QString& key,QWidget* widget,int stretch){auto* c=new QVBoxLayout;c->addWidget(label(key,"eyebrow"));c->addWidget(widget);row->addLayout(c,stretch);};
        linkRole_=new QComboBox;linkRole_->setObjectName("linkRole");linkRole_->addItem(tx("Master (sends the show)"),int(LinkNode::Role::Master));linkRole_->addItem(tx("Follower (receives)"),int(LinkNode::Role::Follower));
        linkRole_->setCurrentIndex(settings_->value("link/role",0).toInt()==1?1:0);column("ROLE",linkRole_,2);
        linkName_=new QLineEdit(link_->name());linkName_->setObjectName("linkName");linkName_->setMaxLength(60);column("MACHINE NAME",linkName_,2);
        linkCode_=new QLineEdit(settings_->value("link/code").toString());linkCode_->setObjectName("linkCode");linkCode_->setMaxLength(32);column("LINK CODE",linkCode_,2);
        linkNewCode_=button("New code");row->addWidget(linkNewCode_,0,Qt::AlignBottom);body->addLayout(row);
        auto* actions=new QHBoxLayout;actions->setSpacing(10);linkAddress_=new QLineEdit(settings_->value("link/masterAddress").toString());linkAddress_->setObjectName("linkAddress");linkAddress_->setPlaceholderText(tx("Master address (optional, found automatically)"));actions->addWidget(linkAddress_,2);
        linkStart_=button("Start Link");linkStart_->setObjectName("linkStart");actions->addWidget(linkStart_);linkStop_=button("Stop Link");linkStop_->setObjectName("linkStop");actions->addWidget(linkStop_);
        linkSend_=button("Send show to machines");linkSend_->setObjectName("linkSend");actions->addWidget(linkSend_);linkLoad_=button("Load received show");linkLoad_->setObjectName("linkLoad");actions->addWidget(linkLoad_);body->addLayout(actions);
        setupMirroring(body);
        linkStatus_=new QLabel;linkStatus_->setObjectName("muted");linkStatus_->setWordWrap(true);body->addWidget(linkStatus_);
        linkPeers_=new QTableWidget(0,5);linkPeers_->setObjectName("linkPeers");linkPeers_->setEditTriggers(QAbstractItemView::NoEditTriggers);linkPeers_->setSelectionMode(QAbstractItemView::NoSelection);linkPeers_->verticalHeader()->hide();linkPeers_->setShowGrid(false);
        linkPeers_->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);linkPeers_->setMinimumHeight(170);body->addWidget(linkPeers_);l->addWidget(panel);
        linkHint_=label("Use the same Link code on every machine. Machines must be on the same wired network; Windows may ask to allow network access the first time (TCP 47810–47811, UDP 47800).","muted");linkHint_->setWordWrap(true);l->addWidget(linkHint_);l->addStretch();
        connect(linkNewCode_,&QPushButton::clicked,this,[this]{linkCode_->setText(LinkNode::generateCode());});
        connect(linkStart_,&QPushButton::clicked,this,[this]{startLink();});connect(linkStop_,&QPushButton::clicked,this,[this]{link_->stop();refreshLink();});
        connect(linkSend_,&QPushButton::clicked,this,[this]{storeActivePlaylist();link_->publishShow(currentShow(),projectPath_.isEmpty()?tx("Untitled show"):QFileInfo(projectPath_).completeBaseName());refreshLink();});
        connect(linkLoad_,&QPushButton::clicked,this,[this]{loadLinkShow();});
        connect(link_.get(),&LinkNode::changed,this,[this]{refreshLink();});
        connect(link_.get(),&LinkNode::showReady,this,[this]{footer_->setText(tx("Show received from the master. Load it in Outputs → Mizin Link."));refreshLink();});
        auto* timer=new QTimer(page);timer->setInterval(1000);connect(timer,&QTimer::timeout,this,[this]{if(link_->role()!=LinkNode::Role::Off)refreshLink();});timer->start();
        refreshLink();return page;
    }
    bool startLink(){
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return false;}
        const QString code=linkCode_->text().trimmed();if(code.size()<6){footer_->setText(tx("Enter a Link code with at least 6 characters (the same on every machine)."));return false;}
        const bool master=linkRole_->currentData().toInt()==int(LinkNode::Role::Master);link_->setName(linkName_->text().trimmed().isEmpty()?QSysInfo::machineHostName():linkName_->text().trimmed());
        settings_->setValue("link/role",master?0:1);settings_->setValue("link/name",link_->name());settings_->setValue("link/code",code);settings_->setValue("link/masterAddress",linkAddress_->text().trimmed());
        bool ok=master?link_->startMaster(code):link_->startFollower(code,true);
        if(ok&&!master&&!linkAddress_->text().trimmed().isEmpty())link_->connectTo(linkAddress_->text().trimmed(),LinkNode::DefaultPort);
        if(!ok)footer_->setText(tx("Mizin Link could not start")+": "+link_->error());refreshLink();return ok;
    }
    bool loadLinkShow(){
        const QString path=link_->receivedShowPath();if(path.isEmpty()||demo_)return false;
        if(dirty_&&QMessageBox::question(this,tx("Unsaved show"),tx("Open another show without saving?"),QMessageBox::Yes|QMessageBox::No,QMessageBox::No)!=QMessageBox::Yes)return false;
        const bool loaded=openShowPath(path);footer_->setText(loaded?tx("Show from the master loaded"):tx("Could not open show"));return loaded;
    }
    void refreshLink(){
        if(!linkStatus_)return;const auto role=link_->role();const bool on=role!=LinkNode::Role::Off;
        linkStart_->setEnabled(!on);linkStop_->setEnabled(on);linkRole_->setEnabled(!on);linkName_->setEnabled(!on);linkCode_->setEnabled(!on);linkNewCode_->setEnabled(!on);
        const bool master=on?role==LinkNode::Role::Master:linkRole_->currentData().toInt()==int(LinkNode::Role::Master);
        linkAddress_->setVisible(!master);linkAddress_->setEnabled(!on);linkSend_->setVisible(master);linkSend_->setEnabled(on&&!link_->hashing());linkLoad_->setVisible(!master);linkMirror_->setVisible(!master);if(linkSync_)linkSync_->setVisible(master);linkLoad_->setEnabled(!link_->receivedShowPath().isEmpty());
        const QLocale locale(language_=="pt-BR"?"pt_BR":"en_US");QString status;
        if(!on)status=link_->error().isEmpty()?tx("Off. Nothing is listening on the network."):tx("Mizin Link could not start")+": "+link_->error();
        else if(master){const auto peers=link_->peers();status=tx("Master · %1 machines connected").arg(peers.size());if(link_->hashing())status+=" · "+tx("preparing media list…");
            else if(!link_->manifest().isEmpty())status+=" · "+tx("show sent: %1 (%2 media files)").arg(link_->manifest()["name"].toString()).arg(link_->manifest()["media"].toArray().size());}
        else if(!link_->connected())status=tx("Follower · looking for the master…")+(link_->error().isEmpty()?QString():" · "+link_->error());
        else{status=tx("Follower · connected to %1 · clock offset %2 ms (round trip %3 ms)").arg(link_->masterName(),locale.toString(link_->clockOffsetMs(),'f',2),locale.toString(link_->rttMs(),'f',2));
            if(link_->mediaTotal()>0)status+=" · "+tx("media %1 / %2").arg(link_->mediaReady()).arg(link_->mediaTotal());
            if(!mirrorStatus().isEmpty())status+=" · "+mirrorStatus();
            if(link_->bytesTotal()>0&&link_->mediaReady()<link_->mediaTotal())status+=QString(" · %1 / %2").arg(memoryText(QJsonValue(double(link_->bytesDone()))),memoryText(QJsonValue(double(link_->bytesTotal()))));}
        linkStatus_->setText(status);
        const auto peers=link_->peers();linkPeers_->setHorizontalHeaderLabels({tx("Machine"),tx("Address"),tx("Status"),tx("Clock"),tx("Media")});linkPeers_->setRowCount(peers.size());
        for(int i=0;i<peers.size();++i){const auto& p=peers[i];const QStringList values{p.name,p.address,p.role=="master"?tx("Master on the network")+(p.show.isEmpty()?QString():" · "+p.show):p.syncMs>=0?tx("Mirroring · ±%1 ms").arg(qRound(p.syncMs)):tx("Connected"),
                p.role=="master"?QString("—"):tx("%1 ms (round trip %2 ms)").arg(locale.toString(p.offsetMs,'f',2),locale.toString(p.rttMs,'f',2)),p.mediaTotal>0?QString("%1 / %2").arg(p.mediaReady).arg(p.mediaTotal):QString("—")};
            for(int c=0;c<5;++c){auto* item=linkPeers_->item(i,c);if(!item){item=new QTableWidgetItem;linkPeers_->setItem(i,c,item);}item->setText(values[c]);}}
    }
