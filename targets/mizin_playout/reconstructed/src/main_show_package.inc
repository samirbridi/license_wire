    // Portable show package: <folder>/<name>.mizinshow + <folder>/media/*, with paths relative to the show,
    // so it opens on any computer/drive. Relative paths in any show resolve against the show file's folder,
    // and saving keeps media that lives inside the show folder relative.
    static void resolveShowPaths(Show& show,const QString& showPath){
        if(showPath.isEmpty())return;const QDir base=QFileInfo(showPath).absoluteDir();
        auto fix=[&](QString& path){if(!path.isEmpty()&&QDir::isRelativePath(path))path=QDir::cleanPath(base.absoluteFilePath(path));};
        for(auto& path:show.library)fix(path);for(auto& cue:show.cues)fix(cue.path);for(auto& program:show.programs)for(auto& cue:program.cues)fix(cue.path);
    }
    static void relativizeShowPaths(Show& show,const QString& showPath){
        const QDir base=QFileInfo(showPath).absoluteDir();const QString prefix=QDir::cleanPath(base.absolutePath())+"/";
        auto fix=[&](QString& path){const QString clean=QDir::cleanPath(QDir::fromNativeSeparators(path));if(clean.startsWith(prefix,Qt::CaseInsensitive))path=base.relativeFilePath(clean);};
        for(auto& path:show.library)fix(path);for(auto& cue:show.cues)fix(cue.path);for(auto& program:show.programs)for(auto& cue:program.cues)fix(cue.path);
    }
    struct PackagePlan {QString showFile;QList<QPair<QString,QString>> copies;QStringList missing;qint64 bytes=0;QHash<QString,QString> relative;};
    static PackagePlan planPackage(const QStringList& media,const QString& folder,const QString& name){
        PackagePlan plan;plan.showFile=QDir(folder).filePath(name+".mizinshow");QSet<QString> used;
        for(const auto& source:media){
            const QFileInfo info(source);if(!info.isFile()){plan.missing.append(source);continue;}
            // Same file name from different folders: "clip.mp4", "clip (2).mp4", ...
            QString file=info.fileName();for(int n=2;used.contains(file.toLower());++n)file=info.completeBaseName()+QString(" (%1)").arg(n)+(info.suffix().isEmpty()?QString():"."+info.suffix());
            used.insert(file.toLower());const QString relative="media/"+file;plan.relative.insert(source,relative);plan.copies.append({source,QDir(folder).filePath(relative)});plan.bytes+=info.size();
        }
        return plan;
    }
    struct PackageResult {int copied=0;QStringList failed;bool cancelled=false;};
    static PackageResult copyPackage(const PackagePlan& plan,std::atomic<qint64>* done,std::atomic<bool>* cancel){
        PackageResult result;QDir().mkpath(QFileInfo(plan.showFile).absolutePath()+"/media");QByteArray buffer(4*1024*1024,Qt::Uninitialized);
        for(const auto& [source,target]:plan.copies){
            if(cancel&&cancel->load()){result.cancelled=true;break;}
            QFile in(source),out(target+".part");bool ok=in.open(QIODevice::ReadOnly)&&out.open(QIODevice::WriteOnly);
            while(ok&&!in.atEnd()){if(cancel&&cancel->load()){result.cancelled=true;ok=false;break;}const qint64 n=in.read(buffer.data(),buffer.size());ok=n>=0&&out.write(buffer.constData(),n)==n;if(done)*done+=n;}
            out.close();ok=ok&&QFileInfo(out.fileName()).size()==QFileInfo(source).size();
            if(ok){QFile::remove(target);ok=QFile::rename(out.fileName(),target);}
            if(!ok){QFile::remove(out.fileName());if(result.cancelled)break;result.failed.append(source);}else ++result.copied;
        }
        return result;
    }
    // Returns the written show file, or empty on failure/cancel. interactive=false is used by tests.
    QString exportPackage(const QString& folder,const QString& name,bool interactive){
        const auto plan=planPackage(allShowMedia(),folder,name);QDir().mkpath(folder);
        const QStorageInfo storage(folder);
        if(storage.isValid()&&storage.bytesAvailable()>=0&&storage.bytesAvailable()<plan.bytes+50000000){
            if(interactive)QMessageBox::warning(this,tx("Export show package"),tx("Not enough free space: %1 needed.").arg(memoryText(QJsonValue(double(plan.bytes)))));return {};}
        std::atomic<qint64> done{0};std::atomic<bool> cancel{false};
        QFutureWatcher<PackageResult> watcher;QEventLoop loop;connect(&watcher,&QFutureWatcher<PackageResult>::finished,&loop,&QEventLoop::quit);
        watcher.setFuture(QtConcurrent::run([plan,&done,&cancel]{return copyPackage(plan,&done,&cancel);}));
        std::unique_ptr<QProgressDialog> progress;QTimer tick;
        if(interactive){progress=std::make_unique<QProgressDialog>(tx("Copying show media…"),tx("Cancel"),0,1000,this);progress->setWindowTitle(tx("Export show package"));progress->setWindowModality(Qt::WindowModal);progress->setMinimumDuration(0);
            connect(progress.get(),&QProgressDialog::canceled,this,[&cancel]{cancel=true;});
            tick.setInterval(100);connect(&tick,&QTimer::timeout,this,[&]{progress->setValue(plan.bytes>0?int(1000.0*done.load()/plan.bytes):0);progress->setLabelText(tx("Copying show media…")+QString("\n%1 / %2").arg(memoryText(QJsonValue(double(done.load()))),memoryText(QJsonValue(double(plan.bytes)))));});tick.start();}
        if(!watcher.isFinished())loop.exec();tick.stop();if(progress)progress->close();
        const auto result=watcher.result();if(result.cancelled){if(interactive)footer_->setText(tx("Show package export cancelled"));return {};}
        Show show=currentShow();auto fix=[&](QString& path){const auto it=plan.relative.constFind(path);if(it!=plan.relative.cend()&&!result.failed.contains(path))path=it.value();};
        for(auto& path:show.library)fix(path);for(auto& cue:show.cues)fix(cue.path);for(auto& program:show.programs)for(auto& cue:program.cues)fix(cue.path);
        QSaveFile file(plan.showFile);const auto payload=QJsonDocument(show.json()).toJson();
        if(!file.open(QIODevice::WriteOnly)||file.write(payload)!=payload.size()||!file.commit()){if(interactive)QMessageBox::warning(this,tx("Export show package"),tx("Could not save show"));return {};}
        if(interactive){
            QString text=tx("Show package exported: %1 media files copied to %2.").arg(result.copied).arg(QDir::toNativeSeparators(folder));
            const QStringList problems=plan.missing+result.failed;
            if(!problems.isEmpty()){QStringList names;for(const auto& path:problems.mid(0,12))names<<QFileInfo(path).fileName();text+="\n\n"+tx("Not included (missing or unreadable):")+"\n"+names.join("\n")+(problems.size()>12?"\n…":"");}
            QMessageBox::information(this,tx("Export show package"),text);footer_->setText(tx("Show package exported"));
        }
        return plan.showFile;
    }
    void exportPackageInteractive(){
        if(demo_)return;const QString base=projectPath_.isEmpty()?tx("Untitled show"):QFileInfo(projectPath_).completeBaseName();
        const QString parent=QFileDialog::getExistingDirectory(this,tx("Choose where to create the show package"));if(parent.isEmpty())return;
        QString folder=QDir(parent).filePath(base);for(int n=2;QFileInfo::exists(folder);++n)folder=QDir(parent).filePath(base+QString(" (%1)").arg(n));
        exportPackage(folder,base,true);
    }
