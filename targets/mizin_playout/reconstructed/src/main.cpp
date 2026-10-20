#include "channel.hpp"
#include "playlist.hpp"
#include "output.hpp"
#include "smoke.hpp"
#include "version.hpp"
#include <QtWidgets>
#include <QtConcurrent>
#include <QVideoWidget>
#include <functional>
#include <QThread>

static QString clockText(qint64 ms) {
    const qint64 seconds = qMax<qint64>(0, ms) / 1000;
    return QString("%1:%2:%3").arg(seconds/3600, 2, 10, QChar('0')).arg((seconds/60)%60, 2, 10, QChar('0')).arg(seconds%60, 2, 10, QChar('0'));
}

class SamplePicture final : public QWidget {
public:
    int scene = 0;
    explicit SamplePicture(int s, QWidget* parent=nullptr) : QWidget(parent), scene(s) { setMinimumHeight(120); }
    void paintEvent(QPaintEvent*) override {
        QPainter p(this); p.setRenderHint(QPainter::Antialiasing);
        QLinearGradient g(0, 0, width(), height());
        g.setColorAt(0, scene == 1 ? QColor("#182728") : QColor("#172335"));
        g.setColorAt(1, scene == 1 ? QColor("#705a37") : QColor("#364c68")); p.fillRect(rect(), g);
        p.setPen(QColor(255,255,255,22));
        for (int x=0;x<width();x+=36) p.drawLine(x,0,x,height());
        for (int y=0;y<height();y+=36) p.drawLine(0,y,width(),y);
        p.setPen(QPen(scene == 1 ? QColor("#f1bd70") : QColor("#8ecadb"), 2));
        const QPointF center(width()*.79,height()*.48); const qreal radius=height()*.32;
        p.drawEllipse(center,radius,radius); p.drawEllipse(center,radius*.66,radius*.66);
        p.drawLine(QPointF(center.x()-radius*1.2,center.y()),QPointF(center.x()+radius*1.2,center.y()));
        p.setPen(QColor("#f4f6fa"));
        QFont f("Segoe UI",qMax(12,height()/13),QFont::DemiBold);p.setFont(f);
        p.drawText(QRect(24,height()/3,width()-48,height()/3),Qt::AlignLeft|Qt::AlignVCenter,scene == 1 ? "OPENING\nNIGHT" : "MIZIN\nPLAYOUT");
        p.setFont(QFont("Segoe UI",8));p.setPen(QColor("#c3cbd6"));p.drawText(24,height()-18,"LAYOUT SAMPLE");
    }
};

