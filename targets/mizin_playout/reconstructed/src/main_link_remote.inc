    // ADR-019 phase 4: remote control. A control station joins with the Link code plus an operator name and PIN
    // defined on the master. Operators command all or some Programs, viewers only watch. The playout machine stays
    // authoritative: it validates every command, runs it as a local CUT/FADE/BLACK/PAUSE and logs it.
    QFrame* operatorsPanel_=nullptr;
    QTableWidget* operatorsTable_=nullptr;
    QWidget* remoteLogin_=nullptr;
    QLineEdit *linkOperator_=nullptr,*linkPin_=nullptr;
    QFrame* remoteDesk_=nullptr;
    QGridLayout* remoteGrid_=nullptr;
    QSpinBox* remoteFade_=nullptr;
    QLabel* remoteStatus_=nullptr;
    QString remoteShape_;
    struct RemoteProgram {int id=0;QLabel* now=nullptr;QListWidget* items=nullptr;QPushButton* pause=nullptr;};
    QList<RemoteProgram> remotePrograms_;
    bool loadingOperators_=false;
    void setupRemote(QVBoxLayout* body){
        remoteLogin_=new QWidget;auto* login=new QHBoxLayout(remoteLogin_);login->setContentsMargins(0,0,0,0);login->setSpacing(10);
        auto column=[&](const QString& key,QWidget* widget){auto* c=new QVBoxLayout;c->addWidget(label(key,"eyebrow"));c->addWidget(widget);login->addLayout(c,1);};
        linkOperator_=new QLineEdit(settings_->value("link/operator").toString());linkOperator_->setObjectName("linkOperator");linkOperator_->setMaxLength(40);column("OPERATOR",linkOperator_);
        linkPin_=new QLineEdit;linkPin_->setObjectName("linkPin");linkPin_->setEchoMode(QLineEdit::Password);linkPin_->setMaxLength(32);column("PIN",linkPin_);body->addWidget(remoteLogin_);
        operatorsPanel_=new QFrame;auto* ol=new QVBoxLayout(operatorsPanel_);ol->setContentsMargins(0,0,0,0);ol->setSpacing(8);
        auto* head=new QHBoxLayout;head->addWidget(label("REMOTE OPERATORS","eyebrow"),1);auto* add=button("Add operator");add->setObjectName("addOperator");auto* remove=button("Remove operator");remove->setObjectName("removeOperator");head->addWidget(add);head->addWidget(remove);ol->addLayout(head);
        operatorsTable_=new QTableWidget(0,4);operatorsTable_->setObjectName("linkOperators");operatorsTable_->verticalHeader()->hide();operatorsTable_->setShowGrid(false);operatorsTable_->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);operatorsTable_->setMinimumHeight(120);ol->addWidget(operatorsTable_);
        auto* note=label("Control stations sign in with the Link code plus an operator name and PIN. Operators command their Programs; viewers only watch. Every remote command is logged.","muted");note->setWordWrap(true);ol->addWidget(note);body->addWidget(operatorsPanel_);
        remoteDesk_=new QFrame;remoteDesk_->setObjectName("remoteDesk");auto* dl=new QVBoxLayout(remoteDesk_);dl->setContentsMargins(0,0,0,0);dl->setSpacing(8);
        auto* deskHead=new QHBoxLayout;deskHead->addWidget(label("REMOTE DESK","eyebrow"));remoteStatus_=new QLabel;remoteStatus_->setObjectName("muted");deskHead->addWidget(remoteStatus_,1);deskHead->addWidget(label("Fade duration","muted"));
        remoteFade_=new QSpinBox;remoteFade_->setObjectName("remoteFade");remoteFade_->setRange(1,10000);remoteFade_->setSingleStep(50);remoteFade_->setSuffix(" ms");remoteFade_->setValue(300);deskHead->addWidget(remoteFade_);dl->addLayout(deskHead);
        remoteGrid_=new QGridLayout;remoteGrid_->setSpacing(10);dl->addLayout(remoteGrid_);body->addWidget(remoteDesk_);
        loadOperators();
        connect(add,&QPushButton::clicked,this,[this]{appendOperator({{"name",tx("Operator %1").arg(operatorsTable_->rowCount()+1)},{"pin",QString::number(QRandomGenerator::system()->bounded(100000,1000000))},{"level","operator"},{"programs",QJsonArray{}}});saveOperators();});
        connect(remove,&QPushButton::clicked,this,[this]{int row=operatorsTable_->currentRow();if(row<0)row=operatorsTable_->rowCount()-1;if(row>=0){operatorsTable_->removeRow(row);saveOperators();}});
        connect(operatorsTable_,&QTableWidget::itemChanged,this,[this]{saveOperators();});
        link_->setCommandHandler([this](const QJsonObject& command,const QString& operatorName){return executeRemote(command,operatorName);});
        connect(link_.get(),&LinkNode::deskReceived,this,[this](const QJsonObject& desk){applyDesk(desk);});
        connect(link_.get(),&LinkNode::commandAnswered,this,[this](const QJsonObject& answer){if(!answer["ok"].toBool())footer_->setText(tx("Remote command refused")+": "+tx(answer["error"].toString()));});
        auto* deskTimer=new QTimer(this);deskTimer->setInterval(250);connect(deskTimer,&QTimer::timeout,this,[this]{if(link_->role()==LinkNode::Role::Master&&link_->hasControlStations())link_->broadcastDesk(buildDesk());});deskTimer->start();
    }
    // ---- Master: operators and command execution ----
    static QString programsSummary(const QJsonArray& ids,const std::function<QString(int)>& name){if(ids.isEmpty())return {};QStringList names;for(const auto& id:ids)names<<name(id.toInt());return names.join(", ");}
    void appendOperator(const QJsonObject& op){
        const QScopedValueRollback<bool> guard(loadingOperators_,true);const int row=operatorsTable_->rowCount();operatorsTable_->insertRow(row);
        operatorsTable_->setItem(row,0,new QTableWidgetItem(op["name"].toString()));operatorsTable_->setItem(row,1,new QTableWidgetItem(op["pin"].toString()));
        auto* level=new QComboBox;level->addItem(tx("Operator (controls)"),"operator");level->addItem(tx("Viewer (watch only)"),"viewer");level->setCurrentIndex(op["level"].toString()=="viewer"?1:0);operatorsTable_->setCellWidget(row,2,level);
        connect(level,&QComboBox::currentIndexChanged,this,[this]{saveOperators();});
        auto* programs=new QToolButton;programs->setPopupMode(QToolButton::InstantPopup);programs->setProperty("programs",op["programs"].toArray().toVariantList());auto* menu=new QMenu(programs);programs->setMenu(menu);operatorsTable_->setCellWidget(row,3,programs);
        connect(menu,&QMenu::aboutToShow,this,[this,menu,programs]{menu->clear();const auto ids=programs->property("programs").toList();
            for(int i=0;i<programCount_;++i){auto* action=menu->addAction(programLabel(i));action->setCheckable(true);const int id=programDefinitions_[i].id;action->setChecked(ids.contains(id));
                connect(action,&QAction::toggled,this,[this,programs,id](bool on){auto list=programs->property("programs").toList();list.removeAll(id);if(on)list.append(id);programs->setProperty("programs",list);saveOperators();});}});
    }
    void loadOperators(){
        operatorsTable_->setRowCount(0);auto list=QJsonDocument::fromJson(settings_->value("link/operators").toByteArray()).array();
        if(demo_&&list.isEmpty())list={QJsonObject{{"name","Ana"},{"pin","482913"},{"level","operator"},{"programs",QJsonArray{1}}},QJsonObject{{"name",tx("Lobby screen")},{"pin","105577"},{"level","viewer"},{"programs",QJsonArray{}}}};
        for(const auto& value:list)appendOperator(value.toObject());saveOperators(false);
    }
    QJsonArray operatorList()const{
        QJsonArray list;if(!operatorsTable_)return list;
        for(int row=0;row<operatorsTable_->rowCount();++row){auto* name=operatorsTable_->item(row,0);auto* pin=operatorsTable_->item(row,1);auto* level=qobject_cast<QComboBox*>(operatorsTable_->cellWidget(row,2));auto* programs=qobject_cast<QToolButton*>(operatorsTable_->cellWidget(row,3));
            if(!name||!pin||name->text().trimmed().isEmpty()||pin->text().trimmed().isEmpty())continue;
            list.append(QJsonObject{{"name",name->text().trimmed()},{"pin",pin->text().trimmed()},{"level",level?level->currentData().toString():"viewer"},{"programs",programs?QJsonArray::fromVariantList(programs->property("programs").toList()):QJsonArray{}}});}
        return list;
    }
    void saveOperators(bool store=true){
        if(loadingOperators_||!operatorsTable_)return;const auto list=operatorList();
        for(int row=0;row<operatorsTable_->rowCount();++row)if(auto* programs=qobject_cast<QToolButton*>(operatorsTable_->cellWidget(row,3))){
            const QString text=programsSummary(QJsonArray::fromVariantList(programs->property("programs").toList()),[this](int id){return programLabel(programIndexById(id));});programs->setText(text.isEmpty()?tx("All Programs"):text);}
        operatorsTable_->setHorizontalHeaderLabels({tx("Operator"),tx("PIN"),tx("Permission"),tx("Programs")});
        if(store&&!demo_)settings_->setValue("link/operators",QJsonDocument(list).toJson(QJsonDocument::Compact));link_->setOperators(list);
    }
    void logRemote(const QString& line){
        QFile file(QDir(stateDirectory_).filePath("link/remote-log.txt"));if(file.open(QIODevice::Append|QIODevice::Text))file.write((QDateTime::currentDateTime().toString(Qt::ISODate)+"  "+line+"\n").toUtf8());
    }
    QString executeRemote(const QJsonObject& command,const QString& operatorName){
        if(demo_)return "Layout preview — sample content";
        const int index=programIndexById(command["program"].toInt());if(index<0)return "Unknown Program";
        const QString action=command["action"].toString();auto* c=channelAt(index);QString what;
        if(action=="cut"||action=="fade"){
            storeActivePlaylist();const auto items=programDefinitions_[index].cues;const int row=command["row"].toInt(-1);if(row<0||row>=items.size())return "Unknown playlist item";
            const auto mode=action=="cut"?PlaylistController::ManualTake::Cut:PlaylistController::ManualTake::Fade;const int fade=std::clamp(command["fadeMs"].toInt(300),1,10000);
            if(!(syncMode()&&syncTakeOn(index,row,mode,fade))&&!controllerAt(index)->takeManual(items,row,mode,fade))return "Could not take";
            what=QString("%1 %2").arg(action.toUpper(),QFileInfo(items[row].path).fileName());
        }else if(action=="black"){controllerAt(index)->stop();what="BLACK";}
        else if(action=="pause"||action=="play"){if(c->path().isEmpty())return "Nothing on air";if(c->playing()!=(action=="play"))c->togglePause();what=action.toUpper();}
        else return "Unknown command";
        const QString line=tx("Remote · %1: %2 on %3").arg(operatorName,what,programLabel(index));footer_->setText(line);logRemote(line);refreshTransport();return {};
    }
    QJsonObject buildDesk(){
        QJsonArray programs;
        for(int i=0;i<programCount_;++i){auto* c=channelAt(i);QJsonArray items;for(const auto& cue:i==selectedProgram_?playlist_:programDefinitions_[i].cues)items.append(QFileInfo(cue.path).fileName());
            programs.append(QJsonObject{{"id",programDefinitions_[i].id},{"name",programLabel(i)},{"items",items},{"current",controllerAt(i)->current()},{"media",QFileInfo(c->path()).fileName()},{"playing",c->playing()},{"positionMs",double(c->position())},{"durationMs",double(c->duration())}});}
        return {{"master",link_->name()},{"sync",syncMode()},{"programs",programs}};
    }
    // ---- Control station: remote desk ----
    void sendRemote(int id,const QString& action,int row=-1){
        if(link_->role()!=LinkNode::Role::Control||!link_->connected())return;
        if((action=="cut"||action=="fade")&&row<0){footer_->setText(tx("Select an item of that Program's playlist first."));return;}
        link_->sendCommand({{"action",action},{"program",id},{"row",row},{"fadeMs",remoteFade_->value()}});
    }
    void rebuildRemoteDesk(const QJsonArray& programs,const QJsonArray& allowed,bool operatorLevel){
        while(auto* item=remoteGrid_->takeAt(0)){if(auto* w=item->widget())w->deleteLater();delete item;}remotePrograms_.clear();
        for(int i=0;i<programs.size();++i){const auto p=programs[i].toObject();RemoteProgram r;r.id=p["id"].toInt();const bool can=operatorLevel&&(allowed.isEmpty()||allowed.contains(r.id));
            auto* box=new QFrame;box->setObjectName("panel");auto* l=new QVBoxLayout(box);l->setContentsMargins(12,12,12,12);l->setSpacing(8);
            auto* title=new QLabel(p["name"].toString());title->setObjectName("remoteProgram");l->addWidget(title);r.now=new QLabel;r.now->setObjectName("muted");l->addWidget(r.now);
            r.items=new QListWidget;r.items->setObjectName("remoteItems");for(const auto& name:p["items"].toArray())r.items->addItem(name.toString());r.items->setMinimumHeight(120);l->addWidget(r.items,1);
            auto* buttons=new QHBoxLayout;buttons->setSpacing(6);const int id=r.id;auto* items=r.items;
            auto* cut=button("CUT","cut");auto* fade=button("FADE","take");auto* black=button("BLACK");r.pause=button("PAUSE");
            for(auto* b:{cut,fade,black,r.pause}){b->setEnabled(can);buttons->addWidget(b);}
            connect(cut,&QPushButton::clicked,this,[this,id,items]{sendRemote(id,"cut",items->currentRow());});connect(fade,&QPushButton::clicked,this,[this,id,items]{sendRemote(id,"fade",items->currentRow());});
            connect(black,&QPushButton::clicked,this,[this,id]{sendRemote(id,"black");});auto* pause=r.pause;connect(pause,&QPushButton::clicked,this,[this,id,pause]{sendRemote(id,pause->property("playing").toBool()?"pause":"play");});
            l->addLayout(buttons);if(!can){auto* lock=label(operatorLevel?"Not assigned to you":"View only","muted");l->addWidget(lock);}
            remoteGrid_->addWidget(box,i/2,i%2);remotePrograms_.append(r);}
    }
    void applyDesk(const QJsonObject& desk){
        const auto programs=desk["programs"].toArray();const auto allowed=desk["allowed"].toArray();const bool operatorLevel=desk["level"].toString()=="operator";
        QString shape=desk["level"].toString()+QJsonDocument(allowed).toJson(QJsonDocument::Compact);for(const auto& v:programs){const auto p=v.toObject();shape+=QString::number(p["id"].toInt())+p["name"].toString()+QJsonDocument(p["items"].toArray()).toJson(QJsonDocument::Compact);}
        if(shape!=remoteShape_){remoteShape_=shape;rebuildRemoteDesk(programs,allowed,operatorLevel);}
        for(int i=0;i<remotePrograms_.size()&&i<programs.size();++i){const auto p=programs[i].toObject();auto& r=remotePrograms_[i];const QString media=p["media"].toString();const bool playing=p["playing"].toBool();
            r.now->setText(media.isEmpty()?tx("Black"):QString("%1 · %2 / %3 · %4").arg(media,clockText(qint64(p["positionMs"].toDouble())),clockText(qint64(p["durationMs"].toDouble())),playing?tx("playing"):tx("paused")));
            const int current=p["current"].toInt(-1);for(int row=0;row<r.items->count();++row){auto* item=r.items->item(row);QFont font=item->font();if(font.bold()!=(row==current)){font.setBold(row==current);item->setFont(font);}}
            r.pause->setProperty("playing",playing);r.pause->setText(tx(playing?"PAUSE":"PLAY"));}
        remoteStatus_->setText(tx("%1 · signed in as %2 (%3)").arg(desk["master"].toString(),link_->operatorName(),operatorLevel?tx("operator"):tx("viewer")));
    }
