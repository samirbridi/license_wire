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