class MainWindow final : public QMainWindow {
    bool demo_;
    QString language_;
    QJsonObject dictionary_;
    struct Binding { QPointer<QWidget> widget; QString key; };
    QList<Binding> bindings_;
    QStackedWidget* pages_;
    QTableWidget* playlistTable_;
    QTableWidget* libraryTable_;
    QListWidget* roots_;
    QComboBox* languageBox_;
    QComboBox* targetBox_;
    QLabel* previewName_;
    QLabel* programName_;
    QLabel* secondaryName_;
    QLabel* previewTime_;
    QLabel* programTime_;
    QLabel* secondaryTime_;
    QLabel* footer_;
    QLabel* showTitle_;
    QStringList library_, folders_;
    QList<Cue> playlist_;
    int editing_=-1, cuedRow_=-1;
    QLabel *editorName_=nullptr,*editorTime_=nullptr,*editorStatus_=nullptr;
    QComboBox* editorCueBox_=nullptr;
    QString editorStatusKey_="Select a cue to edit.";
    QPushButton *cutButton_=nullptr,*fadeButton_=nullptr;
    QSpinBox* manualFadeTime_=nullptr;
    QSlider* scrub_=nullptr;
    QDoubleSpinBox *inBox_=nullptr,*outBox_=nullptr,*transitionTime_=nullptr,*enterBox_=nullptr,*exitBox_=nullptr;
    QComboBox* transitionBox_=nullptr;
    QCheckBox *sequentialBox_=nullptr,*repeatBox_=nullptr,*loopBox_=nullptr;
    bool syncingEditor_=false;
    QString projectPath_;
    NativeChannel preview_{true, this}, programA_{false,this}, programB_{false,this};
    PlaylistController controllerA_{&programA_,this},controllerB_{&programB_,this};
    std::unique_ptr<QSettings> settings_;
    QList<QPointer<QWidget>> outputWindows_;
    QList<QComboBox*> sourceBoxes_, screenBoxes_,scalingBoxes_;
    QList<QLabel*> outputStatus_;
    std::array<QPointer<OutputWindow>,3> routeWindows_{};
    OutputRouter outputRouter_{this};
    QFutureWatcher<QStringList> scanner_;
    QButtonGroup* navigation_ = nullptr;
    QComboBox* decodingBox_ = nullptr;
    bool dirty_ = false;
public:
    MainWindow(bool demo, const QString& language, const QString& stateDir) : demo_(demo), language_(language) {
        QDir().mkpath(stateDir);
        settings_ = std::make_unique<QSettings>(stateDir+"/preferences.ini",QSettings::IniFormat);
        if(language_.isEmpty()) language_=settings_->value("language","en").toString();
        readDictionary();
        setWindowTitle("Mizin Playout — " + QString(MizinVersion)); resize(1600,1000);setMinimumSize(1160,800);setAcceptDrops(true);
        auto* shell = new QWidget; auto* outer = new QHBoxLayout(shell); outer->setContentsMargins(0,0,0,0);outer->setSpacing(0);
        auto* rail = new QFrame; rail->setObjectName("rail");rail->setFixedWidth(178);auto* nav = new QVBoxLayout(rail);nav->setContentsMargins(16,28,16,18);nav->setSpacing(10);
        auto* brand = new QLabel("MIZIN");brand->setObjectName("brand");nav->addWidget(brand);nav->addWidget(label("PLAYOUT", "eyebrow"));nav->addSpacing(30);
        pages_ = new QStackedWidget;
        const QStringList pageNames{"MAIN","EDIT","Library","Outputs","Settings"};
        auto* group = new QButtonGroup(this);navigation_=group;group->setExclusive(true);
        for(int i=0;i<pageNames.size();++i) {
            auto* b=button(pageNames[i]);b->setObjectName("navigation");b->setCheckable(true);group->addButton(b,i);nav->addWidget(b);
            connect(b,&QPushButton::clicked,this,[this,i]{pages_->setCurrentIndex(i);});if(i==0)b->setChecked(true);
        }
        nav->addStretch();auto* help=button("Quick start  ·  F1");nav->addWidget(help);connect(help,&QPushButton::clicked,this,[this]{helpDialog();});
        nav->addWidget(label(demo_ ? "DESIGN PREVIEW" : "DEVELOPMENT", "eyebrow"));
        auto* content = new QWidget;auto* contentLayout = new QVBoxLayout(content);contentLayout->setContentsMargins(24,20,24,12);contentLayout->setSpacing(16);
        auto* top = new QHBoxLayout;showTitle_=new QLabel;showTitle_->setObjectName("heading");top->addWidget(showTitle_);top->addStretch();
        languageBox_=new QComboBox;languageBox_->addItem("English","en");languageBox_->addItem("Português (Brasil)","pt-BR");languageBox_->setCurrentIndex(language_=="pt-BR"?1:0);top->addWidget(languageBox_);
        auto* save=button("Save show");top->addWidget(save);connect(save,&QPushButton::clicked,this,[this]{saveProject(false);});
        contentLayout->addLayout(top);contentLayout->addWidget(pages_,1);
        footer_=new QLabel;footer_->setObjectName("footer");contentLayout->addWidget(footer_);
        outer->addWidget(rail);outer->addWidget(content,1);setCentralWidget(shell);
        pages_->addWidget(mainPage());pages_->addWidget(editorPage());pages_->addWidget(libraryPage());pages_->addWidget(outputsPage());pages_->addWidget(settingsPage());
        refreshScreens();
        auto watchScreen=[this](QScreen* screen){connect(screen,&QScreen::geometryChanged,this,[this]{refreshScreens();});connect(screen,&QScreen::logicalDotsPerInchChanged,this,[this]{refreshScreens();});};
        for(auto* screen:QGuiApplication::screens())watchScreen(screen);
        connect(qGuiApp,&QGuiApplication::screenAdded,this,[this,watchScreen](QScreen* screen){watchScreen(screen);refreshScreens();});
        connect(qGuiApp,&QGuiApplication::screenRemoved,this,[this]{refreshScreens();});
        connect(languageBox_,&QComboBox::currentIndexChanged,this,[this]{language_=languageBox_->currentData().toString();readDictionary();retranslate();if(!demo_)settings_->setValue("language",language_);});
        for(auto* channel : {&preview_,&programA_,&programB_}) {
            connect(channel,&NativeChannel::changed,this,[this]{refreshTransport();});
            connect(channel,&NativeChannel::failed,this,[this](const QString& error){footer_->setText(tx("Media error")+": "+error);});
        }
        connect(&scanner_,&QFutureWatcher<QStringList>::finished,this,[this]{addPaths(scanner_.result());footer_->setText(tx("Folder scan complete"));});
        auto* f1=new QShortcut(QKeySequence(Qt::Key_F1),this);connect(f1,&QShortcut::activated,this,[this]{helpDialog();});
        auto* take=new QShortcut(QKeySequence(Qt::CTRL|Qt::Key_Return),this);connect(take,&QShortcut::activated,this,[this]{takeSelected(PlaylistController::ManualTake::Cut);});
        auto* fade=new QShortcut(QKeySequence(Qt::CTRL|Qt::Key_Space),this);connect(fade,&QShortcut::activated,this,[this]{takeSelected(PlaylistController::ManualTake::Fade);});
        auto* saveKey=new QShortcut(QKeySequence::Save,this);connect(saveKey,&QShortcut::activated,this,[this]{saveProject(false);});
        auto* ticker=new QTimer(this);connect(ticker,&QTimer::timeout,this,[this]{refreshTransport();});ticker->start(200);
        if(demo_) { for(const auto& s : {"01 - Doors open.mp4","02 - Opening film.mov","03 - Speaker intro.mkv","04 - Sponsor loop.avi","05 - Closing credits.mov"}) {library_<<s;playlist_<<Cue{QString(s),0,150000,Transition::Dissolve,600,400,600};} folders_<<"Show media"<<"Sponsor assets"; }
        retranslate();
        if(demo_){playlistTable_->selectRow(2);syncEditor(2);}
    }
    void selectPage(int page){pages_->setCurrentIndex(page);if(navigation_->button(page))navigation_->button(page)->setChecked(true);}
    void setLanguage(const QString& lang){languageBox_->setCurrentIndex(lang=="pt-BR"?1:0);}
    void capture(const QString& path){
        retranslate();
        for(auto* widget:findChildren<QWidget*>())widget->repaint();
        repaint();
        QPixmap image(size()*devicePixelRatioF());image.setDevicePixelRatio(devicePixelRatioF());image.fill(Qt::transparent);
        render(&image,QPoint(),QRegion(),QWidget::DrawWindowBackground|QWidget::DrawChildren);
        image.save(path);
    }
    int runUiTests(const QString& directory,const QString& resultPath){
        QJsonArray tests;bool all=true;
        auto record=[&](const QString& name,bool ok){tests.append(QJsonObject{{"name",name},{"pass",ok}});all&=ok;};
        auto wait=[&](const std::function<bool()>& predicate,int limit=8000){QElapsedTimer clock;clock.start();while(!predicate()&&clock.elapsed()<limit){QCoreApplication::processEvents(QEventLoop::AllEvents,10);QThread::msleep(2);}QCoreApplication::processEvents();return predicate();};
        auto pump=[&](int ms){QElapsedTimer clock;clock.start();wait([&]{return clock.elapsed()>=ms;},ms+1000);};
        pump(100);
        record("main_editor_separation_and_default_300",pages_->currentIndex()==0 && navigation_->button(0)->text()=="MAIN" && pages_->widget(1)->isAncestorOf(inBox_) && !inBox_->isVisible() && manualFadeTime_->value()==300);
        const QString source=QDir(directory).absoluteFilePath("01-h264.mp4"),second=QDir(directory).absoluteFilePath("03-h264.mkv");
        addPaths({source,second});playlistTable_->selectRow(0);playlist_[0]=Cue{playlist_[0].path,0,2500,Transition::FadeBlack,700,900,0};syncEditor(0);cueRow(0);
        const bool ready=wait([&]{return canTake()&&!preview_.pending();});loopBox_->setChecked(true);int composed=programA_.composedFrames();cutButton_->click();
        const bool cut=wait([&]{return programA_.path()==playlist_[0].path && programA_.frames()>=4;});
        record("cut_button_bypasses_editor_transition",ready && cut && programA_.cue().enterMs==0 && programA_.cue().transition==Transition::Cut && programA_.composedFrames()==composed);
        const int previous=programA_.frames();selectPage(1);editorCueBox_->setCurrentIndex(1);
        const bool secondReady=wait([&]{return canTake()&&preview_.path()==playlist_[1].path;});pump(150);
        record("editor_preview_does_not_interrupt_program",secondReady && inBox_->isVisible() && programA_.playing() && programA_.frames()>previous);
        inBox_->setValue(.125);selectPage(0);composed=programA_.composedFrames();fadeButton_->click();
        const bool faded=wait([&]{return programA_.path()==playlist_[1].path && programA_.frames()>=5;});
        record("fade_button_300_uses_applied_cue",faded && programA_.cue().transitionMs==300 && programA_.cue().in==0 && playlist_[1].in==0 && programA_.composedFrames()>composed);
        selectPage(1);inBox_->setValue(.4);const auto liveCue=programA_.cue().json();const bool applied=applyEditor();
        record("applying_editor_preserves_live_snapshot",applied && playlist_[1].in==400 && programA_.cue().json()==liveCue);
        selectPage(0);targetBox_->setCurrentIndex(1);const int activeFrames=programA_.frames();cutButton_->click();
        const bool independent=wait([&]{return programB_.path()==playlist_[1].path && programB_.frames()>=4;});
        record("manual_cut_respects_destination_b",independent && programB_.cue().in==400 && programA_.playing() && programA_.frames()>activeFrames);
        manualFadeTime_->setValue(450);settings_->sync();QSettings persisted(settings_->fileName(),QSettings::IniFormat);
        record("manual_fade_duration_persisted",persisted.value("manualFadeMs").toInt()==450);
        selectPage(1);inBox_->setValue(.5);const auto programPath=programA_.path();setLanguage("pt-BR");pump(100);
        record("language_switch_preserves_draft_and_playback",inBox_->value()==.5 && editorStatus_->text()==tx("Unapplied changes") && programA_.path()==programPath && programA_.playing() && navigation_->button(0)->text()=="MAIN");
        controllerA_.stop();controllerB_.stop();preview_.black();
        QJsonObject result{{"result",all?"PASS":"FAIL"},{"version",QString(MizinVersion)},{"mode",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"scope","In-process native Qt widget actions and real synthetic media; not OS pointer interaction or physical display qualification"},{"tests",tests}};
        QFile out(resultPath);if(!out.open(QIODevice::WriteOnly))return 3;out.write(QJsonDocument(result).toJson());return all?0:2;
    }
    void importExternal(const QStringList& paths){for(const auto& p:paths){if(QFileInfo(p).isDir())scanFolder(p);else addPaths({p});}}
protected:
    void dragEnterEvent(QDragEnterEvent* event) override {if(event->mimeData()->hasUrls())event->acceptProposedAction();}
    void dropEvent(QDropEvent* event) override {QStringList paths;for(const auto& url:event->mimeData()->urls())if(url.isLocalFile())paths<<url.toLocalFile();importExternal(paths);event->acceptProposedAction();}
    void closeEvent(QCloseEvent* event) override {
        if(!demo_ && dirty_ && QMessageBox::question(this,tx("Unsaved show"),tx("Close without saving the show?"),QMessageBox::Yes|QMessageBox::No,QMessageBox::No)!=QMessageBox::Yes){event->ignore();return;}
        for(auto& output:outputWindows_)if(output)output->close();event->accept();
    }
private:
    QString tx(const QString& key)const{return dictionary_.value(key).toString(key);}
    void readDictionary(){QFile f(":/i18n/"+(language_=="pt-BR"?QString("pt-BR"):QString("en"))+".json");if(f.open(QIODevice::ReadOnly))dictionary_=QJsonDocument::fromJson(f.readAll()).object();}
    QLabel* label(const QString& key,const QString& style={}){auto* l=new QLabel(tx(key));if(!style.isEmpty())l->setObjectName(style);bindings_.append({l,key});return l;}
    QPushButton* button(const QString& key,const QString& style={}){auto* b=new QPushButton(tx(key));b->setMinimumHeight(34);if(!style.isEmpty())b->setObjectName(style);bindings_.append({b,key});return b;}
    QWidget* monitor(NativeChannel* channel,int sample){
        if(demo_)return new SamplePicture(sample);
        auto* video=new QVideoWidget;video->setMinimumHeight(150);video->setAspectRatioMode(Qt::KeepAspectRatio);connect(channel,&NativeChannel::frameReady,video,[video](const QVideoFrame& f){video->videoSink()->setVideoFrame(f);});return video;
    }
    QFrame* deckPanel(const QString& title,NativeChannel* channel,int sample,QLabel** name,QLabel** timing,const QString& style){
        auto* panel=new QFrame;panel->setObjectName("panel");auto* l=new QVBoxLayout(panel);l->setContentsMargins(14,12,14,12);l->setSpacing(9);
        auto* heading=label(title,"eyebrow");heading->setProperty("channel",style);l->addWidget(heading);l->addWidget(monitor(channel,sample),1);
        *name=new QLabel;(*name)->setObjectName("mediaTitle");l->addWidget(*name);
        auto* row=new QHBoxLayout;*timing=new QLabel("00:00:00");(*timing)->setObjectName("timecode");row->addWidget(*timing);row->addStretch();
        auto* play=button("Play / pause");row->addWidget(play);connect(play,&QPushButton::clicked,this,[channel]{channel->togglePause();});l->addLayout(row);return panel;
    }
    QWidget* mainPage(){
        auto* page=new QWidget;auto* layout=new QVBoxLayout(page);layout->setContentsMargins(0,0,0,0);layout->setSpacing(14);
        auto* deckRow=new QHBoxLayout;deckRow->setSpacing(14);
        deckRow->addWidget(deckPanel("PREVIEW",&preview_,0,&previewName_,&previewTime_,"preview"),1);
        deckRow->addWidget(deckPanel("PROGRAM A",&programA_,1,&programName_,&programTime_,"program"),1);
        auto* side=new QFrame;side->setObjectName("panel");side->setFixedWidth(246);auto* sl=new QVBoxLayout(side);sl->setContentsMargins(14,12,14,12);sl->setSpacing(10);
        sl->addWidget(label("PROGRAM B","eyebrow"));sl->addWidget(monitor(&programB_,0),1);secondaryName_=new QLabel;secondaryName_->setWordWrap(true);sl->addWidget(secondaryName_);secondaryTime_=new QLabel;secondaryTime_->setObjectName("timecode");sl->addWidget(secondaryTime_);
        auto* bp=button("Play / pause");sl->addWidget(bp);connect(bp,&QPushButton::clicked,this,[this]{programB_.togglePause();});
        deckRow->addWidget(side);layout->addLayout(deckRow,2);
        auto* transport=new QHBoxLayout;transport->addWidget(label("TAKE DESTINATION","eyebrow"));targetBox_=new QComboBox;targetBox_->addItems({"Program A","Program B"});transport->addWidget(targetBox_);
        cutButton_=button("CUT","cut");cutButton_->setToolTip("Ctrl+Enter");cutButton_->setMinimumHeight(44);cutButton_->setMinimumWidth(104);transport->addWidget(cutButton_);connect(cutButton_,&QPushButton::clicked,this,[this]{takeSelected(PlaylistController::ManualTake::Cut);});
        fadeButton_=button("FADE","take");fadeButton_->setToolTip("Ctrl+Space");fadeButton_->setMinimumHeight(44);fadeButton_->setMinimumWidth(104);transport->addWidget(fadeButton_);connect(fadeButton_,&QPushButton::clicked,this,[this]{takeSelected(PlaylistController::ManualTake::Fade);});
        transport->addWidget(label("Fade duration"));manualFadeTime_=new QSpinBox;manualFadeTime_->setRange(1,10000);manualFadeTime_->setSingleStep(50);manualFadeTime_->setSuffix(" ms");manualFadeTime_->setValue(qBound(1,settings_->value("manualFadeMs",300).toInt(),10000));manualFadeTime_->setMinimumWidth(105);transport->addWidget(manualFadeTime_);
        connect(manualFadeTime_,&QSpinBox::valueChanged,this,[this](int value){if(!demo_)settings_->setValue("manualFadeMs",value);});transport->addStretch();auto* black=button("Black selected channel");transport->addWidget(black);connect(black,&QPushButton::clicked,this,[this]{targetController()->stop();});
        auto* loop=new QCheckBox(tx("Loop selected channel"));loopBox_=loop;bindings_.append({loop,"Loop selected channel"});transport->addWidget(loop);
        connect(targetBox_,&QComboBox::currentIndexChanged,this,[this,loop]{const QSignalBlocker block(loop);loop->setChecked(targetChannel()->loop());});connect(loop,&QCheckBox::toggled,this,[this](bool value){targetChannel()->setLoop(value);});layout->addLayout(transport);
        auto* tools=new QHBoxLayout;tools->addWidget(label("RUNNING ORDER","eyebrow"));tools->addStretch();
        for(auto key:{"Add files","Add folder","Open show"}){auto* b=button(key);tools->addWidget(b);connect(b,&QPushButton::clicked,this,[this,key]{if(QString(key)=="Add files")chooseFiles();else if(QString(key)=="Add folder")chooseFolder();else openProject();});}
        sequentialBox_=new QCheckBox;bindings_.append({sequentialBox_,"Sequential"});tools->addWidget(sequentialBox_);
        repeatBox_=new QCheckBox;bindings_.append({repeatBox_,"Repeat order"});tools->addWidget(repeatBox_);
        connect(sequentialBox_,&QCheckBox::toggled,this,[this](bool value){targetController()->setSequential(value);if(value)loopBox_->setChecked(false);loopBox_->setEnabled(!value);repeatBox_->setEnabled(value);});
        connect(repeatBox_,&QCheckBox::toggled,this,[this](bool value){targetController()->setRepeat(value);});
        connect(targetBox_,&QComboBox::currentIndexChanged,this,[this]{QSignalBlocker a(sequentialBox_),b(repeatBox_);sequentialBox_->setChecked(targetController()->sequential());repeatBox_->setChecked(targetController()->repeat());repeatBox_->setEnabled(targetController()->sequential());loopBox_->setEnabled(!targetController()->sequential());});
        repeatBox_->setEnabled(false);
        layout->addLayout(tools);playlistTable_=makeTable();playlistTable_->setMinimumHeight(210);playlistTable_->setColumnWidth(2,200);playlistTable_->setColumnWidth(3,170);layout->addWidget(playlistTable_,2);connect(playlistTable_,&QTableWidget::itemSelectionChanged,this,[this]{syncEditor(playlistTable_->currentRow());});connect(playlistTable_,&QTableWidget::cellDoubleClicked,this,[this](int row,int){cueRow(row);});
        auto* bottom=new QHBoxLayout;bottom->addWidget(label("Double-click to cue. Drop files or folders anywhere.","muted"));bottom->addStretch();auto* cue=button("Cue selected");bottom->addWidget(cue);connect(cue,&QPushButton::clicked,this,[this]{cueRow(playlistTable_->currentRow());});
        auto* edit=button("Edit cue");bottom->addWidget(edit);connect(edit,&QPushButton::clicked,this,[this]{editSelected();});
        auto* up=button("Move up");bottom->addWidget(up);connect(up,&QPushButton::clicked,this,[this]{moveCue(-1);});auto* down=button("Move down");bottom->addWidget(down);connect(down,&QPushButton::clicked,this,[this]{moveCue(1);});
        auto* duplicate=button("Duplicate cue");bottom->addWidget(duplicate);connect(duplicate,&QPushButton::clicked,this,[this]{int row=playlistTable_->currentRow();if(row>=0){playlist_.insert(row+1,playlist_[row]);cuedRow_=-1;dirty_=true;refreshTables();playlistTable_->selectRow(row+1);}});
        auto* remove=button("Remove cue");bottom->addWidget(remove);connect(remove,&QPushButton::clicked,this,[this]{int row=playlistTable_->currentRow();if(row>=0){cuedRow_=-1;editing_=-1;playlist_.removeAt(row);dirty_=true;refreshTables();}});layout->addLayout(bottom);return page;
    }
    QTableWidget* makeTable(){auto* t=new QTableWidget(0,5);t->setSelectionBehavior(QAbstractItemView::SelectRows);t->setSelectionMode(QAbstractItemView::SingleSelection);t->setEditTriggers(QAbstractItemView::NoEditTriggers);t->setAlternatingRowColors(true);t->verticalHeader()->hide();t->setShowGrid(false);t->setAcceptDrops(false);t->horizontalHeader()->setStretchLastSection(true);t->horizontalHeader()->setSectionResizeMode(1,QHeaderView::Stretch);t->setColumnWidth(0,44);t->setColumnWidth(2,110);t->setColumnWidth(3,130);t->verticalHeader()->setDefaultSectionSize(42);return t;}
    QWidget* libraryPage(){auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(0,0,0,0);auto* heading=label("Media library","heading");l->addWidget(heading);l->addWidget(label("Original files stay in place. No mandatory conversion.","muted"));
        auto* row=new QHBoxLayout;auto* search=new QLineEdit;search->setPlaceholderText(tx("Search media"));bindings_.append({search,"Search media"});row->addWidget(search,1);auto* add=button("Add files");row->addWidget(add);connect(add,&QPushButton::clicked,this,[this]{chooseFiles();});auto* folder=button("Add folder");row->addWidget(folder);connect(folder,&QPushButton::clicked,this,[this]{chooseFolder();});l->addLayout(row);
        auto* main=new QHBoxLayout;auto* rootPanel=new QFrame;rootPanel->setObjectName("panel");rootPanel->setFixedWidth(230);auto* rootsLayout=new QVBoxLayout(rootPanel);rootsLayout->addWidget(label("FOLDERS","eyebrow"));roots_=new QListWidget;rootsLayout->addWidget(roots_);main->addWidget(rootPanel);libraryTable_=makeTable();main->addWidget(libraryTable_,1);l->addLayout(main,1);
        connect(search,&QLineEdit::textChanged,this,[this](const QString& q){for(int i=0;i<libraryTable_->rowCount();++i)libraryTable_->setRowHidden(i,!libraryTable_->item(i,1)->text().contains(q,Qt::CaseInsensitive));});
        connect(libraryTable_,&QTableWidget::cellDoubleClicked,this,[this](int row,int){if(row>=0&&!demo_)preview_.load(library_.value(row),false);});return page;}
    QString screenKey(QScreen* screen)const{return QString::number(reinterpret_cast<quintptr>(screen),16);}
    QScreen* selectedScreen(int index)const{const auto key=screenBoxes_[index]->currentData().toString();for(auto* screen:QGuiApplication::screens())if(screenKey(screen)==key)return screen;return nullptr;}
    void refreshScreens(){
        for(auto* box:screenBoxes_){const QSignalBlocker block(box);const auto selected=box->currentData().toString();box->clear();box->addItem(tx("Floating test window"),"floating");for(auto* screen:QGuiApplication::screens()){const auto pixels=displayPixels(screen->geometry().size(),screen->devicePixelRatio());box->addItem(QString("%1 · %2 × %3 · %4 Hz").arg(screen->name()).arg(pixels.width()).arg(pixels.height()).arg(screen->refreshRate(),0,'f',0),screenKey(screen));}const int old=box->findData(selected);box->setCurrentIndex(old>=0?old:0);}
        refreshOutputStatus();
    }
    void refreshOutputStatus(){
        for(int i=0;i<outputStatus_.size();++i){auto* channel=sourceBoxes_[i]->currentIndex()==0?&programA_:&programB_;QSize source=demo_?(i==2?QSize(1920,1080):QSize(3840,2160)):channel->lastFrame().size();QSize output(720,405);
            if(routeWindows_[i]){output=routeWindows_[i]->targetPixels();source=routeWindows_[i]->sourcePixels();}else if(auto* screen=selectedScreen(i))output=displayPixels(screen->geometry().size(),screen->devicePixelRatio());
            if(source.isEmpty()){outputStatus_[i]->setText(tx("No media loaded"));continue;}const auto fit=fittedPixels(source,output);const QString mode=fit==source?tx("1:1"):fit.width()<source.width()?tx("Downscale"):tx("Upscale");
            outputStatus_[i]->setText(tx("Source %1 → Output %2 · %3").arg(QString("%1 × %2").arg(source.width()).arg(source.height()),QString("%1 × %2").arg(output.width()).arg(output.height()),mode));
        }
    }
    QWidget* outputsPage(){auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(0,0,0,0);l->setSpacing(16);l->addWidget(label("Output routing","heading"));l->addWidget(label("Share one Program across screens, or send independent content.","muted"));
        for(int i=0;i<3;++i){auto* panel=new QFrame;panel->setObjectName("panel");auto* body=new QVBoxLayout(panel);body->setContentsMargins(20,18,20,18);auto* row=new QHBoxLayout;
            auto* number=new QLabel(QString("0%1").arg(i+1));number->setObjectName("routeNumber");row->addWidget(number);row->addSpacing(16);
            auto* col=new QVBoxLayout;col->addWidget(label("SOURCE","eyebrow"));auto* source=new QComboBox;source->addItems({"Program A","Program B"});source->setCurrentIndex(i==2?1:0);sourceBoxes_<<source;col->addWidget(source);row->addLayout(col,1);row->addSpacing(16);row->addWidget(new QLabel("→"));row->addSpacing(16);
            auto* dest=new QVBoxLayout;dest->addWidget(label("DISPLAY","eyebrow"));auto* screen=new QComboBox;screen->addItem(tx("Floating test window"),"floating");screenBoxes_<<screen;dest->addWidget(screen);row->addLayout(dest,2);
            auto* quality=new QVBoxLayout;quality->addWidget(label("SCALING","eyebrow"));auto* scaling=new QComboBox;scaling->addItem(tx("Native · performance"),"native");scaling->addItem(tx("Lanczos · quality (CPU)"),"lanczos");scaling->setCurrentIndex(settings_->value(QString("outputScaler%1").arg(i),"native").toString()=="lanczos"?1:0);scalingBoxes_<<scaling;quality->addWidget(scaling);row->addLayout(quality,1);
            connect(scaling,&QComboBox::currentIndexChanged,this,[this,scaling,i]{if(!demo_)settings_->setValue(QString("outputScaler%1").arg(i),scaling->currentData());});
            auto* open=button("Open output");row->addSpacing(12);row->addWidget(open);connect(open,&QPushButton::clicked,this,[this,i]{openOutput(i);});body->addLayout(row);auto* status=new QLabel;status->setObjectName("muted");outputStatus_<<status;body->addWidget(status);l->addWidget(panel);
        }
        for(auto key:{"Selected displays open fullscreen at their current resolution. Aspect ratio is preserved.","Native prioritizes performance. Lanczos uses CPU for higher-quality SDR scaling.","Changes apply when opening an output. Escape closes it; Programs keep running."}){auto* hint=label(key,"muted");hint->setWordWrap(true);l->addWidget(hint);}
        l->addWidget(label("Outputs using the same Program share decoded frames. Audio plays once per Program.","muted"));l->addStretch();return page;}
    QWidget* settingsPage(){auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(0,0,0,0);l->setSpacing(18);l->addWidget(label("Playback preferences","heading"));
        auto* p=new QFrame;p->setObjectName("panel");auto* pl=new QVBoxLayout(p);pl->setContentsMargins(24,24,24,24);pl->setSpacing(14);pl->addWidget(label("DECODING","eyebrow"));pl->addWidget(label("Native FFmpeg backend","mediaTitle"));auto* decode=new QComboBox;decodingBox_=decode;decode->addItem(tx("Automatic hardware selection"),"auto");decode->addItem(tx("CPU decoding"),"cpu");decode->setCurrentIndex(settings_->value("decode","auto").toString()=="cpu"?1:0);pl->addWidget(decode);connect(decode,&QComboBox::currentIndexChanged,this,[this,decode]{if(!demo_)settings_->setValue("decode",decode->currentData());footer_->setText(tx("Restart the application to apply decoding preferences."));});
        pl->addWidget(label("Hardware support depends on codec, profile, driver and GPU.","muted"));l->addWidget(p);
        auto* remote=new QFrame;remote->setObjectName("panel");auto* rl=new QVBoxLayout(remote);rl->setContentsMargins(24,24,24,24);rl->addWidget(label("REMOTE CONTROL","eyebrow"));rl->addWidget(label("Planned: authenticated operator and view-only monitor.","muted"));rl->addWidget(label("No network control service is started in this prototype.","muted"));l->addWidget(remote);
        l->addWidget(label("Prototype: trims, fades, sequential playback and independent Programs.","muted"));l->addWidget(label("Transitions currently use a shared CPU compositor. GPU composition, scheduling and remote access are future milestones.","muted"));l->addStretch();return page;}
    NativeChannel* targetChannel(){return targetBox_->currentIndex()==0?&programA_:&programB_;}
    PlaylistController* targetController(){return targetBox_->currentIndex()==0?&controllerA_:&controllerB_;}
    bool canTake()const{return cuedRow_>=0 && cuedRow_<playlist_.size() && cuedRow_==playlistTable_->currentRow() && !preview_.pending() && preview_.path()==playlist_[cuedRow_].path;}
    void takeSelected(PlaylistController::ManualTake mode){
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return;}
        if(pages_->currentIndex()!=0)return;
        if(!canTake()){footer_->setText(tx("Cue media before taking it to Program."));return;}
        targetController()->takeManual(playlist_,cuedRow_,mode,manualFadeTime_->value());
    }
    void cueRow(int row){if(row<0 || row>=playlist_.size())return;syncEditor(row);cuedRow_=row;if(!demo_)preview_.load(playlist_[row].path,false);refreshTransport();}
    void editSelected(){const int row=playlistTable_->currentRow();if(row>=0){if(cuedRow_!=row || preview_.path()!=playlist_[row].path)cueRow(row);else syncEditor(row);}selectPage(1);}
    QWidget* editorPage(){
        auto* page=new QWidget;auto* layout=new QVBoxLayout(page);layout->setContentsMargins(0,0,0,0);layout->setSpacing(16);
        layout->addWidget(label("Cue editor","heading"));layout->addWidget(label("Prepare trims and transitions here. Apply changes before returning to MAIN.","muted"));
        auto* choose=new QHBoxLayout;choose->addWidget(label("EDITING CUE","eyebrow"));editorCueBox_=new QComboBox;choose->addWidget(editorCueBox_,1);auto* back=button("Back to MAIN");choose->addWidget(back);connect(back,&QPushButton::clicked,this,[this]{selectPage(0);});layout->addLayout(choose);
        connect(editorCueBox_,&QComboBox::currentIndexChanged,this,[this](int row){if(syncingEditor_ || row<0)return;playlistTable_->selectRow(row);cueRow(row);});
        auto* body=new QHBoxLayout;auto* preview=new QWidget;auto* left=new QVBoxLayout(preview);left->setContentsMargins(0,0,0,0);left->setSpacing(12);
        left->addWidget(deckPanel("PREVIEW",&preview_,0,&editorName_,&editorTime_,"preview"),1);
        scrub_=new QSlider(Qt::Horizontal);scrub_->setRange(0,1000);left->addWidget(scrub_);connect(scrub_,&QSlider::sliderReleased,this,[this]{preview_.seek(qint64(double(scrub_->value())/1000*preview_.duration()));});
        auto* marks=new QHBoxLayout;auto* markIn=button("Mark In");auto* markOut=button("Mark Out");marks->addWidget(markIn);marks->addWidget(markOut);left->addLayout(marks);
        connect(markIn,&QPushButton::clicked,this,[this]{if(!matchingPreview())return;inBox_->setValue(double(preview_.position())/1000);applyEditor();});
        connect(markOut,&QPushButton::clicked,this,[this]{if(!matchingPreview())return;outBox_->setValue(double(preview_.position())/1000);applyEditor();});
        body->addWidget(preview,2);auto* fields=cueEditor();fields->setMinimumWidth(360);body->addWidget(fields,1);layout->addLayout(body,1);
        layout->addWidget(label("Preview stays muted. Editing does not interrupt either Program.","muted"));return page;
    }
    QDoubleSpinBox* secondsBox(double minimum,double maximum){auto* box=new QDoubleSpinBox;box->setDecimals(3);box->setRange(minimum,maximum);box->setSingleStep(.04);box->setSuffix(" s");box->setMinimumWidth(100);return box;}
    QWidget* cueEditor(){
        auto* panel=new QFrame;panel->setObjectName("panel");auto* layout=new QVBoxLayout(panel);layout->setContentsMargins(22,22,22,22);layout->setSpacing(18);
        layout->addWidget(label("CUE / IN & OUT","eyebrow"));auto* trim=new QFormLayout;trim->setSpacing(12);
        inBox_=secondsBox(0,604800);outBox_=secondsBox(-1,604800);outBox_->setSpecialValueText(tx("End of media"));trim->addRow(label("In"),inBox_);trim->addRow(label("Out"),outBox_);layout->addLayout(trim);
        layout->addWidget(label("SEQUENCE TRANSITION","eyebrow"));auto* transitions=new QFormLayout;transitions->setSpacing(12);
        transitionBox_=new QComboBox;transitionBox_->addItems({tx("Cut"),tx("Dissolve"),tx("Fade through black")});transitions->addRow(label("Transition"),transitionBox_);
        transitionTime_=secondsBox(0,10);transitionTime_->setValue(.3);transitions->addRow(label("Duration"),transitionTime_);
        enterBox_=secondsBox(0,10);exitBox_=secondsBox(0,10);transitions->addRow(label("Fade in"),enterBox_);transitions->addRow(label("Fade out"),exitBox_);layout->addLayout(transitions);
        auto* hint=label("MAIN CUT and FADE use their own manual transition. These settings apply to the sequence.","muted");hint->setWordWrap(true);layout->addWidget(hint);layout->addStretch();
        editorStatus_=new QLabel(tx(editorStatusKey_));editorStatus_->setObjectName("muted");editorStatus_->setWordWrap(true);layout->addWidget(editorStatus_);
        auto* apply=button("Apply cue","take");apply->setMinimumHeight(44);layout->addWidget(apply);connect(apply,&QPushButton::clicked,this,[this]{applyEditor();});
        auto* reset=button("Reset edits");layout->addWidget(reset);connect(reset,&QPushButton::clicked,this,[this]{syncEditor(editing_);});
        for(auto* spin:{inBox_,outBox_,transitionTime_,enterBox_,exitBox_})connect(spin,&QDoubleSpinBox::valueChanged,this,[this]{if(!syncingEditor_)setEditorStatus("Unapplied changes");});
        connect(transitionBox_,&QComboBox::currentIndexChanged,this,[this]{if(!syncingEditor_)setEditorStatus("Unapplied changes");});return panel;
    }
    void setEditorStatus(const QString& key){editorStatusKey_=key;if(editorStatus_)editorStatus_->setText(tx(key));}
    bool matchingPreview(){if(editing_>=0 && editing_<playlist_.size() && preview_.path()==playlist_[editing_].path && !preview_.pending())return true;footer_->setText(tx("Cue media before marking In or Out."));return false;}
    void syncEditor(int row){
        if(syncingEditor_ || row<0 || row>=playlist_.size() || !inBox_)return;
        QScopedValueRollback<bool> guard(syncingEditor_,true);editing_=row;if(editorCueBox_){QSignalBlocker block(editorCueBox_);editorCueBox_->setCurrentIndex(row);}const auto& c=playlist_[row];inBox_->setValue(double(c.in)/1000);outBox_->setValue(double(c.out)/1000);
        if(c.out<0)outBox_->setValue(-1);transitionBox_->setCurrentIndex(int(c.transition));transitionTime_->setValue(double(c.transitionMs)/1000);enterBox_->setValue(double(c.enterMs)/1000);exitBox_->setValue(double(c.exitMs)/1000);setEditorStatus("Cue settings loaded");refreshTransport();
    }
    bool applyEditor(){
        if(editing_<0 || editing_>=playlist_.size())return false;
        Cue c=playlist_[editing_];c.in=qRound64(inBox_->value()*1000);c.out=outBox_->value()<0?-1:qRound64(outBox_->value()*1000);
        c.transition=Transition(transitionBox_->currentIndex());c.transitionMs=qRound(transitionTime_->value()*1000);c.enterMs=qRound(enterBox_->value()*1000);c.exitMs=qRound(exitBox_->value()*1000);
        auto error=c.error(preview_.path()==c.path?preview_.duration():0);
        if(!error.isEmpty()){footer_->setText(tx("Invalid cue")+": "+tx(error));return false;}
        playlist_[editing_]=c;dirty_=true;refreshTables();setEditorStatus("Cue applied");footer_->setText(tx("Cue saved. Changes apply on the next TAKE."));return true;
    }
    void moveCue(int delta){int from=playlistTable_->currentRow(),to=from+delta;if(from<0||to<0||to>=playlist_.size())return;playlist_.move(from,to);cuedRow_=-1;dirty_=true;refreshTables();playlistTable_->selectRow(to);}
    void chooseFiles(){const auto paths=QFileDialog::getOpenFileNames(this,tx("Add media"),{},tx("Media files")+" (*.mp4 *.mkv *.mov *.avi *.webm *.mxf *.ts *.m4v *.mpg *.mpeg *.wmv *.wav *.mp3 *.flac *.aiff);;"+tx("All files")+" (*)");addPaths(paths);}
    void chooseFolder(){const auto path=QFileDialog::getExistingDirectory(this,tx("Add folder"));if(!path.isEmpty())scanFolder(path);}
    void scanFolder(const QString& path){if(demo_)return;if(scanner_.isRunning()){footer_->setText(tx("A folder scan is already running."));return;}if(!folders_.contains(path))folders_<<path;footer_->setText(tx("Scanning folder in background…"));scanner_.setFuture(QtConcurrent::run([path]{QStringList found;QDirIterator it(path,QDir::Files,QDirIterator::Subdirectories);const QStringList extensions{"mp4","mkv","mov","avi","webm","mxf","ts","m4v","mpg","mpeg","wmv","wav","mp3","flac","aiff","aac","ogg"};while(it.hasNext()){auto p=it.next();if(extensions.contains(QFileInfo(p).suffix().toLower()))found<<p;}found.sort(Qt::CaseInsensitive);return found;}));}
    void addPaths(const QStringList& paths){if(demo_)return;for(const auto& path:paths){const auto canonical=QFileInfo(path).canonicalFilePath();if(canonical.isEmpty()||!QFileInfo(canonical).isFile()||library_.contains(canonical,Qt::CaseInsensitive))continue;library_<<canonical;playlist_<<Cue{canonical};dirty_=true;}refreshTables();}
    void populate(QTableWidget* table,const QStringList& paths){int current=table->currentRow();table->setRowCount(paths.size());table->setHorizontalHeaderLabels({"#",tx("Media"),tx("Container"),tx("Availability"),tx("Location")});for(int i=0;i<paths.size();++i){const QFileInfo info(paths[i]);const QString state=demo_?tx("Sample"):info.exists()?tx("Available"):tx("Offline");const QStringList values{QString::number(i+1).rightJustified(2,'0'),info.fileName(),info.suffix().toUpper(),state,demo_?QString("Show media / ")+info.fileName():info.absolutePath()};for(int c=0;c<5;++c){auto* item=new QTableWidgetItem(values[c]);if(c==3)item->setForeground(demo_||info.exists()?QColor("#84c6a4"):QColor("#ff9478"));table->setItem(i,c,item);}}if(current>=0&&current<paths.size())table->selectRow(current);}
    void refreshTables(){QStringList paths;for(const auto& c:playlist_)paths<<c.path;{QSignalBlocker block(playlistTable_);populate(playlistTable_,paths);playlistTable_->setHorizontalHeaderLabels({"#",tx("Media"),tx("In / Out"),tx("Transition"),tx("Location")});for(int i=0;i<playlist_.size();++i){const auto& c=playlist_[i];playlistTable_->item(i,2)->setText(clockText(c.in)+" / "+(c.out<0?tx("End"):clockText(c.out)));playlistTable_->item(i,2)->setToolTip(QString::number(c.in)+" / "+QString::number(c.out)+" ms");playlistTable_->item(i,3)->setText(tx(c.transition==Transition::Cut?"Cut":c.transition==Transition::Dissolve?"Dissolve":"Fade through black"));}}if(editorCueBox_){QSignalBlocker block(editorCueBox_);editorCueBox_->clear();for(int i=0;i<playlist_.size();++i)editorCueBox_->addItem(QString("%1 · %2").arg(i+1,2,10,QChar('0')).arg(QFileInfo(playlist_[i].path).fileName()));editorCueBox_->setCurrentIndex(editing_>=0&&editing_<playlist_.size()?editing_:-1);}populate(libraryTable_,library_);roots_->clear();for(const auto& folder:folders_){auto* item=new QListWidgetItem(QFileInfo(folder).fileName(),roots_);item->setToolTip(folder);}}
    void refreshTransport(){
        refreshOutputStatus();
        if(cutButton_){cutButton_->setEnabled(demo_||canTake());fadeButton_->setEnabled(demo_||canTake());}
        if(editorName_){editorName_->setText(demo_?"03 - Speaker intro.mkv":preview_.path().isEmpty()?tx("No media loaded"):QFileInfo(preview_.path()).fileName());editorTime_->setText(clockText(preview_.position())+QString(".%1").arg(preview_.position()%1000,3,10,QChar('0')));}
        if(demo_){previewName_->setText("03 - Speaker intro.mkv");programName_->setText("02 - Opening film.mov");secondaryName_->setText("04 - Sponsor loop.avi");previewTime_->setText("00:00:00");programTime_->setText("00:01:24");secondaryTime_->setText("00:00:18");return;}
        auto name=[this](NativeChannel& c){return c.pending()?tx("Preparing media…"):c.path().isEmpty()?tx("No media loaded"):QFileInfo(c.path()).fileName();};
        if(scrub_&&!scrub_->isSliderDown()&&preview_.duration()>0)scrub_->setValue(int(1000.0*preview_.position()/preview_.duration()));
        previewName_->setText(name(preview_));programName_->setText(name(programA_));secondaryName_->setText(name(programB_));previewTime_->setText(clockText(preview_.position()));programTime_->setText(clockText(qMax<qint64>(0,programA_.rangeEnd()-programA_.position())));secondaryTime_->setText(clockText(qMax<qint64>(0,programB_.rangeEnd()-programB_.position())));
    }
    void retranslate(){if(editorStatus_)editorStatus_->setText(tx(editorStatusKey_));for(auto* scaling:scalingBoxes_){scaling->setItemText(0,tx("Native · performance"));scaling->setItemText(1,tx("Lanczos · quality (CPU)"));}for(const auto& b:bindings_){if(!b.widget)continue;if(auto* l=qobject_cast<QLabel*>(b.widget.data()))l->setText(tx(b.key));else if(auto* p=qobject_cast<QPushButton*>(b.widget.data()))p->setText(tx(b.key));else if(auto* c=qobject_cast<QCheckBox*>(b.widget.data()))c->setText(tx(b.key));else if(auto* e=qobject_cast<QLineEdit*>(b.widget.data()))e->setPlaceholderText(tx(b.key));}if(decodingBox_){decodingBox_->setItemText(0,tx("Automatic hardware selection"));decodingBox_->setItemText(1,tx("CPU decoding"));}if(transitionBox_){for(auto* spin:{inBox_,outBox_,transitionTime_,enterBox_,exitBox_})spin->setLocale(QLocale(language_=="pt-BR"?"pt_BR":"en_US"));transitionBox_->setItemText(0,tx("Cut"));transitionBox_->setItemText(1,tx("Dissolve"));transitionBox_->setItemText(2,tx("Fade through black"));outBox_->setSpecialValueText(tx("End of media"));}showTitle_->setText(demo_?"Opening Night / "+tx("Sample show"):projectPath_.isEmpty()?tx("Untitled show"):QFileInfo(projectPath_).completeBaseName());for(auto* screen:screenBoxes_)screen->setItemText(0,tx("Floating test window"));targetBox_->setItemText(0,tx("Program A"));targetBox_->setItemText(1,tx("Program B"));for(auto* source:sourceBoxes_){source->setItemText(0,tx("Program A"));source->setItemText(1,tx("Program B"));}footer_->setText(demo_?tx("Layout preview — sample content"):tx("Native playback · EN / PT-BR · No mandatory conversion"));refreshTables();refreshTransport();}
    void openOutput(int index){
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return;}
        auto* screen=selectedScreen(index);if(screenBoxes_[index]->currentData().toString()!="floating" && !screen){footer_->setText(tx("Selected display is unavailable"));return;}
        if(routeWindows_[index])routeWindows_[index]->close();auto* channel=sourceBoxes_[index]->currentIndex()==0?&programA_:&programB_;
        auto* window=new OutputWindow(channel,&outputRouter_,scalingBoxes_[index]->currentData().toString()=="lanczos");window->setWindowTitle(QString("Mizin Playout — Output %1").arg(index+1));connect(window,&OutputWindow::warning,this,[this](const QString& text){footer_->setText(tx(text));});routeWindows_[index]=window;outputWindows_<<window;window->openOn(screen);
    }
    void saveProject(bool){if(demo_)return;QString path=projectPath_;if(path.isEmpty())path=QFileDialog::getSaveFileName(this,tx("Save show"),{},"Mizin show (*.mizinshow)");if(path.isEmpty())return;if(!path.endsWith(".mizinshow",Qt::CaseInsensitive))path+=".mizinshow";QJsonObject root=Show{library_,folders_,playlist_}.json();QSaveFile f(path);if(!f.open(QIODevice::WriteOnly)||f.write(QJsonDocument(root).toJson())<0||!f.commit()){footer_->setText(tx("Could not save show"));return;}projectPath_=path;dirty_=false;showTitle_->setText(QFileInfo(path).completeBaseName());footer_->setText(tx("Show saved"));}
    void openProject(){if(demo_)return;if(dirty_&&QMessageBox::question(this,tx("Unsaved show"),tx("Open another show without saving?"),QMessageBox::Yes|QMessageBox::No,QMessageBox::No)!=QMessageBox::Yes)return;const auto path=QFileDialog::getOpenFileName(this,tx("Open show"),{},"Mizin show (*.mizinshow)");if(path.isEmpty())return;QFile f(path);if(!f.open(QIODevice::ReadOnly)){footer_->setText(tx("Could not open show"));return;}QJsonParseError error;auto doc=QJsonDocument::fromJson(f.readAll(),&error);auto obj=doc.object();Show loaded;if(error.error!=QJsonParseError::NoError || !Show::read(obj,loaded)){footer_->setText(tx("Invalid show file"));return;}library_=loaded.library;playlist_=loaded.cues;folders_=loaded.folders;editing_=cuedRow_=-1;projectPath_=path;dirty_=false;refreshTables();showTitle_->setText(QFileInfo(path).completeBaseName());}
    void helpDialog(){QDialog dialog(this);dialog.setWindowTitle(tx("Quick start"));dialog.resize(700,540);auto* l=new QVBoxLayout(&dialog);auto* browser=new QTextBrowser;browser->setOpenExternalLinks(false);browser->setMarkdown(tx("HELP_MARKDOWN"));l->addWidget(browser);auto* close=button("Close");l->addWidget(close);connect(close,&QPushButton::clicked,&dialog,&QDialog::accept);dialog.exec();}
};

