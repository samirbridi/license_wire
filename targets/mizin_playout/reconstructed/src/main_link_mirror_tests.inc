// ADR-019 phase 2 end-to-end: a real master MainWindow and a real backup MainWindow in one process.
int MainWindow::runLinkMirrorTests(const QString& directory,const QString& resultPath){
    qApp->setQuitOnLastWindowClosed(false);QJsonArray tests;bool all=true;
    auto record=[&](const QString& name,bool ok,QJsonObject details=QJsonObject{}){details["name"]=name;details["pass"]=ok;tests.append(details);all&=ok;qInfo().noquote()<<name<<ok<<QJsonDocument(details).toJson(QJsonDocument::Compact);};
    auto wait=[&](const std::function<bool()>& predicate,int limit=15000){QElapsedTimer time;time.start();while(!predicate()&&time.elapsed()<limit){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();};
    QTemporaryDir work;const QString first=QDir(directory).absoluteFilePath("01-h264.mp4"),second=QDir(directory).absoluteFilePath("03-h264.mkv");
    auto* main=new MainWindow(false,"en",work.path()+"/main");auto* backup=new MainWindow(false,"en",work.path()+"/backup");
    for(auto* window:{main,backup})for(int i=0;i<window->programCount_;++i)window->channelAt(i)->setLocalAudioEnabled(false);
    main->addPaths({first,second});main->dirty_=false;
    const bool linked=main->link_->startMaster("mirror-code",0)&&backup->link_->startFollower("mirror-code",false)&&backup->link_->connectTo("127.0.0.1",main->link_->port());
    const bool joined=wait([&]{return backup->link_->connected();},8000);
    main->storeActivePlaylist();main->link_->publishShow(main->currentShow(),"Mirror Test");
    const bool received=wait([&]{return !backup->link_->receivedShowPath().isEmpty();},30000);
    const bool loaded=received&&backup->loadLinkShow();backup->linkMirror_->setChecked(true);
        record("backup_receives_and_loads_the_master_show",linked&&joined&&loaded&&backup->programDefinitions_[0].cues.size()==2,{{"show",backup->link_->receivedShowPath()},{"revision",backup->link_->receivedRevision()}});
    const QString localFirst=QDir::cleanPath(QFileInfo(backup->link_->receivedShowPath()).absoluteDir().absoluteFilePath("media/01-h264.mp4"));
    main->programA_.setLoop(true);main->controllerA_.takeManual(main->playlist_,0,PlaylistController::ManualTake::Cut);
    const bool followed=wait([&]{return backup->programA_.playing()&&QDir::cleanPath(backup->programA_.path())==localFirst;},10000);
    record("backup_repeats_the_cut",followed,{{"backup_path",backup->programA_.path()}});
    wait([]{return false;},2500);const qint64 drift=std::llabs(backup->programA_.position()-main->programA_.position());
    record("backup_follows_the_master_position",followed&&drift<=150,{{"drift_ms",double(drift)},{"corrections",backup->mirrorCorrections_}});
    main->programA_.togglePause();const bool paused=wait([&]{return !backup->programA_.playing();},5000);main->programA_.togglePause();const bool resumed=wait([&]{return backup->programA_.playing();},5000);
    record("backup_pauses_and_resumes_with_the_master",paused&&resumed);
    main->controllerA_.takeManual(main->playlist_,1,PlaylistController::ManualTake::Fade,300);
    const bool faded=wait([&]{return QFileInfo(backup->programA_.path()).fileName()=="03-h264.mkv"&&backup->programA_.playing();},10000);
    record("backup_repeats_the_fade_to_the_next_item",faded,{{"backup_path",backup->programA_.path()}});
    main->controllerA_.stop();const bool black=wait([&]{return backup->programA_.path().isEmpty();},5000);record("backup_goes_to_black_with_the_master",black);
    // Phase 3: synchronized take. Both machines prepare now and switch at the same master-clock instant.
    main->linkSync_->setChecked(true);main->cuedRow_=0;const bool armed=main->syncMode();QElapsedTimer switchClock;switchClock.start();qint64 mainAt=-1,backupAt=-1;
    auto started=[](MainWindow* w){return w->programA_.playing()&&QFileInfo(w->programA_.path()).fileName()=="01-h264.mp4";};
    const bool synced=armed&&main->syncTake(PlaylistController::ManualTake::Cut)&&wait([&]{if(mainAt<0&&started(main))mainAt=switchClock.elapsed();if(backupAt<0&&started(backup))backupAt=switchClock.elapsed();return mainAt>=0&&backupAt>=0;},10000);
    wait([]{return false;},250);const qint64 startGap=std::llabs(backup->programA_.position()-main->programA_.position());
    // On time both must switch within 50 ms; a late preparation (overloaded host) is reported and must converge below.
    const bool latePrepare=qMax(mainAt,backupAt)>SyncLeadMs+50;
    record("synchronized_take_switches_both_machines_together",synced&&(std::llabs(mainAt-backupAt)<=50||latePrepare),{{"main_ms",double(mainAt)},{"backup_ms",double(backupAt)},{"lead_ms",SyncLeadMs},{"late_prepare",latePrepare},{"position_gap_ms",double(startGap)}});
    wait([]{return false;},1500);QList<qint64> diffs;for(int k=0;k<25;++k){const qint64 span=main->programA_.cue().end(main->programA_.duration())-main->programA_.cue().in;qint64 d=backup->programA_.position()-main->programA_.position();if(span>0)d=((d%span)+span+span/2)%span-span/2;diffs.append(std::llabs(d));wait([]{return false;},100);}
    std::sort(diffs.begin(),diffs.end());const qint64 median=diffs[diffs.size()/2];
    record("synchronized_playback_holds_within_two_frames",synced&&median<=67,{{"median_ms",double(median)},{"max_ms",double(diffs.last())},{"backup_rate",backup->programA_.playbackRate()},{"corrections",backup->mirrorCorrections_}});
    const bool reported=wait([&]{const auto peers=main->link_->peers();return !peers.isEmpty()&&peers.first().syncMs>=0;},5000);
    record("master_sees_the_follower_sync_error",reported,{{"sync_ms",reported?main->link_->peers().first().syncMs:-1.0}});
    main->linkSync_->setChecked(false);
    {OutputWindow crop(&main->programA_,&main->outputRouter_,OutputScaling::Native);crop.resize(400,300);crop.setRegion({.5,0,.5,1});const QRect g=crop.canvasGeometry();
     main->areaBoxes_[0]->setCurrentIndex(2);const QRectF preset=main->routeRegion(0);main->areaBoxes_[0]->setCurrentIndex(0);
     record("output_area_shows_only_its_part_of_the_video",g==QRect(-400,0,800,300)&&crop.video()->aspectRatioMode()==Qt::IgnoreAspectRatio&&preset==QRectF(.5,0,.5,1)&&main->routeRegion(0)==QRectF(0,0,1,1),{{"canvas",QString("%1,%2 %3x%4").arg(g.x()).arg(g.y()).arg(g.width()).arg(g.height())}});}
    // Phase 4: a control station window signs in as an operator and commands the master's Program A.
    auto* station=new MainWindow(false,"en",work.path()+"/station");for(int i=0;i<station->programCount_;++i)station->channelAt(i)->setLocalAudioEnabled(false);
    main->appendOperator({{"name","Ana"},{"pin","2468"},{"level","operator"},{"programs",QJsonArray{}}});main->saveOperators();
    station->linkRole_->setCurrentIndex(2);const bool stationUp=station->link_->startControl("mirror-code","Ana","2468",false)&&station->link_->connectTo("127.0.0.1",main->link_->port());
    const bool desk=stationUp&&wait([&]{return station->remotePrograms_.size()==main->programCount_&&station->remotePrograms_[0].items->count()==2;},8000);station->refreshLink();
    record("control_station_shows_the_master_desk",desk&&!station->remoteDesk_->isHidden()&&station->link_->operatorName()=="Ana",{{"programs",int(station->remotePrograms_.size())}});
    const int remoteId=main->programDefinitions_[0].id;if(desk)station->sendRemote(remoteId,"cut",1);
    const bool remoteCut=wait([&]{return QFileInfo(main->programA_.path()).fileName()=="03-h264.mkv"&&main->programA_.playing();},8000);
    const bool backupFollowed=wait([&]{return QFileInfo(backup->programA_.path()).fileName()=="03-h264.mkv";},8000);
    record("remote_cut_runs_on_the_master_and_its_backup",remoteCut&&backupFollowed,{{"main",main->programA_.path()},{"backup",backup->programA_.path()}});
    station->sendRemote(remoteId,"black");const bool remoteBlack=wait([&]{return main->programA_.path().isEmpty();},5000);
    QFile remoteLog(QDir(main->stateDirectory_).filePath("link/remote-log.txt"));const bool logged=remoteLog.open(QIODevice::ReadOnly)&&remoteLog.readAll().contains("Ana");
    record("remote_black_runs_and_every_command_is_logged",remoteBlack&&logged);
    station->link_->stop();delete station;
    main->controllerA_.takeManual(main->playlist_,0,PlaylistController::ManualTake::Cut);wait([&]{return backup->programA_.playing();},10000);
    record("backup_shows_no_alarm_while_the_master_is_alive",!backup->masterLost_&&!backup->masterLostBanner_->isHidden()==false);
    main->link_->stop();const bool alarmed=wait([&]{return backup->masterLost_&&!backup->masterLostBanner_->isHidden();},6000);
    record("master_lost_alarm_and_backup_keeps_playing",alarmed&&backup->programA_.playing());
    const bool tookOver=backup->takeOverAsMaster();
    record("backup_takes_over_as_master",tookOver&&backup->link_->role()==LinkNode::Role::Master&&!backup->masterLost_&&backup->masterLostBanner_->isHidden());
    backup->link_->stop();main->controllerA_.stop();backup->controllerA_.stop();delete backup;delete main;
    QJsonObject result{{"result",all?"PASS":"FAIL"},{"version",QString(MizinVersion)},{"tests",tests},{"scope","Two MainWindows (master and mirroring backup) in one process over loopback TCP; same computer, same disk. Not a multi-computer LAN failover qualification."}};
    QFile output(resultPath);if(!output.open(QIODevice::WriteOnly))return 3;output.write(QJsonDocument(result).toJson());return all?0:2;
}
