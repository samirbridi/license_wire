    // ADR-016: detachable operator decks and on-air tally. Key -1 is Preview;
    // every other key is a stable Program ID resolved when used, never an index.
    static constexpr int PreviewDeck=-1;
    NativeChannel* deckChannel(int key){if(key==PreviewDeck)return &preview_;const int index=programIndexById(key);return index<0?nullptr:channelAt(index);}
    QString deckLabel(int key)const{return key==PreviewDeck?tx("PREVIEW"):programLabel(programIndexById(key));}
    bool deckDetached(int key)const{for(const auto& view:deckViews_)if(view.key==key&&view.window)return true;return false;}
    // A Program with media on its bus is on air, paused or playing; Black/empty is not. Preview never is.
    bool onAir(int key){if(key==PreviewDeck)return false;if(demo_)return key==1;auto* channel=deckChannel(key);return channel&&!channel->path().isEmpty();}
    static void setFlag(QWidget* widget,const char* name,bool value){if(!widget||widget->property(name).toBool()==value)return;widget->setProperty(name,value);widget->style()->unpolish(widget);widget->style()->polish(widget);}
    QString deckSettingsKey(int key)const{return key==PreviewDeck?QString("deckWindows/preview"):QString("deckWindows/program%1").arg(key);}
    QPushButton* detachButton(int key){
        auto* b=iconButton("Detach deck",DeskIcon::Detach);b->setProperty("deckKey",key);b->setFixedSize(26,22);b->setIconSize(QSize(15,15));
        connect(b,&QPushButton::clicked,this,[this,key]{detachDeck(key);});return b;
    }
    // The docked picture is replaced by a dock note while detached, so the desk does not present the same Program twice.
    QWidget* deckSlot(int key,QWidget* picture){
        auto* stack=new QStackedWidget;stack->setObjectName("deckSlot");stack->setProperty("deckKey",key);stack->addWidget(picture);
        auto* note=button("In separate window · click to dock","dockNote");note->setMinimumSize(0,0);note->setSizePolicy(QSizePolicy::Ignored,QSizePolicy::Ignored);stack->addWidget(note);
        connect(note,&QPushButton::clicked,this,[this,key]{dockDeck(key);});
        deckSlots_.append({key,stack});stack->setCurrentIndex(deckDetached(key)?1:0);return stack;
    }
    void refreshDeckSlots(){
        deckSlots_.removeIf([](const QPair<int,QPointer<QStackedWidget>>& slot){return slot.second.isNull();});
        for(const auto& slot:deckSlots_){const int page=deckDetached(slot.first)?1:0;if(slot.second->currentIndex()!=page)slot.second->setCurrentIndex(page);}
    }
    void placeDeckWindow(DeckWindow* window,int key){
        // A remembered position is reused unless that screen now carries an open display output:
        // an operator monitor must never land on the LED/projector feed. Default is the desk's own screen.
        if(!demo_&&window->restoreGeometry(settings_->value(deckSettingsKey(key)+"/geometry").toByteArray())){
            auto* target=QGuiApplication::screenAt(window->geometry().center());bool busy=!target;
            for(const auto& route:routeWindows_)busy|=route&&route->isVisible()&&route->screen()==target;
            if(!busy)return;
        }
        const auto area=(screen()?screen():QGuiApplication::primaryScreen())->availableGeometry();const QSize size(qMin(960,area.width()-40),qMin(600,area.height()-40));
        window->setGeometry(QRect(area.center()-QPoint(size.width()/2,size.height()/2),size));
    }
    void detachDeck(int key){
        for(const auto& view:deckViews_)if(view.key==key&&view.window){QPointer<DeckWindow> window=view.window;window->showNormal();window->raise();window->activateWindow();return;}
        auto* channel=deckChannel(key);if(!channel)return;
        auto* window=new DeckWindow(this,[this](DeckWindow* closing){deckWindowClosed(closing);});
        auto* outer=new QVBoxLayout(window);outer->setContentsMargins(0,0,0,0);
        DeckView view{key,window};view.frame=new QFrame;view.frame->setObjectName("deck");view.frame->setProperty("channel",key==PreviewDeck?"preview":"program");outer->addWidget(view.frame);
        auto* l=new QVBoxLayout(view.frame);l->setContentsMargins(12,10,12,12);l->setSpacing(8);
        auto* header=new QHBoxLayout;header->setSpacing(6);view.title=new QLabel;view.title->setObjectName("deckTitle");view.title->setProperty("channel",key==PreviewDeck?"preview":"program");header->addWidget(view.title);header->addStretch();
        view.tally=label("ON AIR","onAirBadge");header->addWidget(view.tally);view.state=new QLabel;view.state->setObjectName("deckState");header->addWidget(view.state);
        auto* full=iconButton("Fullscreen  ·  F11",DeskIcon::Fullscreen);header->addWidget(full);connect(full,&QPushButton::clicked,window,&DeckWindow::toggleFullScreen);
        auto* dock=iconButton("Dock deck",DeskIcon::Dock);header->addWidget(dock);connect(dock,&QPushButton::clicked,window,&QWidget::close);l->addLayout(header);
        l->addWidget(monitor(channel,key==PreviewDeck?0:1),1);
        view.name=new ElidedLabel;view.name->setObjectName("mediaTitle");view.name->setSizePolicy(QSizePolicy::Ignored,QSizePolicy::Fixed);l->addWidget(view.name);
        auto* row=new QHBoxLayout;row->setSpacing(6);view.time=new QLabel;view.time->setObjectName("timecode");row->addWidget(view.time);row->addStretch();
        view.play=iconButton("Play / pause",DeskIcon::Play);row->addWidget(view.play);connect(view.play,&QPushButton::clicked,this,[this,key]{if(auto* c=deckChannel(key))c->togglePause();});
        auto* stop=iconButton(key==PreviewDeck?"Clear Preview":"Black this Program",DeskIcon::Stop);row->addWidget(stop);
        connect(stop,&QPushButton::clicked,this,[this,key]{if(key==PreviewDeck){readiness_.clear();preview_.black();cuedRow_=-1;}else{const int index=programIndexById(key);if(index>=0)controllerAt(index)->stop();}});
        l->addLayout(row);deckViews_.append(view);placeDeckWindow(window,key);window->show();refreshDeckViews();
    }
    void deckWindowClosed(DeckWindow* closing){
        for(int i=0;i<deckViews_.size();++i)if(deckViews_[i].window==closing){if(!demo_&&!closing->isFullScreen())settings_->setValue(deckSettingsKey(deckViews_[i].key)+"/geometry",closing->saveGeometry());deckViews_.removeAt(i);break;}
        refreshDeckSlots();
    }
    void dockDeck(int key){for(const auto& view:deckViews_)if(view.key==key&&view.window){QPointer<DeckWindow> window=view.window;window->close();return;}}
    void closeDeckWindows(){const auto views=deckViews_;for(const auto& view:views)if(view.window)view.window->close();}
    void refreshDeckViews(){
        refreshDeckSlots();
        for(const auto& view:deckViews_){
            auto* c=view.window?deckChannel(view.key):nullptr;if(!c)continue;
            const QString title=deckLabel(view.key);view.title->setText(title);if(view.window->windowTitle()!=title+" — Mizin Playout")view.window->setWindowTitle(title+" — Mizin Playout");
            const bool live=onAir(view.key);view.tally->setVisible(live);setFlag(view.frame,"onAir",live);
            view.state->setText(tx(demo_?"Sample":c->pending()?"Preparing":c->path().isEmpty()?"Empty":c->playing()?"Playing":"Paused"));
            view.name->setText(demo_?QString("02 - Opening film.mov"):c->pending()?tx("Preparing media…"):c->path().isEmpty()?tx("No media loaded"):QFileInfo(c->path()).fileName());view.name->setToolTip(view.name->text());
            view.time->setText(demo_?QString("00:01:24"):clockText(view.key==PreviewDeck?c->position():qMax<qint64>(0,c->rangeEnd()-c->position())));
            view.play->setIcon(deskIcon(!demo_&&c->playing()?DeskIcon::Pause:DeskIcon::Play));
        }
    }