static const char* style=R"(
QWidget { background:#11161e; color:#e4e9f1; font-family:'Segoe UI'; font-size:13px; }
QFrame#rail {background:#0c1118;border-right:1px solid #242d39;}
QLabel#brand {font-size:24px;font-weight:700;letter-spacing:5px;color:#e8f3f7;}
QLabel#heading {font-size:23px;font-weight:600;}
QLabel#eyebrow {font-size:10px;font-weight:600;letter-spacing:1.4px;color:#99a6b8;}
QLabel[channel='preview'] {color:#83c7df;} QLabel[channel='program'] {color:#f0ad87;}
QLabel#muted,QLabel#footer {color:#91a0b5;font-size:12px;} QLabel#footer {padding-top:7px;border-top:1px solid #25303c;}
QLabel#mediaTitle {font-size:14px;font-weight:600;} QLabel#timecode {font-family:'Consolas';font-size:22px;color:#dbe5ef;}
QLabel#routeNumber {font-family:'Consolas';font-size:34px;color:#77c7d8;}
QFrame#panel {background:#171e28;border:1px solid #2a3544;border-radius:7px;}
QFrame#panel QLabel,QFrame#panel QCheckBox {background:transparent;}
QPushButton {background:#202b39;border:1px solid #344355;border-radius:4px;padding:5px 13px;}
QPushButton:hover {background:#2c3b4d;border-color:#638498;} QPushButton:focus {border:1px solid #a4dce8;}
QPushButton:disabled {color:#5d6b7c;} QPushButton#cut {background:#e9b88b;color:#271d17;font-weight:700;border:none;font-size:15px;} QPushButton#take {background:#98d6de;color:#10232c;font-weight:700;border:none;font-size:15px;}
QPushButton#navigation {text-align:left;background:transparent;border:none;padding:12px;color:#9facc0;}
QPushButton#navigation:checked {color:#ddf5fa;background:#21333e;border-left:3px solid #91d2e2;}
QComboBox,QLineEdit,QDoubleSpinBox,QSpinBox {background:#101823;border:1px solid #344355;border-radius:4px;padding:8px;min-height:18px;selection-background-color:#385d71;}
QCheckBox::indicator {width:14px;height:14px;border:1px solid #52677f;border-radius:2px;background:#101823;}
QCheckBox::indicator:checked {background:#98d6de;border-color:#b5e6eb;}
QCheckBox::indicator:disabled {border-color:#293746;background:#17202a;}
QSlider::groove:horizontal {height:4px;background:#304457;border-radius:2px;} QSlider::handle:horizontal {background:#98d6de;width:12px;margin:-5px 0;border-radius:5px;}
QComboBox QAbstractItemView {background:#182536;selection-background-color:#385d71;}
QTableWidget {background:#131a24;alternate-background-color:#18212d;border:1px solid #283545;border-radius:5px;selection-background-color:#263f50;selection-color:#e4f3f8;}
QTableWidget::item {padding:8px;border-bottom:1px solid #222e3c;} QHeaderView::section {background:#1c2735;color:#97a8bd;border:none;padding:11px;text-align:left;}
QListWidget {background:transparent;border:none;} QListWidget::item {padding:12px 2px;} QTextBrowser {background:#151f2b;border:1px solid #334155;padding:20px;font-size:14px;}
QScrollBar:vertical {background:#141e29;width:10px;} QScrollBar::handle:vertical {background:#3d4c60;min-height:20px;border-radius:4px;}
)";

int main(int argc,char** argv){
    if(qEnvironmentVariableIsSet("MIZIN_LOG_PATH"))qInstallMessageHandler([](QtMsgType,const QMessageLogContext& context,const QString& message){
        static QMutex mutex;QMutexLocker lock(&mutex);QFile log(qEnvironmentVariable("MIZIN_LOG_PATH"));
        if(log.open(QIODevice::Append|QIODevice::Text)){QTextStream out(&log);out<<context.category<<": "<<message<<Qt::endl;}
    });
    qputenv("QT_MEDIA_BACKEND","ffmpeg");
    // Version-pinned private Qt backend configuration, applied before Qt startup.
    const QStringList raw=[&]{QStringList r;for(int i=1;i<argc;++i)r<<QString::fromLocal8Bit(argv[i]);return r;}();
    if(raw.contains("--cpu")){qputenv("QT_FFMPEG_DECODING_HW_DEVICE_TYPES",",");qputenv("MIZIN_DECODE_MODE","cpu");}
    QApplication app(argc,argv);QCoreApplication::setApplicationName("Mizin Playout");QCoreApplication::setOrganizationName("Mizin");app.setStyle("Fusion");app.setStyleSheet(style);
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOption(QCommandLineOption(QStringLiteral("board"),QStringLiteral("Show sample content for layout review")));
    parser.addOption(QCommandLineOption(QStringLiteral("lang"),QStringLiteral("UI language"),QStringLiteral("locale")));
    parser.addOption(QCommandLineOption(QStringLiteral("capture-dir"),QStringLiteral("Export one native layout board and exit"),QStringLiteral("directory")));
    parser.addOption(QCommandLineOption(QStringLiteral("capture-page"),QStringLiteral("Layout page: 0 MAIN, 1 EDIT, 2 library, 3 outputs"),QStringLiteral("page"),QStringLiteral("0")));
    parser.addOption(QCommandLineOption(QStringLiteral("state-dir"),QStringLiteral("Portable settings directory"),QStringLiteral("directory")));
    parser.addOption(QCommandLineOption(QStringLiteral("cpu"),QStringLiteral("Force software decoding")));
    parser.addOption(QCommandLineOption(QStringLiteral("output-test"),QStringLiteral("Test native output scaling and fullscreen geometry")));
    parser.addOption(QCommandLineOption(QStringLiteral("ui-test"),QStringLiteral("Test native MAIN/EDIT controls with fixture media")));
    parser.addOption(QCommandLineOption(QStringLiteral("transport-test"),QStringLiteral("Test trims, transitions and playlist modes")));
    parser.addOption(QCommandLineOption(QStringLiteral("smoke-test"),QStringLiteral("Decode fixture suite and exit")));
    parser.addOption(QCommandLineOption(QStringLiteral("fixtures"),QStringLiteral("Fixture directory"),QStringLiteral("directory")));
    parser.addOption(QCommandLineOption(QStringLiteral("result"),QStringLiteral("Smoke result JSON"),QStringLiteral("path")));
    parser.addPositionalArgument("media","Local media paths","[media...]");
    parser.process(app);
    if(parser.isSet("output-test"))return runOutputTests(parser.value("fixtures"),parser.value("result"));
    if(parser.isSet("transport-test"))return runTransportTests(parser.value("fixtures"),parser.value("result"));
    if(parser.isSet("smoke-test"))return runSmoke(parser.value("fixtures"),parser.value("result"));
    const QString state=parser.isSet("state-dir")?parser.value("state-dir"):QCoreApplication::applicationDirPath()+"/state";
    QSettings decodeSettings(state+"/preferences.ini",QSettings::IniFormat);if(decodeSettings.value("decode","auto").toString()=="cpu"){qputenv("QT_FFMPEG_DECODING_HW_DEVICE_TYPES",",");qputenv("MIZIN_DECODE_MODE","cpu");}
    MainWindow window(parser.isSet("board"),parser.value("lang"),state);window.show();if(parser.isSet("ui-test"))return window.runUiTests(parser.value("fixtures"),parser.value("result"));window.importExternal(parser.positionalArguments());
    if(parser.isSet("capture-dir")){
        const QString dir=parser.value("capture-dir");QDir().mkpath(dir);
        const int page=qBound(0,parser.value("capture-page").toInt(),3);window.selectPage(page);
        const bool portuguese=parser.value("lang")=="pt-BR";
        const QString name=page==3?"02-outputs-en.png":page==2?"03-library-en.png":page==1?(portuguese?"06-edit-pt-BR.png":"05-edit-en.png"):portuguese?"04-main-pt-BR.png":"01-main-en.png";
        QTimer::singleShot(900,&window,[&window,dir,name]{window.capture(dir+"/"+name);QCoreApplication::quit();});
    }
    return app.exec();
}
