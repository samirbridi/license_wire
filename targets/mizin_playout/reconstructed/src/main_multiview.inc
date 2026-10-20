    // Views subscribe to existing frames. They never load media or allocate a decoder.
    void clearMultiview(){
        programTiles_.clear();
        while(auto* item=multiviewGrid_->takeAt(0)){delete item->widget();delete item;}
    }
    void layoutMultiview(){
        if(programTiles_.isEmpty())return;
        const int columns=qBound(1,(multiview_->viewport()->width()+8)/220,3);
        const int rows=(programTiles_.size()+columns-1)/columns;
        const int height=qBound(124,(multiview_->viewport()->height()-8*(rows-1))/qMin(rows,2),240);
        for(int i=0;i<programTiles_.size();++i){auto* panel=programTiles_[i].panel;multiviewGrid_->addWidget(panel,i/columns,i%columns);panel->setFixedHeight(height);}
        multiviewGrid_->setAlignment(Qt::AlignTop);
    }
    bool eventFilter(QObject* watched,QEvent* event) override {
        if(multiview_&&watched==multiview_->viewport()&&event->type()==QEvent::Resize)layoutMultiview();
        return QMainWindow::eventFilter(watched,event);
    }
    void rebuildMultiview(){
        if(!programViews_)return;
        programViews_->setCurrentIndex(programCount_==1?0:1);
        programViews_->setMinimumHeight(programCount_==1?0:256);playlistTable_->setMinimumHeight(programCount_==1?150:120);
        deckRow_->setStretch(0,programCount_==1?37:30);deckRow_->setStretch(1,programCount_==1?37:70);
        bool same=programTiles_.size()==programCount_;
        for(int i=0;same&&i<programCount_;++i)same=programTiles_[i].id==programDefinitions_[i].id;
        if(!same){
            clearMultiview();
            for(int i=0;i<programCount_;++i){
                const int id=programDefinitions_[i].id;auto* channel=channelAt(i);
                auto* panel=new QFrame;panel->setObjectName("programTile");panel->setProperty("programId",id);
                auto* body=new QVBoxLayout(panel);body->setContentsMargins(8,6,8,6);body->setSpacing(4);
                auto* header=new QHBoxLayout;header->setSpacing(4);
                auto* select=new QPushButton;select->setObjectName("programTileSelect");select->setCheckable(true);select->setMinimumSize(0,22);select->setSizePolicy(QSizePolicy::Ignored,QSizePolicy::Fixed);select->setProperty("tipKey","Select Program");header->addWidget(select,1);
                connect(select,&QPushButton::clicked,this,[this,id]{switchProgram(programIndexById(id));refreshMultiview();});
                auto* state=new QLabel;state->setObjectName("deckState");header->addWidget(state);body->addLayout(header);
                auto* picture=monitor(channel,i%3);picture->setMinimumSize(0,40);body->addWidget(picture,1);
                auto* name=new ElidedLabel;name->setObjectName("muted");body->addWidget(name);
                auto* controls=new QHBoxLayout;controls->setSpacing(5);auto* time=new QLabel;time->setObjectName("tileTime");controls->addWidget(time,1);
                auto* play=iconButton("Play / pause",DeskIcon::Play);play->setFixedSize(28,24);controls->addWidget(play);connect(play,&QPushButton::clicked,this,[this,id]{const int index=programIndexById(id);if(index>=0)channelAt(index)->togglePause();});
                auto* stop=iconButton("Black this Program",DeskIcon::Stop);stop->setFixedSize(28,24);controls->addWidget(stop);connect(stop,&QPushButton::clicked,this,[this,id]{const int index=programIndexById(id);if(index>=0)controllerAt(index)->stop();});body->addLayout(controls);
                programTiles_.append({id,panel,select,state,name,time,play});
            }
            multiview_->viewport()->installEventFilter(this);
        }
        layoutMultiview();refreshMultiview();
    }
    void refreshMultiview(){
        for(const auto& tile:programTiles_){
            const int index=programIndexById(tile.id);if(index<0)continue;auto* channel=channelAt(index);
            tile.select->setText(programLabel(index));tile.select->setAccessibleName(tx("Select Program")+" · "+programLabel(index));tile.select->setChecked(index==selectedProgram_);
            const bool selected=index==selectedProgram_;if(tile.panel->property("selected").toBool()!=selected){tile.panel->setProperty("selected",selected);tile.panel->style()->unpolish(tile.panel);tile.panel->style()->polish(tile.panel);}
            tile.state->setText(tx(demo_?"Sample":channel->pending()?"Preparing":channel->path().isEmpty()?"Empty":channel->playing()?"Playing":"Paused"));
            tile.name->setText(demo_?QStringList{"02 - Opening film.mov","04 - Sponsor loop.avi","03 - Speaker intro.mkv"}.at(index%3):channel->path().isEmpty()?tx("No media loaded"):QFileInfo(channel->path()).fileName());tile.name->setToolTip(tile.name->text());
            tile.time->setText(demo_?"00:01:24":clockText(qMax<qint64>(0,channel->rangeEnd()-channel->position())));
            tile.play->setIcon(deskIcon(!demo_&&channel->playing()?DeskIcon::Pause:DeskIcon::Play));
        }
    }
    void rebuildSelectedDeck(){
        // The meter follows the edit/TAKE destination; the multiview always shows every Program.
        while(auto* item=secondaryMeterLayout_->takeAt(0)){delete item->widget();delete item;}mainMeters_[1]=nullptr;
        if(selectedProgram_>0){secondaryMeterLayout_->addWidget(label(programDefinitions_[selectedProgram_].name,"meterTitle"));mainMeters_[1]=new StereoMeter(targetChannel(),demo_);mainMeters_[1]->setMinimumWidth(80);secondaryMeterLayout_->addWidget(mainMeters_[1],1);}
        secondaryMeter_->setVisible(selectedProgram_>0);rebuildMultiview();
    }
    bool addRouteForProgram(int index){
        if(index<0||index>=programCount_)return false;auto config=currentOutputConfiguration();
        if(config.displays>=OutputConfiguration::MaxDisplays)return false;
        ++config.displays;config.sources.push_back(index);return applyOutputConfiguration(config);
    }
    void refreshProgramInventory(){
        if(!programInventory_)return;
        const QSignalBlocker block(programInventory_);QList<int> ids;for(const auto& definition:programDefinitions_)ids.append(definition.id);
        if(ids!=inventoryIds_){
            programInventory_->setRowCount(0);programInventory_->setRowCount(programCount_);inventoryIds_=ids;
            for(int row=0;row<programCount_;++row){for(int column=0;column<3;++column)programInventory_->setItem(row,column,new QTableWidgetItem);
                const int id=ids[row];auto* add=button("+ Add route");add->setObjectName("addProgramRoute");add->setProperty("programId",id);programInventory_->setCellWidget(row,3,add);
                connect(add,&QPushButton::clicked,this,[this,id]{addRouteForProgram(programIndexById(id));});
            }
        }
        programInventory_->setHorizontalHeaderLabels({tx("Program"),tx("Playlist items"),tx("Configured routes"),tx("Display routes")});
        programInventory_->setFixedHeight(qMax(programInventory_->horizontalHeader()->height(),programInventory_->horizontalHeader()->sizeHint().height())+42*qMin(programCount_,5)+2*programInventory_->frameWidth()+2);
        for(int row=0;row<programCount_;++row){
            QStringList routes;for(int i=0;i<sourceBoxes_.size();++i)if(sourceBoxes_[i]->currentIndex()==row)routes<<QString::number(i+1).rightJustified(2,'0');
            const int count=row==selectedProgram_?playlist_.size():programDefinitions_[row].cues.size();
            const QStringList values{programLabel(row),QString::number(count),routes.isEmpty()?tx("No display route"):routes.join(", ")};
            for(int column=0;column<3;++column){auto* item=programInventory_->item(row,column);if(item->text()!=values[column])item->setText(values[column]);item->setToolTip(values[column]);}
            if(auto* button=qobject_cast<QPushButton*>(programInventory_->cellWidget(row,3)))button->setEnabled(displayCount_<OutputConfiguration::MaxDisplays);
        }
        programInventory_->selectRow(selectedProgram_);
    }
