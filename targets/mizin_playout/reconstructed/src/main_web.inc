    // ADR-017 view-only web monitor. Off until the operator starts it; never restored at launch.
    std::unique_ptr<WebMonitorServer> web_;
    QComboBox* webAccess_=nullptr;
    QSpinBox* webPort_=nullptr;
    QComboBox* webQuality_=nullptr;
    QPushButton *webStart_=nullptr,*webStop_=nullptr,*webNewCode_=nullptr,*webOpen_=nullptr;
    QLabel *webStatus_=nullptr,*webCode_=nullptr,*webUrls_=nullptr;
    QString webCodeValue_;
    // ADR-022: a new code on every start (unless kept), QR of the chosen address, one card per address.
    QCheckBox* webKeepCode_=nullptr;
    QLabel* webQr_=nullptr;
    QWidget* webCards_=nullptr;
    QHBoxLayout* webCardsLayout_=nullptr;
    QStringList webCardIps_;
    QString webSelectedIp_;
    static QImage qrImage(const QString& text,int scale=6){
        const auto qr=qrcodegen::QrCode::encodeText(text.toUtf8().constData(),qrcodegen::QrCode::Ecc::MEDIUM);const int border=4,size=(qr.getSize()+2*border)*scale;
        QImage image(size,size,QImage::Format_RGB32);image.fill(Qt::white);QPainter painter(&image);
        for(int y=0;y<qr.getSize();++y)for(int x=0;x<qr.getSize();++x)if(qr.getModule(x,y))painter.fillRect((x+border)*scale,(y+border)*scale,scale,scale,Qt::black);
        return image;
    }
    QWidget* webMonitorPage(){
        web_=std::make_unique<WebMonitorServer>([this]{
            QList<WebProgramInfo> list;for(int i=0;i<programCount_;++i){auto* c=channelAt(i);const int id=programDefinitions_[i].id;list.append({id,programLabel(i),c->path().isEmpty()?QString():QFileInfo(c->path()).fileName(),onAir(id),c->playing()});}return list;
        },[this](int id){const int index=programIndexById(id);return index<0?static_cast<NativeChannel*>(nullptr):channelAt(index);});
        webCodeValue_=WebMonitorServer::normalizeCode(settings_->value("webMonitorCode").toString());if(webCodeValue_.size()<6){webCodeValue_=WebMonitorServer::generateCode();if(!demo_)settings_->setValue("webMonitorCode",webCodeValue_);}
        auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(16,16,16,16);l->setSpacing(14);l->addWidget(label("Web monitor","heading"));
        auto* intro=label("View only. Phones, tablets and computers on the same network open a page and watch the Programs live. Nothing in the browser controls playout.","muted");intro->setWordWrap(true);l->addWidget(intro);
        auto* panel=new QFrame;panel->setObjectName("panel");auto* body=new QVBoxLayout(panel);body->setContentsMargins(16,16,16,16);body->setSpacing(12);
        auto* row=new QHBoxLayout;row->setSpacing(10);
        auto* accessCol=new QVBoxLayout;accessCol->addWidget(label("ACCESS","eyebrow"));webAccess_=new QComboBox;webAccess_->setObjectName("webAccess");webAccess_->addItem(tx("Local network (LAN)"),true);webAccess_->addItem(tx("This computer only"),false);webAccess_->setCurrentIndex(settings_->value("webMonitorLan",true).toBool()?0:1);accessCol->addWidget(webAccess_);row->addLayout(accessCol,2);
        auto* portCol=new QVBoxLayout;portCol->addWidget(label("PORT","eyebrow"));webPort_=new QSpinBox;webPort_->setObjectName("webPort");webPort_->setRange(1024,65535);webPort_->setValue(qBound(1024,settings_->value("webMonitorPort",int(WebMonitorServer::DefaultPort)).toInt(),65535));portCol->addWidget(webPort_);row->addLayout(portCol,1);
        auto* qualityCol=new QVBoxLayout;qualityCol->addWidget(label("QUALITY","eyebrow"));webQuality_=new QComboBox;webQuality_->setObjectName("webQuality");webQuality_->addItem(tx("Automatic (as the source, up to 1080p)"),0);webQuality_->addItem("720p",1);webQuality_->addItem("1080p",2);webQuality_->addItem(tx("4K (2160p) — needs a recent graphics card"),3);
        webQuality_->setCurrentIndex(qMax(0,webQuality_->findData(settings_->value("webMonitorQuality",0).toInt())));web_->setQuality(webQuality_->currentData().toInt());qualityCol->addWidget(webQuality_);row->addLayout(qualityCol,2);
        webStart_=button("Start web monitor");webStart_->setObjectName("webStart");row->addWidget(webStart_,0,Qt::AlignBottom);webStop_=button("Stop web monitor");webStop_->setObjectName("webStop");row->addWidget(webStop_,0,Qt::AlignBottom);body->addLayout(row);
        webStatus_=new QLabel;webStatus_->setObjectName("muted");webStatus_->setWordWrap(true);body->addWidget(webStatus_);
        auto* codeRow=new QHBoxLayout;codeRow->setSpacing(10);codeRow->addWidget(label("ACCESS CODE","eyebrow"));webCode_=new QLabel;webCode_->setObjectName("timecode");webCode_->setTextInteractionFlags(Qt::TextSelectableByMouse);codeRow->addWidget(webCode_);codeRow->addStretch();
        webNewCode_=button("New code");codeRow->addWidget(webNewCode_);webOpen_=button("Open in browser");codeRow->addWidget(webOpen_);body->addLayout(codeRow);
        webKeepCode_=new QCheckBox;webKeepCode_->setObjectName("webKeepCode");bindings_.append({webKeepCode_,"Keep the same code between sessions (otherwise every start creates a new code)"});webKeepCode_->setChecked(settings_->value("webMonitorKeepCode",false).toBool());body->addWidget(webKeepCode_);
        connect(webKeepCode_,&QCheckBox::toggled,this,[this](bool on){if(!demo_)settings_->setValue("webMonitorKeepCode",on);});
        auto* scan=new QHBoxLayout;scan->setSpacing(16);webQr_=new QLabel;webQr_->setObjectName("webQr");webQr_->setFixedSize(220,220);webQr_->setScaledContents(true);scan->addWidget(webQr_,0,Qt::AlignTop);
        auto* side=new QVBoxLayout;side->setSpacing(8);side->addWidget(label("SCAN TO WATCH","eyebrow"));auto* scanHint=label("Point the phone camera at the code: the page opens already signed in. If it does not load, choose another address below; the QR changes with it.","muted");scanHint->setWordWrap(true);side->addWidget(scanHint);
        webCards_=new QWidget;webCards_->setObjectName("webCards");webCardsLayout_=new QHBoxLayout(webCards_);webCardsLayout_->setContentsMargins(0,0,0,0);webCardsLayout_->setSpacing(8);side->addWidget(webCards_);
        auto* qrButtons=new QHBoxLayout;auto* copy=button("Copy link");copy->setObjectName("webCopyLink");auto* save=button("Save QR");save->setObjectName("webSaveQr");qrButtons->addWidget(copy);qrButtons->addWidget(save);qrButtons->addStretch();side->addLayout(qrButtons);side->addStretch();scan->addLayout(side,1);body->addLayout(scan);
        connect(copy,&QPushButton::clicked,this,[this]{if(!web_->running())return;QGuiApplication::clipboard()->setText(web_->urlFor(webSelectedIp_));footer_->setText(tx("Link copied"));});
        connect(save,&QPushButton::clicked,this,[this]{if(!web_->running())return;const QString path=QFileDialog::getSaveFileName(this,tx("Save QR"),"mizin-monitor-qr.png","PNG (*.png)");if(!path.isEmpty())qrImage(web_->urlFor(webSelectedIp_),12).save(path);});
        webUrls_=new QLabel;webUrls_->setObjectName("webUrls");webUrls_->setTextFormat(Qt::RichText);webUrls_->setTextInteractionFlags(Qt::TextBrowserInteraction);webUrls_->setOpenExternalLinks(true);webUrls_->setWordWrap(true);body->addWidget(webUrls_);l->addWidget(panel);
        for(auto key:{"Changing the code disconnects everyone watching.","Windows may ask to allow network access the first time. Video uses UDP ports 50200–50399.","Each watched Program uses one H.264 encoder, shared by all its viewers: the graphics card's encoder when available, otherwise Windows software encoding. Quality changes apply live."}){auto* hint=label(key,"muted");hint->setWordWrap(true);l->addWidget(hint);}
        l->addStretch();
        connect(webStart_,&QPushButton::clicked,this,[this]{startWebMonitor();});connect(webStop_,&QPushButton::clicked,this,[this]{web_->stop();});
        connect(webNewCode_,&QPushButton::clicked,this,[this]{webCodeValue_=WebMonitorServer::generateCode();if(!demo_)settings_->setValue("webMonitorCode",webCodeValue_);if(web_->running())web_->setCode(webCodeValue_);refreshWebMonitor();});
        connect(webOpen_,&QPushButton::clicked,this,[this]{if(web_->running())QDesktopServices::openUrl(QUrl(web_->urlFor("127.0.0.1")));});
        connect(webAccess_,&QComboBox::currentIndexChanged,this,[this]{if(!demo_)settings_->setValue("webMonitorLan",webAccess_->currentData().toBool());});
        connect(webPort_,&QSpinBox::valueChanged,this,[this](int value){if(!demo_)settings_->setValue("webMonitorPort",value);});
        connect(webQuality_,&QComboBox::currentIndexChanged,this,[this]{const int q=webQuality_->currentData().toInt();if(!demo_)settings_->setValue("webMonitorQuality",q);web_->setQuality(q);refreshWebMonitor();});
        connect(web_.get(),&WebMonitorServer::changed,this,[this]{refreshWebMonitor();});
        auto* timer=new QTimer(page);timer->setInterval(1000);connect(timer,&QTimer::timeout,this,[this]{if(web_->running())refreshWebMonitor();});timer->start();
        refreshWebMonitor();return page;
    }
    // Site screenshots: the layout preview starts the server for real (LAN) so the QR and address cards are shown.
    void startWebForCapture(){selectWeb();web_->start(0,true,WebMonitorServer::generateCode());webCodeValue_=web_->code();refreshWebMonitor();}
    bool startWebMonitor(){
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return false;}
        // Like P2PMizin: a fresh code on every start unless the operator chose to keep it.
        if(!webKeepCode_->isChecked()){webCodeValue_=WebMonitorServer::generateCode();settings_->setValue("webMonitorCode",webCodeValue_);}
        const bool started=web_->start(quint16(webPort_->value()),webAccess_->currentData().toBool(),webCodeValue_);if(!started)footer_->setText(tx("Web monitor could not start")+": "+web_->error());refreshWebMonitor();return started;
    }
    void refreshWebMonitor(){
        if(!webStatus_)return;const bool on=web_->running();webStart_->setEnabled(!on);webStop_->setEnabled(on);webAccess_->setEnabled(!on);webPort_->setEnabled(!on);webOpen_->setEnabled(on);webCode_->setText(webCodeValue_);
        QStringList formats;for(const auto& value:web_->statistics()["streams"].toArray()){const auto s=value.toObject();if(s["width"].toInt()>0)formats<<QString("%1×%2 · %3").arg(s["width"].toInt()).arg(s["height"].toInt()).arg(s["hardware"].toBool()?tx("graphics card"):tx("software"));}formats.removeDuplicates();
        webStatus_->setText(on?tx("Running · %1 watching · %2 encoders").arg(web_->viewers()).arg(web_->encoders())+(formats.isEmpty()?QString():" · "+formats.join(", ")):web_->error().isEmpty()?tx("Stopped. Nothing is listening on the network."):tx("Web monitor could not start")+": "+web_->error());
        // Address cards (rebuilt only when the address list changes) and the QR of the selected one.
        const auto addresses=on?web_->addresses():QList<WebAddress>{};QStringList ips;for(const auto& a:addresses)ips<<a.ip;
        if(ips!=webCardIps_){webCardIps_=ips;while(auto* item=webCardsLayout_->takeAt(0)){delete item->widget();delete item;}
            if(!ips.contains(webSelectedIp_))webSelectedIp_=ips.isEmpty()?QString():ips.first();
            for(const auto& a:addresses){auto* card=new QPushButton(QString("%1\n%2").arg(a.ip=="127.0.0.1"?tx("This computer"):a.name,a.ip));card->setObjectName("webAddressCard");card->setCheckable(true);card->setChecked(a.ip==webSelectedIp_);card->setMinimumHeight(48);
                card->setToolTip(a.primary?tx("Main network address"):QString());const QString ip=a.ip;connect(card,&QPushButton::clicked,this,[this,ip]{webSelectedIp_=ip;webCardIps_.clear();refreshWebMonitor();});webCardsLayout_->addWidget(card);}
            webCardsLayout_->addStretch();}
        webCards_->setVisible(on);webQr_->setVisible(on&&!webSelectedIp_.isEmpty());
        if(on&&!webSelectedIp_.isEmpty()){const QString url=web_->urlFor(webSelectedIp_);if(webQr_->property("url").toString()!=url){webQr_->setPixmap(QPixmap::fromImage(qrImage(url)));webQr_->setProperty("url",url);}
            webUrls_->setText(QString("<a style='color:#64d3e6' href='%1'>%1</a>").arg(url.toHtmlEscaped()));}else webUrls_->clear();
    }
