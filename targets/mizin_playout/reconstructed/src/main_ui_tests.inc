// In-process widget actions with real generated media, not physical-output qualification.
int MainWindow::runUiTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);QJsonArray tests;bool all=true;
    auto record=[&](const QString& name,bool ok){tests.append(QJsonObject{{"name",name},{"pass",ok}});all&=ok;qInfo().noquote()<<name<<ok;};
    auto wait=[&](const std::function<bool()>& predicate,int limit=10000){QElapsedTimer time;time.start();while(!predicate()&&time.elapsed()<limit){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();};
    auto pump=[&](int ms){QElapsedTimer timer;timer.start();wait([&]{return timer.elapsed()>=ms;},ms+1000);};
    {   // A widget shown before it has a parent opens as a stray top-level window (and steals "close main window").
        pump(300);QStringList stray;for(auto* widget:QApplication::topLevelWidgets())if(widget!=this&&widget->isVisible()&&!widget->inherits("QMenu")&&!(widget->windowFlags()&Qt::ToolTip))stray<<(widget->metaObject()->className()+QString(":")+widget->objectName());
        record("only_the_main_window_is_open_at_startup",stray.isEmpty());if(!stray.isEmpty())qInfo().noquote()<<"stray windows"<<stray.join(", ");
    }
    const QString base=QFileInfo(resultPath).absolutePath()+"/",stem=QFileInfo(resultPath).completeBaseName();
    pump(80);record("default_allocates_only_main_program_and_one_route",programCount_==1&&displayCount_==1&&extraPrograms_.empty()&&sourceBoxes_.size()==1&&targetBox_->count()==1&&programViews_->currentIndex()==0);
    record("update_install_guard_allows_idle",!updatePlaybackBusy());record("updater_starts_idle_without_download",updates_->state()=="idle"&&updates_->downloadedFile().isEmpty()&&!updateBanner_->isVisible());record("updates_page_is_available",settingsTabs_->count()==3&&updatePanel_);
    record("web_monitor_is_off_by_default",web_&&!web_->running()&&web_->urls().isEmpty()&&outputsTabs_->count()==4&&webStart_->isEnabled()&&!webStop_->isEnabled()&&webCodeValue_.size()>=6);
    webAccess_->setCurrentIndex(1);webPort_->setValue(20000+int(QRandomGenerator::global()->bounded(20000)));webStart_->click();pump(50);
    const bool webOn=web_->running()&&web_->urls().size()==1&&web_->urls()[0].contains("127.0.0.1:"+QString::number(webPort_->value()))&&webUrls_->text().contains(webCodeValue_)&&!webPort_->isEnabled();
    const QString oldCode=webCodeValue_;webNewCode_->click();const bool newCode=webCodeValue_!=oldCode&&web_->code()==webCodeValue_&&settings_->value("webMonitorCode").toString()==webCodeValue_;webStop_->click();pump(30);
    record("web_monitor_starts_on_request_and_stops",webOn&&newCode&&!web_->running()&&webStatus_->text()==tx("Stopped. Nothing is listening on the network."));
    record("low_latency_output_is_off_by_default",engine_&&!engine_->running()&&!programA_.localEngine()&&!programA_.qtSinksMuted()&&engineStart_->isVisible()==false&&enginePairs_.size()==1&&engineStatus_->text()==tx("Off. Programs play through their normal output (Audio routing below)."));
    record("mizin_link_is_off_by_default",link_&&link_->role()==LinkNode::Role::Off&&linkStart_->isEnabled()&&!linkStop_->isEnabled()&&linkStatus_->text()==tx("Off. Nothing is listening on the network."));
    {const bool master=link_->startMaster("ui-link-code",0);refreshLink();const bool shown=linkStatus_->text().startsWith(tx("Master · %1 machines connected").arg(0))&&!linkStart_->isEnabled()&&!linkSend_->isHidden()&&linkLoad_->isHidden();
     link_->stop();refreshLink();record("mizin_link_master_starts_and_stops_from_the_page",master&&shown&&link_->role()==LinkNode::Role::Off&&linkStart_->isEnabled());}
    record("approved_brand_icon_is_present",!windowIcon().isNull()&&findChild<QWidget*>("brandMark"));
    auto report=diagnosticsReport();record("single_diagnostics_has_no_inactive_placeholders",report["channels"].toArray().size()==2&&report["network"].toArray().size()==2&&report["outputs"].toArray().size()==1);
    for(const auto& locale:{QString("en"),QString("pt-BR")})for(const auto& size:{QSize(1600,1000),QSize(1280,800)}){
        setLanguage(locale);resize(size);pump(80);auto inside=[this](QWidget* widget){return widget->isVisible()&&centralWidget()->rect().contains(QRect(widget->mapTo(centralWidget(),QPoint()),widget->size()));};
        record(QString("single_layout_%1_%2").arg(locale).arg(size.width()),this->size()==size&&inside(targetBox_)&&inside(addProgram_)&&inside(cutButton_)&&inside(fadeButton_)&&inside(copyPlaylist_)&&playlistTable_->viewport()->height()>=70);
    }
    setLanguage("en");
    record("binary_memory_is_converted_to_decimal_mb",memoryText(QJsonValue(95.0*1048576.0))=="99.6 MB");
    record("decimal_memory_switches_at_one_billion_bytes",memoryText(QJsonValue(999000000.0))=="999.0 MB"&&memoryText(QJsonValue(1000000000.0))=="1.00 GB");
    record("decimal_gigabytes_keep_fractional_usage",memoryText(QJsonValue(1500000000.0))=="1.50 GB");
    record("unknown_or_negative_memory_is_not_reported_as_zero",memoryText(QJsonValue(QJsonValue::Null))=="—"&&memoryText(QJsonValue(-1))=="—"&&memoryText(QJsonValue(0))=="0 MB");
    setLanguage("pt-BR");record("memory_units_follow_portuguese_decimal_separator",memoryText(QJsonValue(99614720.0))=="99,6 MB"&&memoryText(QJsonValue(1500000000.0))=="1,50 GB");
    // Regression: selected typography must fit too, and every TAKE control shares the same row.
    for(const auto& locale:{QString("en"),QString("pt-BR")})for(const auto& size:{QSize(1600,1000),QSize(1280,800)}){
        setLanguage(locale);resize(size);pump(80);const int width=sequentialMode_->width();sequentialMode_->click();pump(60);
        bool textFits=sequentialMode_->isChecked()&&sequentialMode_->width()==width;
        for(auto* mode:{manualMode_,sequentialMode_}){QStyleOptionButton option;option.initFrom(mode);option.text=mode->text();option.state|=mode->isChecked()?QStyle::State_On:QStyle::State_Off;const auto contents=mode->style()->subElementRect(QStyle::SE_PushButtonContents,&option,mode);textFits&=mode->fontMetrics().horizontalAdvance(mode->text())<=contents.width();}
        record(QString("selected_mode_text_fits_%1_%2").arg(locale).arg(size.width()),textFits);manualMode_->click();pump(30);
        const auto y=targetBox_->mapTo(this,QPoint()).y();bool aligned=true;for(auto* control:std::array<QWidget*,7>{targetBox_,addProgram_,cutButton_,fadeButton_,manualFadeTime_,blackButton_,loopBox_})aligned&=control->mapTo(this,QPoint()).y()==y&&control->height()==40;
        record(QString("take_controls_share_top_and_height_%1_%2").arg(locale).arg(size.width()),aligned);
        record(QString("minimal_footer_fits_%1_%2").arg(locale).arg(size.width()),usageLabel_->isVisible()&&centralWidget()->rect().contains(QRect(usageLabel_->mapTo(centralWidget(),QPoint()),usageLabel_->size()))&&cueMenu_->actions().size()==2&&cueMenu_->actions()[0]->text()==tx("Duplicate cue")&&cueMenu_->actions()[1]->text()==tx("Remove cue"));
        const auto savedResources=resourceUsage_;resourceUsage_=QJsonObject{{"sampled_unix_ms",double(QDateTime::currentMSecsSinceEpoch())},{"cpu_percent",100},{"working_set_bytes",128000000000.0},{"gpu_percent",100},{"gpu_memory_bytes",32000000000.0}};refreshUsage();usageLabel_->parentWidget()->layout()->activate();
        record(QString("footer_fits_large_mb_gb_and_composition_%1_%2").arg(locale).arg(size.width()),usageLabel_->fontMetrics().horizontalAdvance(usageLabel_->text())<=usageLabel_->contentsRect().width()&&centralWidget()->rect().contains(QRect(usageLabel_->mapTo(centralWidget(),QPoint()),usageLabel_->size()))&&!usageLabel_->text().contains("MiB")&&!usageLabel_->text().contains("Mix")&&usageLabel_->text().contains(tx("Composition")));resourceUsage_=savedResources;refreshUsage();
    }
    const bool sampled=wait([&]{const auto sample=resourceSnapshot();return sample["cpu_percent"].isDouble()&&sample["working_set_bytes"].toDouble()>0;},12000);const auto sample=resourceSnapshot();
    record("footer_uses_real_process_cpu_and_working_set",sampled&&sample["cpu_percent"].toDouble()>=0&&sample["cpu_percent"].toDouble()<=100&&sample["pid"].toInt()==QCoreApplication::applicationPid()&&!sample["stale"].toBool());
    record("gpu_counter_is_observed_or_explicitly_unavailable",sample["gpu_percent"].isNull()||(sample["gpu_percent"].isDouble()&&sample["gpu_percent"].toDouble()>=0&&sample["gpu_percent"].toDouble()<=100&&!sample["gpu_engine"].toString().isEmpty()));
    const auto memory=sample["gpu_memory_bytes"];bool memoryValid=memory.isNull()&&!sample["gpu_memory_complete"].toBool();
    if(memory.isDouble()){double totalLocal=0,totalNonlocal=0;const auto adapters=sample["gpu_memory_adapters"].toArray();bool valid=!adapters.isEmpty();for(const auto& item:adapters){const auto adapter=item.toObject();valid&=adapter["available"].toBool()&&adapter["local_bytes"].isDouble()&&adapter["nonlocal_bytes"].isDouble();totalLocal+=adapter["local_bytes"].toDouble();totalNonlocal+=adapter["nonlocal_bytes"].toDouble();}memoryValid=valid&&sample["gpu_memory_complete"].toBool()&&memory.toDouble()>=0&&memory.toDouble()==totalLocal+totalNonlocal;}
    record("gpu_memory_has_complete_adapter_byte_counts_or_is_unavailable",memoryValid);
    const auto savedUsage=resourceUsage_;resourceUsage_=QJsonObject{{"sampled_unix_ms",0},{"cpu_percent",90},{"working_set_bytes",1000},{"gpu_percent",75}};refreshUsage();const auto stale=resourceSnapshot();
    record("stale_resource_samples_show_unavailable_instead_of_zero_or_old_values",stale["cpu_percent"].isNull()&&stale["working_set_bytes"].isNull()&&stale["gpu_percent"].isNull()&&stale["gpu_memory_bytes"].isNull()&&!stale["gpu_memory_complete"].toBool()&&usageLabel_->text().startsWith("CPU —   RAM —   GPU —"));resourceUsage_=QJsonObject{{"sampled_unix_ms",double(QDateTime::currentMSecsSinceEpoch())},{"cpu_percent",12.5},{"working_set_bytes",1500000000.0},{"gpu_percent",75},{"gpu_memory_bytes",2500000000.0}};setLanguage("en");refreshUsage();record("gpu_activity_and_gpu_memory_are_independent_readings",usageLabel_->text().contains("RAM 1.50 GB")&&usageLabel_->text().contains("GPU 75.0% / 2.50 GB"));resourceUsage_=savedUsage;refreshUsage();
    resize(1600,1000);setLanguage("en");capture(base+"single-"+stem+".png");selectDiagnostics();diagnosticsPanel_->exportTo(base+"single-engine-"+stem+".json");capture(base+"single-engine-"+stem+".png");selectPage(0);
    record("manual_fade_defaults_to_300_and_edit_is_separate",manualFadeTime_->value()==300&&pages_->widget(1)->isAncestorOf(inBox_)&&!inBox_->isVisible());
    const QString first=QDir(directory).absoluteFilePath("01-h264.mp4"),second=QDir(directory).absoluteFilePath("03-h264.mkv");
    addPaths({first,second});playlistTable_->selectRow(0);const auto original=playlist_[0].json();cueMenu_->actions()[0]->trigger();record("more_menu_duplicates_selected_cue",playlist_.size()==3&&playlist_[1].json()==original);playlistTable_->selectRow(1);cueMenu_->actions()[1]->trigger();record("more_menu_removes_only_selected_cue",playlist_.size()==2&&playlist_[0].json()==original);playlistTable_->selectRow(0);cueRow(0);const bool readyA=wait([&]{return canTake();});loopBox_->setChecked(true);cutButton_->click();const bool aLive=wait([&]{return programA_.frames()>=4;});
    record("main_cut_uses_verified_source",readyA&&aLive&&programA_.cue().enterMs==0&&programA_.composedFrames()==0&&deckState_[0]->text()==tx("READY"));
    auto* aChannel=&programA_;const int aFrames=programA_.frames();addProgram_->click();pump(100);
    record("add_program_keeps_a_running_and_starts_empty_list",programCount_==2&&selectedProgram_==1&&playlist_.isEmpty()&&programA_.playing()&&programA_.frames()>aFrames&&&programA_==aChannel);
    addPaths({second});record("global_library_media_can_enter_another_playlist",library_.size()==2&&playlist_.size()==1&&programDefinitions_[0].cues.size()==2);
    playlistTable_->selectRow(0);cueRow(0);const bool readyB=wait([&]{return canTake();});loopBox_->setChecked(true);fadeButton_->click();const bool bLive=wait([&]{return channelAt(1)->frames()>=4;});
    record("second_program_plays_own_list_with_manual_fade",readyB&&bLive&&channelAt(1)->path()==second&&channelAt(1)->composedFrames()>0&&channelAt(1)->cue().transitionMs==300&&programA_.playing());
    addProgram_->click();record("third_program_is_allocated_on_demand",programCount_==3&&extraPrograms_.size()==2&&selectedProgram_==2&&playlist_.isEmpty()&&sourceBoxes_[0]->count()==3);
    // ADR-018: the engine takes local output of every Program while it runs and gives it back when it stops or fails.
    {const bool started=startLocalEngine(AudioBackend::Test,"8",128);bool owned=started&&enginePairs_.size()==3;for(int i=0;i<programCount_;++i)owned&=channelAt(i)->localEngine()&&channelAt(i)->qtSinksMuted();
     enginePairs_[1]->setCurrentIndex(1);const auto routes=engine_->statistics()["routes"].toArray();
     record("low_latency_output_owns_all_programs_with_pairs",owned&&routes.size()==3&&routes[1].toObject()["first_channel"].toInt()==3&&settings_->value("localAudio/pair/B").toInt()==1&&engineStatus_->text().startsWith(tx("Running · %1 · device latency %2 ms · sync delay %3 ms · late samples %4").section(' ',0,0)));
     enginePairs_[1]->setCurrentIndex(0);}
    // Five Programs must remain visible even with only one configured display route.
    addProgram(false);addProgram(false);pump(80);
    const int engineRoutesAtFive=int(engine_->statistics()["routes"].toArray().size());const bool fifthOwned=channelAt(4)->localEngine();
    record("five_program_inventory_with_one_route",programCount_==5&&displayCount_==1&&programInventory_->rowCount()==5&&sourceBoxes_[0]->count()==5&&programInventory_->item(4,2)->text()==tx("No display route"));
    for(const auto& locale:{QString("en"),QString("pt-BR")})for(const auto& size:{QSize(1600,1000),QSize(1280,800)}){
        setLanguage(locale);resize(size);pump(100);bool visible=programTiles_.size()==5;
        for(const auto& tile:programTiles_)visible&=tile.select->isVisible()&&multiview_->viewport()->rect().contains(QRect(tile.panel->mapTo(multiview_->viewport(),QPoint()),tile.panel->size()));
        const auto manual=manualMode_->mapTo(this,QPoint()),sequential=sequentialMode_->mapTo(this,QPoint());
        const int fadeBottom=manualFadeTime_->mapTo(this,QPoint(0,manualFadeTime_->height())).y(),takeBottom=fadeButton_->mapTo(this,QPoint(0,fadeButton_->height())).y();
        record(QString("five_tile_geometry_%1_%2").arg(locale).arg(size.width()),visible&&sequential.x()-(manual.x()+manualMode_->width())>=8&&qAbs(fadeBottom-takeBottom)<=2&&centralWidget()->rect().contains(QRect(usageLabel_->mapTo(centralWidget(),QPoint()),usageLabel_->size()))&&playlistTable_->viewport()->height()>=70);
        selectPage(3);outputsTabs_->setCurrentIndex(0);pump(80);auto* route=routePanels_[0];auto buttons=route->findChildren<QPushButton*>();bool baseline=buttons.size()==2;
        for(auto* button:buttons)baseline&=qAbs(button->mapTo(route,QPoint(0,button->height())).y()-screenBoxes_[0]->mapTo(route,QPoint(0,screenBoxes_[0]->height())).y())<=2;
        record(QString("output_spacing_and_alignment_%1_%2").arg(locale).arg(size.width()),baseline&&programInventory_->rowCount()==5&&outputsTabs_->tabText(1)=="NDI / OMT"&&route->mapTo(outputsTabs_->widget(0),QPoint()).x()>=18&&route->width()<=outputsTabs_->widget(0)->width()-36);
        selectPage(0);
    }
    resize(1600,1000);setLanguage("en");capture(base+"five-"+stem+".png");selectPage(3);capture(base+"outputs-five-"+stem+".png");selectPage(0);
    programTiles_[0].select->click();const bool tileSelect=selectedProgram_==0&&playlist_.size()==2&&programA_.playing()&&channelAt(1)->playing();
    programTiles_[4].panel->findChildren<QPushButton*>().last()->click();record("tile_controls_target_their_program_without_stopping_selected_a",tileSelect&&selectedProgram_==0&&programA_.playing()&&channelAt(1)->playing());
    // ADR-016: a detached deck reuses the Program's published frames, acts by stable ID and docks back on close.
    auto deckButton=[](QWidget* root,const QString& tip,int key){for(auto* b:root->findChildren<QPushButton*>())if(b->property("tipKey").toString()==tip&&b->property("deckKey").toInt()==key)return b;return static_cast<QPushButton*>(nullptr);};
    auto deckWindow=[this](int key){for(const auto& view:deckViews_)if(view.key==key&&view.window)return view.window.data();return static_cast<DeckWindow*>(nullptr);};
    {
        const int idB=programDefinitions_[1].id;const auto generationB=channelAt(1)->requestGeneration();auto* detach=deckButton(programTiles_[1].panel,"Detach deck",idB);if(detach)detach->click();pump(150);
        auto* window=deckWindow(idB);auto* picture=window?window->findChild<QVideoWidget*>():nullptr;const bool framed=wait([&]{return picture&&picture->videoSink()->videoFrame().isValid();});
        auto* slot=programTiles_[1].panel->findChild<QStackedWidget*>("deckSlot");
        record("detached_deck_opens_window_sharing_program_frames",detach&&window&&window->isVisible()&&window->isWindow()&&framed&&slot&&slot->currentIndex()==1&&channelAt(1)->requestGeneration()==generationB&&extraPrograms_.size()==4&&window->windowTitle().startsWith(programLabel(1)));
        if(window){window->resize(960,600);pump(80);window->grab().save(base+"deck-window-"+stem+".png");capture(base+"deck-docked-"+stem+".png");}
        if(detach)detach->click();pump(50);int windows=0;for(const auto& view:deckViews_)windows+=view.key==idB&&view.window;record("detaching_twice_reuses_the_same_window",windows==1&&deckWindow(idB)==window);
        auto* frame=window?window->findChild<QFrame*>("deck"):nullptr;auto* badge=window?window->findChild<QLabel*>("onAirBadge"):nullptr;refreshTransport();
        record("tally_marks_only_programs_with_media_on_air",frame&&badge&&frame->property("onAir").toBool()&&badge->isVisible()&&programTiles_[0].panel->property("onAir").toBool()&&programTiles_[1].panel->property("onAir").toBool()&&!programTiles_[2].panel->property("onAir").toBool()&&!programTiles_[4].panel->property("onAir").toBool());
        QPushButton* play=nullptr;if(window)for(auto* b:window->findChildren<QPushButton*>())if(b->property("tipKey").toString()=="Play / pause")play=b;
        if(play)play->click();const bool paused=wait([&]{return !channelAt(1)->playing();},3000);if(play)play->click();const bool resumed=wait([&]{return channelAt(1)->playing();},3000);
        record("deck_window_controls_drive_its_program_only",play&&paused&&resumed&&programA_.playing()&&channelAt(1)->path()==second);
        if(window)window->close();pump(80);record("closing_deck_window_docks_it_without_stopping",!deckWindow(idB)&&slot&&slot->currentIndex()==0&&channelAt(1)->playing()&&programA_.playing());
        auto* previewDetach=deckButton(pages_->widget(0),"Detach deck",PreviewDeck);if(previewDetach)previewDetach->click();pump(80);auto* previewWindow=deckWindow(PreviewDeck);
        const bool previewOpen=previewWindow&&previewWindow->isVisible()&&!previewWindow->findChild<QLabel*>("onAirBadge")->isVisible();dockDeck(PreviewDeck);pump(50);
        record("preview_deck_detaches_without_tally_and_docks",previewDetach&&previewOpen&&!deckWindow(PreviewDeck));
        auto* detachE=deckButton(programTiles_[4].panel,"Detach deck",programDefinitions_[4].id);if(detachE)detachE->click();pump(80);record("empty_program_deck_can_be_detached",detachE&&deckWindow(programDefinitions_[4].id));
    }
    auto* addRoute=qobject_cast<QPushButton*>(programInventory_->cellWidget(4,3));if(addRoute)addRoute->click();
    record("inventory_adds_route_for_correct_program_without_opening_it",addRoute&&displayCount_==2&&sourceBoxes_[1]->currentIndex()==4&&!routeWindows_[1]);removeDisplay_->click();
    switchProgram(4);const bool removedE=removeSelectedProgram();switchProgram(3);const bool removedD=removeSelectedProgram();switchProgram(2);
    record("multiview_shrinks_without_stopping_surviving_programs",removedE&&removedD&&programCount_==3&&programTiles_.size()==3&&programA_.playing()&&channelAt(1)->playing());
    record("removing_program_closes_its_detached_deck",deckViews_.isEmpty());
    record("program_add_remove_updates_engine_routes",engineRoutesAtFive==5&&fifthOwned&&engine_->statistics()["routes"].toArray().size()==3);
    {engine_->stop();pump(30);bool returned=true;for(int i=0;i<programCount_;++i)returned&=!channelAt(i)->localEngine()&&!channelAt(i)->qtSinksMuted();
     record("stopping_low_latency_output_returns_programs_to_qt",returned&&programA_.playing()&&channelAt(1)->playing());}
    record("copy_a_creates_independent_playlist",copyMainPlaylist()&&playlist_.size()==2&&programDefinitions_[0].cues.size()==2&&programDefinitions_[1].cues.size()==1);
    const auto originalCopy=playlist_[0].json();record("copy_refuses_to_overwrite_existing_items",!copyMainPlaylist()&&playlist_[0].json()==originalCopy&&playlist_.size()==2);
    playlistTable_->selectRow(0);cueRow(0);const bool cReady=wait([&]{return canTake();});selectPage(1);inBox_->setValue(.4);outBox_->setValue(2.2);const bool applied=applyEditor();const bool rangeReady=wait([&]{return canTake();});selectPage(0);loopBox_->setChecked(true);fadeButton_->click();const bool cLive=wait([&]{return channelAt(2)->frames()>=4;});
    record("third_playlist_trim_does_not_edit_a_or_b",cReady&&applied&&rangeReady&&cLive&&channelAt(2)->cue().in==400&&programDefinitions_[0].cues[0].in==0&&programDefinitions_[1].cues[0].in==0);
    record("three_programs_play_independently",programA_.playing()&&channelAt(1)->playing()&&channelAt(2)->playing()&&programA_.path()==first&&channelAt(1)->path()==second&&channelAt(2)->path()==first);
    sequentialMode_->click();const bool cSequential=controllerAt(2)->sequential()&&!controllerAt(1)->sequential();switchProgram(1);const bool bManual=manualMode_->isChecked();switchProgram(2);const bool cMode=sequentialMode_->isChecked();manualMode_->click();loopBox_->setChecked(true);
    record("modes_follow_selected_program",cSequential&&bManual&&cMode&&!controllerAt(2)->sequential());
    const int beforeSwitch=programA_.frames();selectPage(1);playlistTable_->selectRow(0);syncEditor(0);inBox_->setValue(.6);const bool blocked=!switchProgram(0);record("unapplied_draft_blocks_program_switch",blocked&&selectedProgram_==2&&inBox_->value()==.6);syncEditor(0);switchProgram(0);pump(100);
    record("switching_lists_invalidates_preview_without_stopping_programs",!canTake()&&cuedRow_==-1&&playlist_.size()==2&&programA_.frames()>beforeSwitch&&channelAt(1)->playing()&&channelAt(2)->playing());
    selectPage(0);switchProgram(2);
    for(const auto& locale:{QString("en"),QString("pt-BR")})for(const auto& size:{QSize(1600,1000),QSize(1280,800)}){
        setLanguage(locale);resize(size);pump(80);auto inside=[this](QWidget* w){return w&&w->isVisible()&&centralWidget()->rect().contains(QRect(w->mapTo(centralWidget(),QPoint()),w->size()));};record(QString("three_program_layout_%1_%2").arg(locale).arg(size.width()),this->size()==size&&inside(targetBox_)&&inside(cutButton_)&&inside(fadeButton_)&&programTiles_.size()==3&&inside(programTiles_[2].select)&&inside(copyPlaylist_)&&playlistTable_->viewport()->height()>=70);
    }
    resize(1600,1000);setLanguage("en");auto config=currentOutputConfiguration();config.displays=5;config.sources={0,0,1,2,0};const bool configured=applyOutputConfiguration(config);selectPage(3);
    record("five_routes_support_mirrored_and_independent_sources",configured&&displayCount_==5&&sourceBoxes_.size()==5&&sourceBoxes_[0]->currentIndex()==0&&sourceBoxes_[3]->currentIndex()==2&&programCount_==3);
    const auto generationA=programA_.requestGeneration();openOutput(0);openOutput(1);openOutput(3);const bool delivered=wait([&]{return routeWindows_[0]&&routeWindows_[1]&&routeWindows_[3]&&routeWindows_[0]->frames()>=3&&routeWindows_[1]->frames()>=3&&routeWindows_[3]->frames()>=3;});
    record("mirrors_share_a_and_fifth_route_does_not_allocate_decoder",delivered&&programCount_==3&&extraPrograms_.size()==2&&programA_.requestGeneration()==generationA&&routePrograms_[0]==0&&routePrograms_[1]==0&&routePrograms_[3]==2);
    openOutput(4);removeDisplay_->click();record("visible_display_cannot_be_removed",displayCount_==5);routeWindows_[4]->close();pump(30);removeDisplay_->click();addDisplay_->click();record("closed_last_route_removes_and_new_route_defaults_to_a",displayCount_==5&&sourceBoxes_[4]->currentIndex()==0);
    const auto before=currentShow();Show reduced;reduced.cues={Cue{"other.mp4"}};record("reduced_show_load_is_atomic_while_extra_programs_live",!applyShow(reduced,"blocked.mizinshow")&&programCount_==3&&playlist_.size()==2&&programA_.playing());
    record("live_selected_program_cannot_be_removed",!removeSelectedProgram()&&programCount_==3&&channelAt(2)->playing());controllerAt(2)->stop();record("open_route_blocks_removal_after_black",!removeSelectedProgram()&&programCount_==3);routeWindows_[3]->close();pump(30);
    const bool sending=busAt(2)->start(NetworkProtocol::Omt,"Mizin Dynamic Program QA");record("digital_sender_blocks_program_removal",sending&&!removeSelectedProgram()&&programCount_==3);busAt(2)->stop(NetworkProtocol::Omt);
    selectPage(4);auto* volume=findChild<QSlider*>("audioVolumeProgram3");auto* mute=findChild<QCheckBox*>("audioMuteProgram3");auto* local=findChild<QCheckBox*>("audioLocalProgram3");if(volume)volume->setValue(37);if(mute)mute->setChecked(true);if(local)local->setChecked(false);
    record("third_program_audio_is_independent",volume&&mute&&local&&qAbs(channelAt(2)->masterVolume()-.37f)<.001f&&channelAt(2)->audioMuted()&&!channelAt(2)->localAudioEnabled()&&programA_.masterVolume()==1);
    auto* stableC=channelAt(2);const int stableId=programDefinitions_[2].id;switchProgram(1);controllerAt(1)->stop();const bool removedB=removeSelectedProgram();
    record("removing_middle_program_preserves_c_identity_and_routes",removedB&&programTiles_.size()==2&&programTiles_[1].id==stableId&&programInventory_->rowCount()==2&&programCount_==2&&programDefinitions_[1].id==stableId&&channelAt(1)==stableC&&sourceBoxes_[3]->currentIndex()==1&&qAbs(channelAt(1)->masterVolume()-.37f)<.001f&&programA_.playing());
    addProgram(false);copyMainPlaylist();record("new_program_does_not_reuse_removed_identity",programCount_==3&&programDefinitions_[2].id>stableId&&playlist_.size()==2);
    for(auto& window:routeWindows_)if(window)window->close();pump(50);const QString showPath=base+"dynamic-"+stem+".mizinshow";projectPath_=showPath;saveProject(false);QFile saved(showPath);const bool opened=saved.open(QIODevice::ReadOnly);Show restored;const bool read=opened&&Show::read(QJsonDocument::fromJson(saved.readAll()).object(),restored);
    record("schema4_file_preserves_independent_lists_and_stable_ids",read&&restored.programs.size()==3&&restored.programs[0].cues[0].in==0&&restored.programs[1].id==stableId&&restored.programs[1].cues[0].in==400&&restored.outputs.displays==5);
    const bool single=applyOutputConfiguration(OutputConfiguration{});const bool restoredShow=read&&applyShow(restored,showPath);record("show_restores_dynamic_topology_without_starting_outputs",single&&programTiles_.size()==3&&programInventory_->rowCount()==3&&restoredShow&&programCount_==3&&displayCount_==5&&sourceBoxes_[3]->currentIndex()==1&&programA_.playing());
    bool inactive=true;for(const auto& window:routeWindows_)inactive&=!window||!window->isVisible();for(int i=0;i<programCount_;++i)for(auto protocol:{NetworkProtocol::Ndi,NetworkProtocol::Omt})inactive&=!busAt(i)->sender(protocol).running();record("restored_show_keeps_all_network_and_displays_closed",inactive&&!web_->running());
    selectDiagnostics();diagnosticsPanel_->refresh();report=diagnosticsReport();auto* metrics=findChild<QTableWidget*>("engineMetrics");auto* network=findChild<QTableWidget*>("networkMetrics");record("diagnostics_expand_with_programs_and_routes",metrics->columnCount()==5&&network->rowCount()==6&&report["channels"].toArray().size()==4&&report["outputs"].toArray().size()==5);
    bool unknown=true;for(const auto& channel:report["channels"].toArray())unknown&=channel.toObject()["decoder_adapter"].isNull()&&channel.toObject()["decode_time_ms"].isNull();record("dynamic_diagnostics_preserve_unknown_metrics",unknown&&diagnosticsPanel_->exportTo(base+"engine-"+stem+".json"));capture(base+"engine-"+stem+".png");
    selectPage(0);switchProgram(1);playlistTable_->selectRow(0);cueRow(0);wait([&]{return canTake();});capture(base+"dynamic-"+stem+".png");const auto pathA=programA_.path();const int framesBefore=programA_.frames();playlist_.append(Cue{QDir(directory).absoluteFilePath("missing-dynamic.mp4")});refreshTables();playlistTable_->selectRow(playlist_.size()-1);cueRow(playlist_.size()-1);pump(100);record("invalid_selected_media_blocks_take_and_preserves_a",!canTake()&&!cutButton_->isEnabled()&&readiness_.state()==CueReadiness::State::Error&&programA_.path()==pathA&&programA_.frames()>framesBefore);
    manualFadeTime_->setValue(450);settings_->sync();record("manual_fade_preference_still_persists",settings_->value("manualFadeMs").toInt()==450);for(int i=0;i<programCount_;++i)controllerAt(i)->stop();preview_.black();
    programA_.load(first);const bool retainedReady=wait([&]{return programA_.frames()>=4;});record("update_install_guard_blocks_live_program",updatePlaybackBusy());programA_.togglePause();wait([&]{return !programA_.playing();});programA_.seek(1300);pump(200);
    const bool collapsed=applyOutputConfiguration(OutputConfiguration{});pump(80);auto* restoredVideo=programViews_->widget(0)->findChild<QVideoWidget*>();
    record("paused_retained_frame_restores_when_returning_to_single_view",retainedReady&&collapsed&&restoredVideo&&restoredVideo->videoSink()->videoFrame().isValid()&&restoredVideo->videoSink()->videoFrame().startTime()==programA_.lastFrame().startTime());controllerA_.stop();
    // Show reliability: autosave/recovery, .bak on save, relink of moved media.
    {
        clearRecovery();switchProgram(0,true);dirty_=true;const bool wrote=autosaveTick();QFile copy(recoveryPath());const bool parsed=copy.open(QIODevice::ReadOnly)&&QJsonDocument::fromJson(copy.readAll()).object()==currentShow().json();copy.close();
        record("autosave_writes_recovery_copy_of_unsaved_show",wrote&&hasRecovery()&&parsed&&!autosaveTick());
        const QString showFile=base+"reliability-"+stem+".mizinshow";QFile::remove(showFile);QFile::remove(showFile+".bak");projectPath_=showFile;saveProject(false);const bool firstSave=QFileInfo::exists(showFile)&&!QFileInfo::exists(showFile+".bak")&&!hasRecovery()&&!dirty_;
        playlist_.append(Cue{QDir(directory).absoluteFilePath("03-h264.mkv")});dirty_=true;saveProject(false);
        record("saving_keeps_previous_version_as_bak_and_clears_recovery",firstSave&&QFileInfo::exists(showFile+".bak")&&!hasRecovery());
        const int savedItems=playlist_.size();playlist_.append(Cue{QDir(directory).absoluteFilePath("01-h264.mp4")});dirty_=true;autosaveTick();const int unsavedItems=playlist_.size();
        playlist_.removeLast();programDefinitions_[0].cues=playlist_;dirty_=false;
        const bool restored=restoreRecovery();record("recovery_restores_unsaved_show_and_keeps_it_dirty",restored&&dirty_&&playlist_.size()==unsavedItems&&unsavedItems==savedItems+1&&projectPath_==showFile);
        discardRecovery();record("discarded_recovery_is_moved_aside_not_deleted",!hasRecovery()&&!QDir(recoveryDirectory()).entryList({"discarded-*.mizinshow"},QDir::Files).isEmpty());
        const QString root=base+"relink-"+stem;QDir(root).removeRecursively();QDir().mkpath(root+"/show/sub");QDir().mkpath(root+"/a");QDir().mkpath(root+"/b");
        QFile::copy(QDir(directory).absoluteFilePath("01-h264.mp4"),root+"/show/sub/01-h264.mp4");for(auto folder:{"/a/dup.mp4","/b/dup.mp4"}){QFile f(root+folder);f.open(QIODevice::WriteOnly);f.write("x");}
        const QString oldA="Z:/old/show/sub/01-h264.mp4",oldDup="Z:/old/a/dup.mp4",tieDup="Z:/other/dup.mp4";
        const auto plan=relinkPlan({oldA,oldDup,tieDup},root);
        record("relink_finds_moved_media_and_disambiguates_by_folder",plan.value(oldA)==QDir::cleanPath(root+"/show/sub/01-h264.mp4")&&plan.value(oldDup)==QDir::cleanPath(root+"/a/dup.mp4")&&!plan.contains(tieDup));
        playlist_=QList<Cue>{Cue{oldA}};programDefinitions_[0].cues=playlist_;library_.append(oldA);const bool missingBefore=missingMedia().contains(oldA);const int changed=applyRelink(plan);
        record("relink_updates_playlists_library_and_marks_show_dirty",missingBefore&&changed>=2&&playlist_[0].path==plan.value(oldA)&&library_.contains(plan.value(oldA))&&!missingMedia().contains(oldA)&&dirty_);
        dirty_=false;clearRecovery();
    }
    // Portable show package: media copied beside the show with relative paths; opens from any folder/drive.
    {
        const QString root=base+"package-"+stem;QDir(root).removeRecursively();QDir().mkpath(root+"/src/a");QDir().mkpath(root+"/src/b");
        QFile::copy(QDir(directory).absoluteFilePath("01-h264.mp4"),root+"/src/a/clip.mp4");QFile::copy(QDir(directory).absoluteFilePath("03-h264.mkv"),root+"/src/b/clip.mp4");
        switchProgram(0,true);playlist_=QList<Cue>{Cue{root+"/src/a/clip.mp4"},Cue{root+"/src/b/clip.mp4"},Cue{root+"/src/missing.mov"}};programDefinitions_[0].cues=playlist_;library_={root+"/src/a/clip.mp4"};
        const QString showFile=exportPackage(root+"/Package Show","Package Show",false);QFile file(showFile);Show exported;const bool read=file.open(QIODevice::ReadOnly)&&Show::read(QJsonDocument::fromJson(file.readAll()).object(),exported);file.close();
        const auto cues=read?exported.definitions()[0].cues:QList<Cue>{};
        record("package_copies_media_with_relative_paths_and_unique_names",read&&cues.size()==3&&cues[0].path=="media/clip.mp4"&&cues[1].path=="media/clip (2).mp4"&&cues[2].path==root+"/src/missing.mov"
            &&QFileInfo(root+"/Package Show/media/clip.mp4").size()==QFileInfo(root+"/src/a/clip.mp4").size()&&QFileInfo(root+"/Package Show/media/clip (2).mp4").size()==QFileInfo(root+"/src/b/clip.mp4").size()&&QDir(root+"/Package Show/media").entryList(QDir::Files).size()==2);
        // Move the whole package elsewhere: relative paths resolve against the new location.
        QDir().rename(root+"/Package Show",root+"/Moved Package");Show moved=exported;resolveShowPaths(moved,root+"/Moved Package/Package Show.mizinshow");
        record("moved_package_resolves_media_from_its_new_folder",QFileInfo::exists(moved.definitions()[0].cues[0].path)&&QFileInfo::exists(moved.definitions()[0].cues[1].path)&&moved.definitions()[0].cues[0].path.startsWith(root+"/Moved Package/media/"));
        Show saved=moved;relativizeShowPaths(saved,root+"/Moved Package/Package Show.mizinshow");
        record("saving_inside_package_keeps_media_relative",saved.definitions()[0].cues[0].path=="media/clip.mp4"&&saved.definitions()[0].cues[2].path==root+"/src/missing.mov");
        playlist_.clear();programDefinitions_[0].cues.clear();library_.clear();dirty_=false;
    }
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"version",QString(MizinVersion)},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"scope","Native in-process widgets; stable selected-mode text, aligned TAKE controls, real process counters, decimal MB/GB and DXGI GPU memory, five-Program multiview/inventory and five floating display routes. Not OS-pointer/physical monitor/AV-sync or maximum-capacity qualification."},{"tests",tests}};QFile output(resultPath);if(!output.open(QIODevice::WriteOnly))return 3;output.write(QJsonDocument(result).toJson());return all?0:2;
}
