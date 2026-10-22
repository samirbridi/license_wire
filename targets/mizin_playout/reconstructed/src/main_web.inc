    // ADR-017 view-only web monitor. Off until the operator starts it; never restored at launch.
    std::unique_ptr<WebMonitorServer> web_;
    QComboBox* webAccess_=nullptr;
    QSpinBox* webPort_=nullptr;
    QPushButton *webStart_=nullptr,*webStop_=nullptr,*webNewCode_=nullptr,*webOpen_=nullptr;
    QLabel *webStatus_=nullptr,*webCode_=nullptr,*webUrls_=nullptr;
    QString webCodeValue_;
    QWidget* webMonitorPage(){
        web_=std::make_unique<WebMonitorServer>([this]{
            QList<WebProgramInfo> list;for(int i=0;i<programCount_;++i){auto* c=channelAt(i);const int id=programDefinitions_[i].id;list.append({id,programLabel(i),c->path().isEmpty()?QString():QFileInfo(c->path()).fileName(),onAir(id),c->playing()});}return list;
        },[this](int id){const int index=programIndexById(id);return index<0?static_cast<NativeChannel*>(nullptr):channelAt(index);});
        webCodeValue_=settings_->value("webMonitorCode").toString();if(webCodeValue_.size()<6){webCodeValue_=WebMonitorServer::generateCode();if(!demo_)settings_->setValue("webMonitorCode",webCodeValue_);}
        auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(16,16,16,16);l->setSpacing(14);l->addWidget(label("Web monitor","heading"));
        auto* intro=label("View only. Phones, tablets and computers on the same network open a page and watch the Programs live. Nothing in the browser controls playout.","muted");intro->setWordWrap(true);l->addWidget(intro);
        auto* panel=new QFrame;panel->setObjectName("panel");auto* body=new QVBoxLayout(panel);body->setContentsMargins(16,16,16,16);body->setSpacing(12);
        auto* row=new QHBoxLayout;row->setSpacing(10);
        auto* accessCol=new QVBoxLayout;accessCol->addWidget(label("ACCESS","eyebrow"));webAccess_=new QComboBox;webAccess_->setObjectName("webAccess");webAccess_->addItem(tx("Local network (LAN)"),true);webAccess_->addItem(tx("This computer only"),false);webAccess_->setCurrentIndex(settings_->value("webMonitorLan",true).toBool()?0:1);accessCol->addWidget(webAccess_);row->addLayout(accessCol,2);
        auto* portCol=new QVBoxLayout;portCol->addWidget(label("PORT","eyebrow"));webPort_=new QSpinBox;webPort_->setObjectName("webPort");webPort_->setRange(1024,65535);webPort_->setValue(qBound(1024,settings_->value("webMonitorPort",int(WebMonitorServer::DefaultPort)).toInt(),65535));portCol->addWidget(webPort_);row->addLayout(portCol,1);
        webStart_=button("Start web monitor");webStart_->setObjectName("webStart");row->addWidget(webStart_,0,Qt::AlignBottom);webStop_=button("Stop web monitor");webStop_->setObjectName("webStop");row->addWidget(webStop_,0,Qt::AlignBottom);body->addLayout(row);
        webStatus_=new QLabel;webStatus_->setObjectName("muted");webStatus_->setWordWrap(true);body->addWidget(webStatus_);
        auto* codeRow=new QHBoxLayout;codeRow->setSpacing(10);codeRow->addWidget(label("ACCESS CODE","eyebrow"));webCode_=new QLabel;webCode_->setObjectName("timecode");webCode_->setTextInteractionFlags(Qt::TextSelectableByMouse);codeRow->addWidget(webCode_);codeRow->addStretch();
        webNewCode_=button("New code");codeRow->addWidget(webNewCode_);webOpen_=button("Open in browser");codeRow->addWidget(webOpen_);body->addLayout(codeRow);
        webUrls_=new QLabel;webUrls_->setObjectName("webUrls");webUrls_->setTextFormat(Qt::RichText);webUrls_->setTextInteractionFlags(Qt::TextBrowserInteraction);webUrls_->setOpenExternalLinks(true);webUrls_->setWordWrap(true);body->addWidget(webUrls_);l->addWidget(panel);
        for(auto key:{"Changing the code disconnects everyone watching.","Windows may ask to allow network access the first time. Video uses UDP ports 50200–50399.","Each watched Program uses one 1280×720 H.264 encoder (Windows), shared by all its viewers."}){auto* hint=label(key,"muted");hint->setWordWrap(true);l->addWidget(hint);}
        l->addStretch();
        connect(webStart_,&QPushButton::clicked,this,[this]{startWebMonitor();});connect(webStop_,&QPushButton::clicked,this,[this]{web_->stop();});
        connect(webNewCode_,&QPushButton::clicked,this,[this]{webCodeValue_=WebMonitorServer::generateCode();if(!demo_)settings_->setValue("webMonitorCode",webCodeValue_);if(web_->running())web_->setCode(webCodeValue_);refreshWebMonitor();});
        connect(webOpen_,&QPushButton::clicked,this,[this]{const auto urls=web_->urls();if(!urls.isEmpty())QDesktopServices::openUrl(QUrl(urls.last()));});
        connect(webAccess_,&QComboBox::currentIndexChanged,this,[this]{if(!demo_)settings_->setValue("webMonitorLan",webAccess_->currentData().toBool());});
        connect(webPort_,&QSpinBox::valueChanged,this,[this](int value){if(!demo_)settings_->setValue("webMonitorPort",value);});
        connect(web_.get(),&WebMonitorServer::changed,this,[this]{refreshWebMonitor();});
        auto* timer=new QTimer(page);timer->setInterval(1000);connect(timer,&QTimer::timeout,this,[this]{if(web_->running())refreshWebMonitor();});timer->start();
        refreshWebMonitor();return page;
    }
    bool startWebMonitor(){
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return false;}
        const bool started=web_->start(quint16(webPort_->value()),webAccess_->currentData().toBool(),webCodeValue_);if(!started)footer_->setText(tx("Web monitor could not start")+": "+web_->error());refreshWebMonitor();return started;
    }
    void refreshWebMonitor(){
        if(!webStatus_)return;const bool on=web_->running();webStart_->setEnabled(!on);webStop_->setEnabled(on);webAccess_->setEnabled(!on);webPort_->setEnabled(!on);webOpen_->setEnabled(on);webCode_->setText(webCodeValue_);
        webStatus_->setText(on?tx("Running · %1 watching · %2 encoders").arg(web_->viewers()).arg(web_->encoders()):web_->error().isEmpty()?tx("Stopped. Nothing is listening on the network."):tx("Web monitor could not start")+": "+web_->error());
        QStringList links;for(const auto& url:web_->urls())links<<QString("<a style='color:#64d3e6' href='%1'>%1</a>").arg(url.toHtmlEscaped());webUrls_->setText(links.join("<br>"));
    }
