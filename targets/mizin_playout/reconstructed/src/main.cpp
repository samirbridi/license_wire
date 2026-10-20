#include "channel.hpp"
#include "playlist.hpp"
#include "output.hpp"
#include "routing_panels.hpp"
#include "smoke.hpp"
#include "version.hpp"
#include "operator_widgets.hpp"
#include "readiness.hpp"
#include "diagnostics_panel.hpp"
#include "program_runtime.hpp"
#include "brand.hpp"
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
    explicit SamplePicture(int s, QWidget* parent=nullptr) : QWidget(parent), scene(s) {}
    void paintEvent(QPaintEvent*) override {
        QPainter p(this);p.setRenderHint(QPainter::Antialiasing);p.scale(width()/960.0,height()/540.0);
        const QColor accent=scene==1?QColor("#efad60"):scene==2?QColor("#a480ee"):QColor("#46a9e2");
        QLinearGradient bg(0,0,0,540);bg.setColorAt(0,QColor("#030b15"));bg.setColorAt(.75,accent.darker(500));bg.setColorAt(1,QColor("#02060d"));p.fillRect(QRect(0,0,960,540),bg);
        p.setPen(QPen(QColor("#31465a"),3));for(int y:{38,58})p.drawLine(55,y,905,y);
        for(int x=55;x<905;x+=42){p.drawLine(x,38,x+42,58);p.drawLine(x,58,x+42,38);}
        p.fillRect(QRect(55,62,14,352),QColor("#182735"));p.fillRect(QRect(891,62,14,352),QColor("#182735"));
        QLinearGradient screen(240,160,720,365);screen.setColorAt(0,accent.darker(250));screen.setColorAt(.55,accent.darker(120));screen.setColorAt(1,accent.darker(350));p.fillRect(QRect(236,157,488,220),screen);
        p.setClipRect(QRect(236,157,488,220));p.setPen(QPen(QColor(accent.red(),accent.green(),accent.blue(),100),3));
        for(int i=-10;i<22;++i){QPainterPath wave;wave.moveTo(190+i*38,155);wave.cubicTo(350+i*26,210,240+i*30,300,420+i*24,390);p.drawPath(wave);}p.setClipping(false);
        p.setCompositionMode(QPainter::CompositionMode_Screen);
        for(int i=0;i<8;++i){const qreal x=100+i*108;QLinearGradient beam(x,72,x,430);QColor lit=accent;lit.setAlpha(88);beam.setColorAt(0,lit);lit.setAlpha(0);beam.setColorAt(1,lit);p.setPen(Qt::NoPen);p.setBrush(beam);p.drawPolygon(QPolygonF{QPointF(x-4,72),QPointF(x+4,72),QPointF(x+(i%2?100:5),430),QPointF(x-(i%2?5:100),430)});p.setBrush(accent.lighter(155));p.drawEllipse(QPointF(x,75),5,3);}
        p.setCompositionMode(QPainter::CompositionMode_SourceOver);p.fillRect(QRect(95,403,770,12),accent.darker(280));p.fillRect(QRect(82,415,796,12),QColor("#07101b"));
        p.setPen(Qt::NoPen);p.setBrush(QColor("#030812"));for(int i=0;i<36;++i){const int x=i*29-12,y=448+(i*17%35),r=9+i%4;p.drawEllipse(QPoint(x,y),r,r+2);p.drawRoundedRect(QRect(x-r-3,y+r,2*r+6,85),7,7);}
        p.setFont(QFont("Segoe UI",12,QFont::DemiBold));p.setPen(QColor("#a7b6c9"));p.drawText(18,520,"LAYOUT SAMPLE");
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
    QLabel* secondaryName_=nullptr;
    QLabel* previewTime_;
    QLabel* programTime_;
    QLabel* secondaryTime_=nullptr;
    QLabel* footer_;
    QLabel* showTitle_;
    QStringList library_, folders_;
    QList<Cue> playlist_;
    int editing_=-1, cuedRow_=-1;
    QLabel *editorName_=nullptr,*editorTime_=nullptr,*editorStatus_=nullptr;
    QComboBox* editorCueBox_=nullptr;
    QString editorStatusKey_="Select a cue to edit.";
    QPushButton *cutButton_=nullptr,*fadeButton_=nullptr;
    QPushButton *manualMode_=nullptr,*sequentialMode_=nullptr,*copyPlaylist_=nullptr;
    int programCount_=1,displayCount_=1,selectedProgram_=0,nextProgramId_=2,scanProgramId_=1;
    QList<ProgramDefinition> programDefinitions_{{1,"Program A",{}}};
    std::vector<std::unique_ptr<ProgramRuntime>> extraPrograms_;
    QHBoxLayout* deckRow_=nullptr;
    QVBoxLayout *routeLayout_=nullptr,*audioLayout_=nullptr,*digitalLayout_=nullptr,*secondaryMeterLayout_=nullptr;
    QLabel* playlistHeading_=nullptr;
    QPushButton* routesSummary_=nullptr;
    QFrame* secondaryDeck_=nullptr;
    QWidget* secondaryMeter_=nullptr;
    QPushButton *addProgram_=nullptr,*toggleProgram_=nullptr,*addDisplay_=nullptr,*removeDisplay_=nullptr;
    QLabel* outputConfigurationLabel_=nullptr;
    QList<QWidget*> routePanels_;
    std::array<QPushButton*,3> deckPlay_{};
    std::array<QLabel*,3> deckState_{};
    std::array<QProgressBar*,3> deckProgress_{};

    std::array<QPushButton*,2> networkSummary_{};
    std::array<StereoMeter*,2> mainMeters_{};
    QList<int> routePrograms_;
    QString runningMarkKey_;
    QSpinBox* manualFadeTime_=nullptr;
    QSlider* scrub_=nullptr;
    QDoubleSpinBox *inBox_=nullptr,*outBox_=nullptr,*transitionTime_=nullptr,*enterBox_=nullptr,*exitBox_=nullptr;
    QComboBox* transitionBox_=nullptr;
    QCheckBox *sequentialBox_=nullptr,*repeatBox_=nullptr,*loopBox_=nullptr;
    bool syncingEditor_=false;
    QString projectPath_;
    NativeChannel preview_{true, this}, programA_{false,this};
    CueReadiness readiness_{&preview_,this};
    PlaylistController controllerA_{&programA_,this};
    NetworkBus networkA_{&programA_,this};
    QList<AudioPanel*> audioPanels_;
    QList<DigitalPanel*> digitalPanels_;
    QTabWidget* outputsTabs_=nullptr;
    QTabWidget* settingsTabs_=nullptr;
    DiagnosticsPanel* diagnosticsPanel_=nullptr;
    std::unique_ptr<QSettings> settings_;
    QList<QPointer<QWidget>> outputWindows_;
    QList<QComboBox*> sourceBoxes_, screenBoxes_,scalingBoxes_;
    QList<QLabel*> outputStatus_;
    QList<QPointer<OutputWindow>> routeWindows_;
    OutputRouter outputRouter_{this};
    QFutureWatcher<QStringList> scanner_;
    QButtonGroup* navigation_ = nullptr;
    QComboBox* decodingBox_ = nullptr;
    bool dirty_ = false;
public:
    MainWindow(bool demo, const QString& language, const QString& stateDir) : demo_(demo), language_(language) {
        QDir().mkpath(stateDir);
        settings_ = std::make_unique<QSettings>(stateDir+"/preferences.ini",QSettings::IniFormat);
        nextProgramId_=qBound(2,settings_->value("nextProgramId",2).toInt(),1000001);
        if(language_.isEmpty()) language_=settings_->value("language","en").toString();
        readDictionary();
        setWindowTitle("Mizin Playout — " + QString(MizinVersion)); resize(1600,1000);setMinimumSize(1280,800);setAcceptDrops(true);
        auto* shell = new QWidget; auto* outer = new QHBoxLayout(shell); outer->setContentsMargins(0,0,0,0);outer->setSpacing(0);
        auto* rail = new QFrame; rail->setObjectName("rail");rail->setFixedWidth(158);auto* nav = new QVBoxLayout(rail);nav->setContentsMargins(14,22,14,16);nav->setSpacing(9);
        auto* brandRow=new QHBoxLayout;brandRow->setSpacing(6);brandRow->addWidget(new BrandMark);auto* brand = new QLabel("MIZIN");brand->setObjectName("brand");brandRow->addWidget(brand,1);nav->addLayout(brandRow);setWindowIcon(brandIcon());nav->addWidget(label("PLAYOUT", "eyebrow"));nav->addSpacing(20);
        pages_ = new QStackedWidget;
        const QStringList pageNames{"MAIN","EDIT","Library","Outputs","Audio","Settings"};
        auto* group = new QButtonGroup(this);navigation_=group;group->setExclusive(true);
        const std::array<DeskIcon,6> navIcons{DeskIcon::Main,DeskIcon::Edit,DeskIcon::Folder,DeskIcon::Display,DeskIcon::Audio,DeskIcon::Settings};
        for(int i=0;i<pageNames.size();++i) {
            auto* b=button(pageNames[i]);b->setObjectName("navigation");b->setCheckable(true);group->addButton(b,i);nav->addWidget(b);
            b->setIcon(deskIcon(navIcons[i]));b->setIconSize(QSize(21,21));connect(b,&QPushButton::clicked,this,[this,i]{selectPage(i);});if(i==0)b->setChecked(true);
        }
        nav->addStretch();auto* help=button("Quick start  ·  F1");nav->addWidget(help);connect(help,&QPushButton::clicked,this,[this]{helpDialog();});
        nav->addWidget(label(demo_ ? "DESIGN PREVIEW" : "DEVELOPMENT", "eyebrow"));
        auto* content = new QWidget;auto* contentLayout = new QVBoxLayout(content);contentLayout->setContentsMargins(18,16,18,10);contentLayout->setSpacing(12);
        auto* top = new QHBoxLayout;showTitle_=new ElidedLabel;showTitle_->setObjectName("heading");top->addWidget(showTitle_,1);
        languageBox_=new QComboBox;languageBox_->addItem("English","en");languageBox_->addItem("Português (Brasil)","pt-BR");languageBox_->setCurrentIndex(language_=="pt-BR"?1:0);top->addWidget(languageBox_);
        auto* open=button("Open show");open->setIcon(deskIcon(DeskIcon::Folder));top->addWidget(open);connect(open,&QPushButton::clicked,this,[this]{openProject();});
        auto* save=button("Save show");save->setIcon(deskIcon(DeskIcon::Save));top->addWidget(save);connect(save,&QPushButton::clicked,this,[this]{saveProject(false);});
        contentLayout->addLayout(top);contentLayout->addWidget(pages_,1);
        footer_=new QLabel;footer_->setObjectName("footer");contentLayout->addWidget(footer_);
        outer->addWidget(rail);outer->addWidget(content,1);setCentralWidget(shell);
        pages_->addWidget(mainPage());pages_->addWidget(scrollPage(editorPage()));pages_->addWidget(scrollPage(libraryPage()));pages_->addWidget(scrollPage(outputsPage()));pages_->addWidget(scrollPage(audioPage()));pages_->addWidget(scrollPage(settingsPage()));
        refreshScreens();
        auto watchScreen=[this](QScreen* screen){connect(screen,&QScreen::geometryChanged,this,[this]{refreshScreens();});connect(screen,&QScreen::logicalDotsPerInchChanged,this,[this]{refreshScreens();});};
        for(auto* screen:QGuiApplication::screens())watchScreen(screen);
        connect(qGuiApp,&QGuiApplication::screenAdded,this,[this,watchScreen](QScreen* screen){watchScreen(screen);refreshScreens();});
        connect(qGuiApp,&QGuiApplication::screenRemoved,this,[this]{refreshScreens();});
        connect(languageBox_,&QComboBox::currentIndexChanged,this,[this]{language_=languageBox_->currentData().toString();readDictionary();retranslate();if(!demo_)settings_->setValue("language",language_);});
        watchProgram(0);
        connect(&preview_,&NativeChannel::changed,this,[this]{refreshTransport();});
        connect(&preview_,&NativeChannel::failed,this,[this](const QString& error){footer_->setText(tx("Media error")+": "+error);});
        connect(&readiness_,&CueReadiness::changed,this,[this]{refreshTransport();});
        connect(&scanner_,&QFutureWatcher<QStringList>::finished,this,[this]{addPaths(scanner_.result(),programIndexById(scanProgramId_));footer_->setText(tx("Folder scan complete"));});
        auto* f1=new QShortcut(QKeySequence(Qt::Key_F1),this);connect(f1,&QShortcut::activated,this,[this]{helpDialog();});
        auto* take=new QShortcut(QKeySequence(Qt::CTRL|Qt::Key_Return),this);connect(take,&QShortcut::activated,this,[this]{takeSelected(PlaylistController::ManualTake::Cut);});
        auto* fade=new QShortcut(QKeySequence(Qt::CTRL|Qt::Key_Space),this);connect(fade,&QShortcut::activated,this,[this]{takeSelected(PlaylistController::ManualTake::Fade);});
        auto* saveKey=new QShortcut(QKeySequence::Save,this);connect(saveKey,&QShortcut::activated,this,[this]{saveProject(false);});
        auto* ticker=new QTimer(this);connect(ticker,&QTimer::timeout,this,[this]{refreshTransport();});ticker->start(200);
        if(demo_) { for(const auto& s : {"01 - Doors open.mp4","02 - Opening film.mov","03 - Speaker intro.mkv","04 - Sponsor loop.avi","05 - Closing credits.mov"}) {library_<<s;playlist_<<Cue{QString(s),0,150000,Transition::Dissolve,600,400,600};} folders_<<"Show media"<<"Sponsor assets"; }
        programDefinitions_[0].cues=playlist_;refreshOutputConfiguration();retranslate();
        if(demo_){playlistTable_->selectRow(2);syncEditor(2);}
    }
    void selectPage(int page){pages_->setCurrentIndex(page);if(navigation_->button(page))navigation_->button(page)->setChecked(true);}
    void selectDigital(){selectPage(3);outputsTabs_->setCurrentIndex(1);}
    void selectDiagnostics(){selectPage(5);settingsTabs_->setCurrentIndex(1);}
    void configureBoardOutputs(){if(demo_){addProgram(true);addProgram(true);auto config=currentOutputConfiguration();config.displays=5;config.sources={0,0,1,2,0};applyOutputConfiguration(config,false);}}
    void setLanguage(const QString& lang){languageBox_->setCurrentIndex(lang=="pt-BR"?1:0);}
    void capture(const QString& path){
        retranslate();
        for(auto* widget:findChildren<QWidget*>())widget->repaint();
        repaint();
        QPixmap image(size()*devicePixelRatioF());image.setDevicePixelRatio(devicePixelRatioF());image.fill(Qt::transparent);
        render(&image,QPoint(),QRegion(),QWidget::DrawWindowBackground|QWidget::DrawChildren);
        image.save(path);
    }
    int runUiTests(const QString& directory,const QString& resultPath);
    void importExternal(const QStringList& paths){for(const auto& p:paths){if(QFileInfo(p).isDir())scanFolder(p);else addPaths({p});}}
protected:
    void dragEnterEvent(QDragEnterEvent* event) override {if(event->mimeData()->hasUrls())event->acceptProposedAction();}
    void dropEvent(QDropEvent* event) override {QStringList paths;for(const auto& url:event->mimeData()->urls())if(url.isLocalFile())paths<<url.toLocalFile();importExternal(paths);event->acceptProposedAction();}
    void closeEvent(QCloseEvent* event) override {
        if(!demo_ && dirty_ && QMessageBox::question(this,tx("Unsaved show"),tx("Close without saving the show?"),QMessageBox::Yes|QMessageBox::No,QMessageBox::No)!=QMessageBox::Yes){event->ignore();return;}
        for(auto& output:outputWindows_)if(output)output->close();event->accept();
    }
private:
    QString tx(const QString& key)const{const QString resolved=programCount_==1&&key=="Program A"?"Program":programCount_==1&&key=="PROGRAM A"?"PROGRAM":key;if(dictionary_.contains(resolved))return dictionary_.value(resolved).toString();if(resolved.startsWith("Program "))return dictionary_.value("Program %1").toString("Program %1").arg(resolved.mid(8));if(resolved.startsWith("PROGRAM "))return dictionary_.value("PROGRAM %1").toString("PROGRAM %1").arg(resolved.mid(8));return resolved;}
    void readDictionary(){QFile f(":/i18n/"+(language_=="pt-BR"?QString("pt-BR"):QString("en"))+".json");if(f.open(QIODevice::ReadOnly))dictionary_=QJsonDocument::fromJson(f.readAll()).object();}
    QLabel* label(const QString& key,const QString& style={}){auto* l=new QLabel(tx(key));if(!style.isEmpty())l->setObjectName(style);bindings_.append({l,key});return l;}
    QPushButton* button(const QString& key,const QString& style={}){auto* b=new QPushButton(tx(key));b->setMinimumHeight(34);if(!style.isEmpty())b->setObjectName(style);bindings_.append({b,key});return b;}
    QWidget* scrollPage(QWidget* page){auto* area=new QScrollArea;area->setWidgetResizable(true);area->setFrameShape(QFrame::NoFrame);area->setWidget(page);return area;}
    QWidget* monitor(NativeChannel* channel,int sample){
        if(demo_)return new DeskMonitor(new SamplePicture(sample));
        auto* video=new QVideoWidget;video->setMinimumSize(0,0);video->setAspectRatioMode(Qt::KeepAspectRatio);connect(channel,&NativeChannel::frameReady,video,[video](const QVideoFrame& f){video->videoSink()->setVideoFrame(f);});return new DeskMonitor(video);
    }
    QPushButton* iconButton(const QString& key,DeskIcon icon){
        auto* b=new QPushButton;b->setObjectName("iconButton");b->setIcon(deskIcon(icon));b->setIconSize(QSize(19,19));b->setFixedSize(36,32);
        b->setProperty("tipKey",key);b->setToolTip(tx(key));b->setAccessibleName(tx(key));return b;
    }
    QFrame* deckPanel(const QString& title,NativeChannel* channel,int sample,QLabel** name,QLabel** timing,const QString& style,bool dashboard=false){
        const int index=style=="preview"?0:style=="program"?1:2;
        auto* panel=new QFrame;panel->setObjectName("deck");panel->setProperty("channel",style);auto* l=new QVBoxLayout(panel);l->setContentsMargins(10,10,10,10);l->setSpacing(7);
        auto* header=new QHBoxLayout;auto* heading=label(title,"deckTitle");heading->setProperty("channel",style);header->addWidget(heading);header->addStretch();
        if(dashboard&&index==0)header->addWidget(label("Muted","deckState"));
        auto* state=new QLabel;state->setObjectName("deckState");header->addWidget(state);if(dashboard)deckState_[index]=state;else state->setText(tx("Muted"));l->addLayout(header);
        l->addWidget(monitor(channel,sample),1);*name=new ElidedLabel;(*name)->setObjectName("mediaTitle");(*name)->setSizePolicy(QSizePolicy::Ignored,QSizePolicy::Fixed);l->addWidget(*name);
        auto* timeRow=new QHBoxLayout;*timing=new QLabel("00:00:00");(*timing)->setObjectName("timecode");timeRow->addWidget(*timing);timeRow->addStretch();
        auto* timeKind=label(index==0?"Position":"Remaining","muted");timeRow->addWidget(timeKind);l->addLayout(timeRow);
        auto* progress=new QProgressBar;progress->setObjectName("deckProgress");progress->setRange(0,1000);progress->setTextVisible(false);progress->setFixedHeight(3);l->addWidget(progress);if(dashboard)deckProgress_[index]=progress;
        auto* row=new QHBoxLayout;row->setSpacing(6);auto* restart=iconButton("Seek to In",DeskIcon::Restart);row->addWidget(restart);connect(restart,&QPushButton::clicked,this,[channel]{channel->seek(channel->cue().in);});
        auto* play=iconButton("Play / pause",DeskIcon::Play);row->addWidget(play);connect(play,&QPushButton::clicked,this,[channel]{channel->togglePause();});if(dashboard)deckPlay_[index]=play;
        auto* stop=iconButton(index==0?"Clear Preview":"Black selected channel",DeskIcon::Stop);row->addWidget(stop);connect(stop,&QPushButton::clicked,this,[this,channel,index]{if(index==0){readiness_.clear();channel->black();cuedRow_=-1;}else if(index==1)controllerA_.stop();else targetController()->stop();});row->addStretch();
        if(index!=0){auto* audio=iconButton("Audio routing",DeskIcon::Audio);row->addWidget(audio);connect(audio,&QPushButton::clicked,this,[this]{selectPage(4);});}
        l->addLayout(row);return panel;
    }
    QWidget* mainPage(){
        auto* page=new QWidget;page->setObjectName("mainDesk");auto* layout=new QVBoxLayout(page);layout->setContentsMargins(0,0,0,0);layout->setSpacing(12);
        auto* deckRow=new QHBoxLayout;deckRow_=deckRow;deckRow->setSpacing(12);
        deckRow->addWidget(deckPanel("PREVIEW",&preview_,0,&previewName_,&previewTime_,"preview",true),37);
        deckRow->addWidget(deckPanel("PROGRAM A",&programA_,1,&programName_,&programTime_,"program",true),37);
        layout->addLayout(deckRow,4);

        auto* takePanel=new QFrame;takePanel->setObjectName("takeStrip");auto* transport=new QHBoxLayout(takePanel);transport->setContentsMargins(12,10,12,10);transport->setSpacing(12);
        auto* destination=new QVBoxLayout;destination->setSpacing(6);destination->addWidget(label("TAKE DESTINATION","eyebrow"));
        targetBox_=new QComboBox(takePanel);targetBox_->setObjectName("programSelector");targetBox_->addItem(tx("Program"));targetBox_->setMinimumWidth(130);destination->addWidget(targetBox_);
        addProgram_=button("+ Add Program");addProgram_->setObjectName("addProgram");destination->addWidget(addProgram_);connect(addProgram_,&QPushButton::clicked,this,[this]{addProgram(false);});transport->addLayout(destination,2);
        connect(targetBox_,&QComboBox::currentIndexChanged,this,[this](int index){switchProgram(index);});
        cutButton_=button("CUT","cut");cutButton_->setIcon(deskIcon(DeskIcon::Cut,QColor("#1b2229")));cutButton_->setToolTip("Ctrl+Enter");cutButton_->setMinimumSize(120,62);transport->addWidget(cutButton_,2);connect(cutButton_,&QPushButton::clicked,this,[this]{takeSelected(PlaylistController::ManualTake::Cut);});
        fadeButton_=button("FADE","take");fadeButton_->setIcon(deskIcon(DeskIcon::Fade,QColor("#10232c")));fadeButton_->setToolTip("Ctrl+Space");fadeButton_->setMinimumSize(120,62);transport->addWidget(fadeButton_,2);connect(fadeButton_,&QPushButton::clicked,this,[this]{takeSelected(PlaylistController::ManualTake::Fade);});
        auto* fadeDuration=new QVBoxLayout;fadeDuration->setSpacing(5);fadeDuration->addWidget(label("Fade duration","muted"));manualFadeTime_=new QSpinBox;manualFadeTime_->setRange(1,10000);manualFadeTime_->setSingleStep(50);manualFadeTime_->setSuffix(" ms");manualFadeTime_->setValue(qBound(1,settings_->value("manualFadeMs",300).toInt(),10000));manualFadeTime_->setFixedWidth(104);fadeDuration->addWidget(manualFadeTime_);transport->addLayout(fadeDuration);
        connect(manualFadeTime_,&QSpinBox::valueChanged,this,[this](int value){if(!demo_)settings_->setValue("manualFadeMs",value);});
        auto* black=button("Black");black->setIcon(deskIcon(DeskIcon::Display));black->setProperty("tipKey","Black selected channel");black->setToolTip(tx("Black selected channel"));transport->addWidget(black);connect(black,&QPushButton::clicked,this,[this]{targetController()->stop();});
        auto* loop=new QCheckBox;loopBox_=loop;bindings_.append({loop,"Loop"});loop->setToolTip(tx("Loop selected channel"));transport->addWidget(loop);
        connect(loop,&QCheckBox::toggled,this,[this](bool value){targetChannel()->setLoop(value);});layout->addWidget(takePanel);

        auto* order=new QFrame;order->setObjectName("orderPanel");auto* orderLayout=new QVBoxLayout(order);orderLayout->setContentsMargins(10,10,10,10);orderLayout->setSpacing(8);
        auto* tools=new QHBoxLayout;playlistHeading_=new QLabel;playlistHeading_->setObjectName("eyebrow");tools->addWidget(playlistHeading_);tools->addStretch();
        for(auto key:{"Add files","Add folder"}){auto* b=button(key);b->setIcon(deskIcon(QString(key)=="Add files"?DeskIcon::Add:DeskIcon::Folder));tools->addWidget(b);connect(b,&QPushButton::clicked,this,[this,key]{if(QString(key)=="Add files")chooseFiles();else chooseFolder();});}
        sequentialBox_=new QCheckBox(order);sequentialBox_->hide();auto* modes=new QHBoxLayout;modes->setSpacing(0);manualMode_=button("Manual","mode");sequentialMode_=button("Sequential","mode");for(auto* b:{manualMode_,sequentialMode_}){b->setCheckable(true);modes->addWidget(b);}tools->addLayout(modes);
        connect(manualMode_,&QPushButton::clicked,this,[this]{sequentialBox_->setChecked(false);refreshDashboard();});connect(sequentialMode_,&QPushButton::clicked,this,[this]{sequentialBox_->setChecked(true);refreshDashboard();});
        repeatBox_=new QCheckBox;bindings_.append({repeatBox_,"Repeat order"});tools->addWidget(repeatBox_);copyPlaylist_=button("Copy A playlist");connect(copyPlaylist_,&QPushButton::clicked,this,[this]{copyMainPlaylist();});orderLayout->addLayout(tools);
        connect(sequentialBox_,&QCheckBox::toggled,this,[this](bool value){targetController()->setSequential(value);if(value)loopBox_->setChecked(false);loopBox_->setEnabled(!value);repeatBox_->setEnabled(value);refreshDashboard();});
        connect(repeatBox_,&QCheckBox::toggled,this,[this](bool value){targetController()->setRepeat(value);});
        repeatBox_->setEnabled(false);
        playlistTable_=makeTable();playlistTable_->setObjectName("runningOrder");playlistTable_->setMinimumHeight(150);playlistTable_->verticalHeader()->setDefaultSectionSize(38);playlistTable_->setColumnWidth(2,190);playlistTable_->setColumnWidth(3,150);playlistTable_->setItemDelegateForColumn(1,new MediaDelegate(playlistTable_));orderLayout->addWidget(playlistTable_,1);
        connect(playlistTable_,&QTableWidget::itemSelectionChanged,this,[this]{syncEditor(playlistTable_->currentRow());});connect(playlistTable_,&QTableWidget::cellDoubleClicked,this,[this](int row,int){cueRow(row);});
        auto* bottom=new QHBoxLayout;auto* cue=button("Cue selected");bottom->addWidget(cue);connect(cue,&QPushButton::clicked,this,[this]{cueRow(playlistTable_->currentRow());});
        auto* edit=button("Edit cue");edit->setIcon(deskIcon(DeskIcon::Edit));bottom->addWidget(edit);connect(edit,&QPushButton::clicked,this,[this]{editSelected();});bottom->addWidget(copyPlaylist_);bottom->addStretch();
        auto* up=button("Move up");bottom->addWidget(up);connect(up,&QPushButton::clicked,this,[this]{moveCue(-1);});auto* down=button("Move down");bottom->addWidget(down);connect(down,&QPushButton::clicked,this,[this]{moveCue(1);});
        auto* duplicate=button("Duplicate cue");bottom->addWidget(duplicate);connect(duplicate,&QPushButton::clicked,this,[this]{int row=playlistTable_->currentRow();if(row>=0){playlist_.insert(row+1,playlist_[row]);cuedRow_=-1;dirty_=true;refreshTables();playlistTable_->selectRow(row+1);}});
        auto* remove=button("Remove cue");bottom->addWidget(remove);connect(remove,&QPushButton::clicked,this,[this]{int row=playlistTable_->currentRow();if(row>=0){cuedRow_=-1;editing_=-1;playlist_.removeAt(row);dirty_=true;refreshTables();}});orderLayout->addLayout(bottom);layout->addWidget(order,4);
        layout->addWidget(dashboard());return page;
    }
    QWidget* dashboard(){
        auto* strip=new QFrame;strip->setObjectName("dashboard");auto* row=new QHBoxLayout(strip);row->setContentsMargins(10,10,10,10);row->setSpacing(10);
        auto* outputs=iconButton("Output routing",DeskIcon::Display);row->addWidget(outputs);connect(outputs,&QPushButton::clicked,this,[this]{selectPage(3);});
        auto* diagnostics=iconButton("Engine diagnostics",DeskIcon::Settings);row->addWidget(diagnostics);connect(diagnostics,&QPushButton::clicked,this,[this]{selectDiagnostics();});
        auto* mainMeter=new QWidget;auto* meterLayout=new QVBoxLayout(mainMeter);meterLayout->setContentsMargins(4,0,6,0);meterLayout->addWidget(label("Program A","meterTitle"));mainMeters_[0]=new StereoMeter(&programA_,demo_);meterLayout->addWidget(mainMeters_[0]);row->addWidget(mainMeter,2);
        secondaryMeter_=new QWidget;secondaryMeterLayout_=new QVBoxLayout(secondaryMeter_);secondaryMeterLayout_->setContentsMargins(4,0,6,0);row->addWidget(secondaryMeter_,2);secondaryMeter_->hide();
        routesSummary_=new QPushButton;routesSummary_->setObjectName("statusTile");routesSummary_->setMinimumHeight(52);routesSummary_->setSizePolicy(QSizePolicy::Ignored,QSizePolicy::Preferred);row->addWidget(routesSummary_,2);connect(routesSummary_,&QPushButton::clicked,this,[this]{selectPage(3);outputsTabs_->setCurrentIndex(0);});
        for(int i=0;i<2;++i){auto* tile=new QPushButton;tile->setObjectName("networkTile");tile->setMinimumHeight(52);tile->setSizePolicy(QSizePolicy::Ignored,QSizePolicy::Preferred);networkSummary_[i]=tile;row->addWidget(tile,1);connect(tile,&QPushButton::clicked,this,[this]{selectDigital();});}return strip;
    }
    void rebuildSelectedDeck(){
        if(secondaryDeck_){delete secondaryDeck_;secondaryDeck_=nullptr;}secondaryName_=secondaryTime_=nullptr;deckPlay_[2]=nullptr;deckState_[2]=nullptr;deckProgress_[2]=nullptr;
        while(auto* item=secondaryMeterLayout_->takeAt(0)){delete item->widget();delete item;}mainMeters_[1]=nullptr;
        if(selectedProgram_>0){secondaryDeck_=deckPanel(programDefinitions_[selectedProgram_].name.toUpper(),targetChannel(),2,&secondaryName_,&secondaryTime_,"secondary",true);deckRow_->addWidget(secondaryDeck_,26);secondaryMeterLayout_->addWidget(label(programDefinitions_[selectedProgram_].name,"meterTitle"));mainMeters_[1]=new StereoMeter(targetChannel(),demo_);secondaryMeterLayout_->addWidget(mainMeters_[1]);}
        secondaryMeter_->setVisible(selectedProgram_>0);
    }
    void refreshDashboard(){
        if(!manualMode_||!playlistTable_)return;
        for(auto* name:{previewName_,programName_,secondaryName_})if(name){name->setToolTip(name->text());name->setAccessibleName(name->text());}
        manualMode_->setChecked(!targetController()->sequential());sequentialMode_->setChecked(targetController()->sequential());
        const std::array<NativeChannel*,3> channels{&preview_,&programA_,targetChannel()};
        for(int i=0;i<3;++i){auto* c=channels[i];if(deckState_[i]&&i>0)deckState_[i]->setText(tx(demo_?"Sample":c->pending()?"Preparing":c->path().isEmpty()?"Empty":c->playing()?"Playing":"Paused"));if(deckPlay_[i])deckPlay_[i]->setIcon(deskIcon(!demo_&&c->playing()?DeskIcon::Pause:DeskIcon::Play));if(deckProgress_[i])deckProgress_[i]->setValue(demo_?(i==1?560:i==2?120:0):c->duration()>0?int(qBound<qint64>(0,1000*c->position()/c->duration(),1000)):0);}
        if(deckState_[0]){const bool selected=cuedRow_>=0&&cuedRow_<playlist_.size()&&cuedRow_==playlistTable_->currentRow();const QString key=demo_?"Sample READY":!selected?"Not cued":readiness_.readyFor(playlist_[cuedRow_])?"READY":readiness_.state()==CueReadiness::State::Preparing?"Preparing":readiness_.state()==CueReadiness::State::Error?"Error":"Not cued";auto* badge=deckState_[0];badge->setText(tx(key));badge->setToolTip(key=="Error"?tx(readiness_.error()):tx("READY verifies the source and applied trim in muted Preview. Program prepares on TAKE."));const QString health=key=="READY"?"ready":key=="Error"?"error":key=="Preparing"?"pending":"idle";if(badge->property("health")!=health){badge->setProperty("health",health);badge->style()->unpolish(badge);badge->style()->polish(badge);}}
        int openCount=0;QStringList routeLines;for(int i=0;i<displayCount_;++i){const bool open=routeWindows_[i]&&routeWindows_[i]->isVisible();openCount+=open;const int source=open?routePrograms_[i]:sourceBoxes_[i]->currentIndex();routeLines<<QString("%1 → %2 · %3").arg(i+1).arg(programLabel(source),tx(open?"Open":"Closed"));}routesSummary_->setText(tx("Displays")+QString("\n%1 / %2 ").arg(openCount).arg(displayCount_)+tx("Open"));routesSummary_->setToolTip(routeLines.join('\n'));
        for(int protocol=0;protocol<2;++protocol){int sending=0;QStringList lines;for(int i=0;i<programCount_;++i){auto& sender=busAt(i)->sender(protocol==0?NetworkProtocol::Ndi:NetworkProtocol::Omt);sending+=sender.running();lines<<programLabel(i)+": "+tx(sender.running()?"Sending":sender.error().isEmpty()?"Stopped":"Error");}networkSummary_[protocol]->setText(QString("%1\n%2 / %3 ").arg(protocol==0?"NDI":"OMT").arg(sending).arg(programCount_)+tx("Sending"));networkSummary_[protocol]->setToolTip(lines.join('\n'));}
        for(int row=0;row<playlist_.size();++row){auto* item=playlistTable_->item(row,1);if(!item)continue;const auto& cue=playlist_[row];const auto* c=channelAt(selectedProgram_);QString mark;if(demo_?row==1:!c->path().isEmpty()&&c->path()==cue.path&&c->cue().in==cue.in&&c->cue().out==cue.out)mark=programLabel(selectedProgram_).toUpper();else if(demo_?row==2:row==cuedRow_)mark=tx("CUED");if(item->data(Qt::UserRole+1).toString()!=mark)item->setData(Qt::UserRole+1,mark);}
    }
    QTableWidget* makeTable(){auto* t=new QTableWidget(0,5);t->setSelectionBehavior(QAbstractItemView::SelectRows);t->setSelectionMode(QAbstractItemView::SingleSelection);t->setEditTriggers(QAbstractItemView::NoEditTriggers);t->setAlternatingRowColors(true);t->verticalHeader()->hide();t->setShowGrid(false);t->setAcceptDrops(false);t->horizontalHeader()->setStretchLastSection(true);t->horizontalHeader()->setSectionResizeMode(1,QHeaderView::Stretch);t->setColumnWidth(0,44);t->setColumnWidth(2,110);t->setColumnWidth(3,130);t->verticalHeader()->setDefaultSectionSize(42);return t;}
    QWidget* libraryPage(){auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(0,0,0,0);auto* heading=label("Media library","heading");l->addWidget(heading);l->addWidget(label("Original files stay in place. No mandatory conversion.","muted"));
        auto* row=new QHBoxLayout;auto* search=new QLineEdit;search->setPlaceholderText(tx("Search media"));bindings_.append({search,"Search media"});row->addWidget(search,1);auto* add=button("Add files");row->addWidget(add);connect(add,&QPushButton::clicked,this,[this]{chooseFiles();});auto* folder=button("Add folder");row->addWidget(folder);connect(folder,&QPushButton::clicked,this,[this]{chooseFolder();});l->addLayout(row);
        auto* main=new QHBoxLayout;auto* rootPanel=new QFrame;rootPanel->setObjectName("panel");rootPanel->setFixedWidth(230);auto* rootsLayout=new QVBoxLayout(rootPanel);rootsLayout->addWidget(label("FOLDERS","eyebrow"));roots_=new QListWidget;rootsLayout->addWidget(roots_);main->addWidget(rootPanel);libraryTable_=makeTable();main->addWidget(libraryTable_,1);l->addLayout(main,1);
        connect(search,&QLineEdit::textChanged,this,[this](const QString& q){for(int i=0;i<libraryTable_->rowCount();++i)libraryTable_->setRowHidden(i,!libraryTable_->item(i,1)->text().contains(q,Qt::CaseInsensitive));});
        connect(libraryTable_,&QTableWidget::cellDoubleClicked,this,[this](int row,int){if(row>=0&&!demo_)addPaths({library_.value(row)});});return page;}
    QString screenKey(QScreen* screen)const{return QString::number(reinterpret_cast<quintptr>(screen),16);}
    QScreen* selectedScreen(int index)const{const auto key=screenBoxes_[index]->currentData().toString();for(auto* screen:QGuiApplication::screens())if(screenKey(screen)==key)return screen;return nullptr;}
    void refreshScreens(){
        for(auto* box:screenBoxes_){const QSignalBlocker block(box);const auto selected=box->currentData().toString();box->clear();box->addItem(tx("Floating test window"),"floating");for(auto* screen:QGuiApplication::screens()){const auto pixels=displayPixels(screen->geometry().size(),screen->devicePixelRatio());box->addItem(QString("%1 · %2 × %3 · %4 Hz").arg(screen->name()).arg(pixels.width()).arg(pixels.height()).arg(screen->refreshRate(),0,'f',0),screenKey(screen));}const int old=box->findData(selected);box->setCurrentIndex(old>=0?old:0);}
        refreshOutputStatus();
    }
    void refreshOutputStatus(){
        for(int i=0;i<outputStatus_.size();++i){auto* channel=channelAt(sourceBoxes_[i]->currentIndex());QSize source=demo_?(i==2?QSize(1920,1080):QSize(3840,2160)):channel->lastFrame().size();QSize output(720,405);
            if(routeWindows_[i]){output=routeWindows_[i]->targetPixels();source=routeWindows_[i]->sourcePixels();}else if(auto* screen=selectedScreen(i))output=displayPixels(screen->geometry().size(),screen->devicePixelRatio());
            if(source.isEmpty()){outputStatus_[i]->setText(tx("No media loaded"));continue;}const auto fit=fittedPixels(source,output);const QString mode=fit==source?tx("1:1"):fit.width()<source.width()?tx("Downscale"):tx("Upscale");
            outputStatus_[i]->setText(tx("Source %1 → Output %2 · %3").arg(QString("%1 × %2").arg(source.width()).arg(source.height()),QString("%1 × %2").arg(output.width()).arg(output.height()),mode));
        }
    }
    void appendRoute(){
        const int i=sourceBoxes_.size();auto* panel=new QFrame;panel->setObjectName("panel");routePanels_.append(panel);routeWindows_.append(nullptr);routePrograms_.append(-1);auto* body=new QVBoxLayout(panel);body->setContentsMargins(20,18,20,18);auto* row=new QHBoxLayout;auto* number=new QLabel(QString::number(i+1).rightJustified(2,'0'));number->setObjectName("routeNumber");row->addWidget(number);
        auto* source=new QComboBox;for(int program=0;program<programCount_;++program)source->addItem(programLabel(program));sourceBoxes_.append(source);auto* sourceCol=new QVBoxLayout;sourceCol->addWidget(label("SOURCE","eyebrow"));sourceCol->addWidget(source);row->addLayout(sourceCol,1);row->addWidget(new QLabel("→"));
        auto* screen=new QComboBox;screen->addItem(tx("Floating test window"),"floating");screenBoxes_.append(screen);auto* screenCol=new QVBoxLayout;screenCol->addWidget(label("DISPLAY","eyebrow"));screenCol->addWidget(screen);row->addLayout(screenCol,2);
        auto* scaling=new QComboBox;scaling->addItem(tx("Native · performance"),"native");scaling->addItem(tx("Lanczos · experimental (CPU)"),"lanczos");scaling->addItem(tx("Lanczos · GPU (SDR)"),"gpu");scaling->setCurrentIndex(qMax(0,scaling->findData(settings_->value(QString("outputScaler%1").arg(i),"native").toString())));scalingBoxes_.append(scaling);auto* quality=new QVBoxLayout;quality->addWidget(label("SCALING","eyebrow"));quality->addWidget(scaling);row->addLayout(quality,1);
        connect(source,&QComboBox::currentIndexChanged,this,[this]{if(!demo_)dirty_=true;refreshTransport();});connect(scaling,&QComboBox::currentIndexChanged,this,[this,scaling,i]{if(!demo_)settings_->setValue(QString("outputScaler%1").arg(i),scaling->currentData());});
        auto* open=button("Open output");row->addWidget(open);connect(open,&QPushButton::clicked,this,[this,i]{openOutput(i);});auto* close=button("Close output");row->addWidget(close);connect(close,&QPushButton::clicked,this,[this,i]{if(routeWindows_[i])routeWindows_[i]->close();refreshTransport();});body->addLayout(row);auto* status=new QLabel;status->setObjectName("muted");outputStatus_.append(status);body->addWidget(status);routeLayout_->addWidget(panel);
    }
    void dropLastRoute(){const int i=sourceBoxes_.size()-1;if(routeWindows_[i])delete routeWindows_[i].data();routeWindows_.removeLast();routePrograms_.removeLast();sourceBoxes_.removeLast();screenBoxes_.removeLast();scalingBoxes_.removeLast();outputStatus_.removeLast();delete routePanels_.takeLast();}
    OutputConfiguration currentOutputConfiguration()const{OutputConfiguration config;config.programs=programCount_;config.displays=displayCount_;config.sources.resize(displayCount_);for(int i=0;i<displayCount_;++i)config.sources[i]=sourceBoxes_[i]->currentIndex();return config;}
    bool programBusy(int index)const{
        const auto* channel=channelAt(index);if(!channel->path().isEmpty()||channel->preparing()||channel->transitioning())return true;
        for(auto p:{NetworkProtocol::Ndi,NetworkProtocol::Omt})if(busAt(index)->sender(p).running())return true;
        for(int i=0;i<displayCount_;++i)if(routeWindows_[i]&&routeWindows_[i]->isVisible()&&routePrograms_[i]==index)return true;
        return scanner_.isRunning()&&scanProgramId_==programDefinitions_[index].id;
    }
    bool canApplyOutputConfiguration(const OutputConfiguration& config){
        if(nextProgramId_+qMax(0,config.programs-programCount_)>1000001){footer_->setText(tx("Program allocation limit reached"));return false;}
        if(!config.valid()){footer_->setText(tx("Invalid output configuration"));return false;}
        for(int i=config.programs;i<programCount_;++i)if(programBusy(i)){footer_->setText(tx("Black the Program and close its display and digital outputs before removing it."));return false;}
        for(int i=config.displays;i<displayCount_;++i)if(routeWindows_[i]&&routeWindows_[i]->isVisible()){footer_->setText(tx("Close this display output before removing it."));return false;}return true;
    }
    bool applyOutputConfiguration(const OutputConfiguration& config,bool markDirty=true){
        if(!canApplyOutputConfiguration(config))return false;
        while(programCount_<config.programs)appendProgram(defaultDefinition(nextProgramId_++));
        while(programCount_>config.programs){if(selectedProgram_==programCount_-1)switchProgram(0,true);dropProgram(programCount_-1);}
        while(sourceBoxes_.size()<config.displays)appendRoute();while(sourceBoxes_.size()>config.displays)dropLastRoute();displayCount_=config.displays;
        for(int i=0;i<displayCount_;++i){QSignalBlocker block(sourceBoxes_[i]);sourceBoxes_[i]->clear();for(int p=0;p<programCount_;++p)sourceBoxes_[i]->addItem(programLabel(p));sourceBoxes_[i]->setCurrentIndex(config.sources[i]);}
        refreshOutputConfiguration();refreshScreens();if(markDirty&&!demo_)dirty_=true;retranslate();return true;
    }
    void refreshOutputConfiguration(){
        if(outputConfigurationLabel_)outputConfigurationLabel_->setText(tx("%1 Program(s) · %2 display output(s)").arg(programCount_).arg(displayCount_)+" · "+programLabel(selectedProgram_));
        {QSignalBlocker block(targetBox_);targetBox_->clear();for(int p=0;p<programCount_;++p)targetBox_->addItem(programLabel(p));targetBox_->setCurrentIndex(selectedProgram_);}
        addProgram_->setEnabled(programCount_<OutputConfiguration::MaxPrograms);if(toggleProgram_)toggleProgram_->setEnabled(selectedProgram_>0);if(copyPlaylist_)copyPlaylist_->setEnabled(selectedProgram_>0);addDisplay_->setEnabled(displayCount_<OutputConfiguration::MaxDisplays);removeDisplay_->setEnabled(displayCount_>1);runningMarkKey_.clear();
    }
    QWidget* physicalOutputsPage(){
        auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(0,0,0,0);l->setSpacing(16);l->addWidget(label("Output routing","heading"));l->addWidget(label("Share one Program across screens, or send independent content.","muted"));
        auto* management=new QFrame;management->setObjectName("panel");auto* body=new QVBoxLayout(management);body->setContentsMargins(20,16,20,16);outputConfigurationLabel_=new QLabel;body->addWidget(outputConfigurationLabel_);auto* actions=new QHBoxLayout;auto* add=button("+ Add Program");actions->addWidget(add);connect(add,&QPushButton::clicked,this,[this]{addProgram(false);});toggleProgram_=button("Remove selected Program");actions->addWidget(toggleProgram_);connect(toggleProgram_,&QPushButton::clicked,this,[this]{removeSelectedProgram();});addDisplay_=button("+ Add display output");actions->addWidget(addDisplay_);connect(addDisplay_,&QPushButton::clicked,this,[this]{auto config=currentOutputConfiguration();if(config.displays<OutputConfiguration::MaxDisplays){++config.displays;config.sources.push_back(0);applyOutputConfiguration(config);}});removeDisplay_=button("Remove last display output");actions->addWidget(removeDisplay_);connect(removeDisplay_,&QPushButton::clicked,this,[this]{auto config=currentOutputConfiguration();if(config.displays>1){--config.displays;config.sources.pop_back();applyOutputConfiguration(config);}});actions->addStretch();body->addLayout(actions);auto* hint=label("Add Programs for independent playlists. New display outputs mirror A. Capacity depends on media and hardware.","muted");hint->setWordWrap(true);body->addWidget(hint);l->addWidget(management);
        auto* routes=new QWidget;routeLayout_=new QVBoxLayout(routes);routeLayout_->setContentsMargins(0,0,0,0);routeLayout_->setSpacing(16);l->addWidget(routes);appendRoute();
        for(auto key:{"Selected displays open fullscreen at their current resolution. Aspect ratio is preserved.","Native is recommended for live playback. GPU Lanczos improves SDR scaling; test it on your system.","Changes apply when opening an output. Escape closes it; Programs keep running.","Outputs using the same Program share decoded frames. Audio plays once per Program."}){auto* hint=label(key,"muted");hint->setWordWrap(true);l->addWidget(hint);}l->addStretch();return page;
    }
    QString preferencesId(int index)const{const int id=programDefinitions_[index].id;return id==1?"A":id==2?"B":"Program"+QString::number(id);}
    void appendProgramPanels(int index){
        auto* digital=new DigitalPanel(busAt(index),settings_.get(),preferencesId(index),[this](const QString& key){return tx(key);},demo_);digital->setProperty("programName",programDefinitions_[index].name);digitalPanels_.append(digital);digitalLayout_->addWidget(digital);
        auto* audio=new AudioPanel(channelAt(index),settings_.get(),preferencesId(index),[this](const QString& key){return tx(key);},demo_);audio->setProperty("programName",programDefinitions_[index].name);audioPanels_.append(audio);audioLayout_->addWidget(audio);
    }
    QWidget* outputsPage(){
        outputsTabs_=new QTabWidget;outputsTabs_->addTab(physicalOutputsPage(),tx("Displays"));auto* digital=new QWidget;auto* l=new QVBoxLayout(digital);l->setContentsMargins(16,16,16,16);l->setSpacing(16);l->addWidget(label("Digital outputs","heading"));auto* panels=new QWidget;digitalLayout_=new QVBoxLayout(panels);digitalLayout_->setContentsMargins(0,0,0,0);l->addWidget(panels);auto* attribution=new QLabel("<a href=\"https://ndi.video/\">NDI® · ndi.video</a><br>NDI® is a registered trademark of Vizrt NDI AB.");attribution->setOpenExternalLinks(true);l->addWidget(attribution);l->addWidget(label("Network output starts only when requested. No remote control service is started.","muted"));l->addStretch();outputsTabs_->addTab(digital,tx("Digital / IP"));return outputsTabs_;
    }
    QWidget* audioPage(){auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(0,0,0,0);l->setSpacing(16);l->addWidget(label("Audio routing","heading"));auto* panels=new QWidget;audioLayout_=new QVBoxLayout(panels);audioLayout_->setContentsMargins(0,0,0,0);l->addWidget(panels);appendProgramPanels(0);l->addWidget(label("Preview stays muted. Mirrored video outputs do not duplicate local audio.","muted"));l->addStretch();return page;}
    QWidget* settingsPage(){settingsTabs_=new QTabWidget;settingsTabs_->addTab(playbackSettingsPage(),tx("Playback"));diagnosticsPanel_=new DiagnosticsPanel([this](const QString& key){return tx(key);},[this]{return diagnosticsReport();},demo_);settingsTabs_->addTab(diagnosticsPanel_,tx("Engine diagnostics"));return settingsTabs_;}
    QWidget* playbackSettingsPage(){auto* page=new QWidget;auto* l=new QVBoxLayout(page);l->setContentsMargins(12,12,12,12);l->setSpacing(18);l->addWidget(label("Playback preferences","heading"));
        auto* p=new QFrame;p->setObjectName("panel");auto* pl=new QVBoxLayout(p);pl->setContentsMargins(24,24,24,24);pl->setSpacing(14);pl->addWidget(label("DECODING","eyebrow"));pl->addWidget(label("Native FFmpeg backend","mediaTitle"));auto* decode=new QComboBox;decodingBox_=decode;decode->addItem(tx("Automatic hardware selection"),"auto");decode->addItem(tx("CPU decoding"),"cpu");decode->setCurrentIndex(settings_->value("decode","auto").toString()=="cpu"?1:0);pl->addWidget(decode);connect(decode,&QComboBox::currentIndexChanged,this,[this,decode]{if(!demo_)settings_->setValue("decode",decode->currentData());footer_->setText(tx("Restart the application to apply decoding preferences."));});
        pl->addWidget(label("Hardware support depends on codec, profile, driver and GPU.","muted"));l->addWidget(p);
        auto* remote=new QFrame;remote->setObjectName("panel");auto* rl=new QVBoxLayout(remote);rl->setContentsMargins(24,24,24,24);rl->addWidget(label("REMOTE CONTROL","eyebrow"));rl->addWidget(label("Planned: authenticated operator and view-only monitor.","muted"));rl->addWidget(label("No network control service is started in this prototype.","muted"));l->addWidget(remote);
        l->addWidget(label("Prototype: trims, fades, sequential playback and independent Programs.","muted"));l->addWidget(label("Transitions currently use a shared CPU compositor. GPU composition, scheduling and remote access are future milestones.","muted"));l->addStretch();return page;}
    NativeChannel* channelAt(int index)const{return index==0?const_cast<NativeChannel*>(&programA_):&extraPrograms_.at(size_t(index-1))->channel;}
    PlaylistController* controllerAt(int index){return index==0?&controllerA_:&extraPrograms_.at(size_t(index-1))->controller;}
    NetworkBus* busAt(int index)const{return index==0?const_cast<NetworkBus*>(&networkA_):&extraPrograms_.at(size_t(index-1))->network;}
    NativeChannel* targetChannel(){return channelAt(selectedProgram_);}
    PlaylistController* targetController(){return controllerAt(selectedProgram_);}
    int programIndexById(int id)const{for(int i=0;i<programCount_;++i)if(programDefinitions_[i].id==id)return i;return -1;}
    static ProgramDefinition defaultDefinition(int id){return {id,QString("Program %1").arg(id<=26?QString(QChar('A'+id-1)):QString::number(id)),{}};}
    QString programLabel(int index)const{return index<0||index>=programCount_?tx("Not available"):tx(programDefinitions_[index].name);}
    void storeActivePlaylist(){programDefinitions_[selectedProgram_].cues=playlist_;}
    void watchProgram(int index){auto* channel=channelAt(index);auto* bus=busAt(index);connect(channel,&NativeChannel::changed,this,[this]{refreshTransport();});connect(channel,&NativeChannel::failed,this,[this](const QString& error){footer_->setText(tx("Media error")+": "+error);});connect(channel,&NativeChannel::audioWarning,this,[this](const QString& text){footer_->setText(tx(text));});connect(bus,&NetworkBus::warning,this,[this](const QString& text){footer_->setText(tx(text));});}
    void appendProgram(const ProgramDefinition& definition){extraPrograms_.push_back(std::make_unique<ProgramRuntime>(definition.id));programDefinitions_.append(definition);programCount_=programDefinitions_.size();nextProgramId_=qMax(nextProgramId_,definition.id+1);watchProgram(programCount_-1);appendProgramPanels(programCount_-1);}
    void syncTransportWidgets(){QSignalBlocker a(sequentialBox_),b(repeatBox_),c(loopBox_);sequentialBox_->setChecked(targetController()->sequential());repeatBox_->setChecked(targetController()->repeat());loopBox_->setChecked(targetChannel()->loop());loopBox_->setEnabled(!targetController()->sequential());repeatBox_->setEnabled(targetController()->sequential());}
    bool switchProgram(int index,bool discardDraft=false){
        if(index<0||index>=programCount_)return false;if(index==selectedProgram_)return true;
        if(!discardDraft&&editorStatusKey_=="Unapplied changes"){QSignalBlocker block(targetBox_);targetBox_->setCurrentIndex(selectedProgram_);footer_->setText(tx("Apply or reset edits before changing Program."));return false;}
        storeActivePlaylist();selectedProgram_=index;playlist_=programDefinitions_[index].cues;editing_=cuedRow_=-1;setEditorStatus("Select a cue to edit.");rebuildSelectedDeck();readiness_.clear();preview_.black();refreshTables();syncTransportWidgets();refreshOutputConfiguration();retranslate();if(!playlist_.isEmpty())playlistTable_->selectRow(0);return true;
    }
    bool addProgram(bool copyMain=false){
        if(programCount_>=OutputConfiguration::MaxPrograms||nextProgramId_>1000000){footer_->setText(tx("Program allocation limit reached"));return false;}
        if(editorStatusKey_=="Unapplied changes"){footer_->setText(tx("Apply or reset edits before changing Program."));return false;}
        storeActivePlaylist();auto definition=defaultDefinition(nextProgramId_++);if(!demo_)settings_->setValue("nextProgramId",nextProgramId_);if(copyMain)definition.cues=programDefinitions_[0].cues;appendProgram(definition);
        for(auto* source:sourceBoxes_){QSignalBlocker block(source);source->addItem(programLabel(programCount_-1));}switchProgram(programCount_-1);if(!demo_)dirty_=true;return true;
    }
    void dropProgram(int index){
        for(auto* source:sourceBoxes_){QSignalBlocker block(source);const int current=source->currentIndex();source->removeItem(index);source->setCurrentIndex(current==index?0:current>index?current-1:current);}
        for(int i=0;i<displayCount_;++i){if(routePrograms_[i]==index){if(routeWindows_[i])delete routeWindows_[i].data();routePrograms_[i]=-1;}else if(routePrograms_[i]>index)--routePrograms_[i];}
        delete audioPanels_.takeAt(index);delete digitalPanels_.takeAt(index);channelAt(index)->blockSignals(true);busAt(index)->blockSignals(true);extraPrograms_.erase(extraPrograms_.begin()+index-1);programDefinitions_.removeAt(index);programCount_=programDefinitions_.size();
    }
    bool removeSelectedProgram(){
        const int index=selectedProgram_;if(index==0){footer_->setText(tx("The main Program cannot be removed."));return false;}if(editorStatusKey_=="Unapplied changes"){footer_->setText(tx("Apply or reset edits before changing Program."));return false;}
        if(programBusy(index)){footer_->setText(tx("Black the Program and close its display and digital outputs before removing it."));return false;}
        auto config=currentOutputConfiguration();for(auto& source:config.sources)source=source==index?0:source>index?source-1:source;--config.programs;switchProgram(0);dropProgram(index);applyOutputConfiguration(config);return true;
    }
    bool copyMainPlaylist(){
        if(selectedProgram_==0)return false;if(!playlist_.isEmpty()){footer_->setText(tx("Copy A into an empty playlist. Existing items were preserved."));return false;}
        playlist_=programDefinitions_[0].cues;storeActivePlaylist();refreshTables();if(!demo_)dirty_=true;footer_->setText(tx("A playlist copied. Changes are independent."));return true;
    }
    QJsonObject diagnosticsReport(){
        QJsonArray channels;auto preview=preview_.diagnostics();preview["id"]="preview";preview["name"]=tx("PREVIEW");preview["enabled"]=true;channels.append(preview);QJsonArray senders;
        for(int i=0;i<programCount_;++i){auto snapshot=channelAt(i)->diagnostics();snapshot["id"]=QString::number(programDefinitions_[i].id);snapshot["name"]=programLabel(i);snapshot["enabled"]=true;channels.append(snapshot);for(auto protocol:{NetworkProtocol::Ndi,NetworkProtocol::Omt}){auto status=busAt(i)->sender(protocol).statistics();status["program"]=QString::number(programDefinitions_[i].id);status["program_name"]=programLabel(i);status["enabled"]=true;status["protocol"]=protocol==NetworkProtocol::Ndi?"NDI":"OMT";senders.append(status);}}
        QJsonArray outputs;for(int i=0;i<displayCount_;++i){const auto window=routeWindows_[i];const bool open=window&&window->isVisible();const int source=open?routePrograms_[i]:sourceBoxes_[i]->currentIndex();outputs.append(QJsonObject{{"route",i+1},{"enabled",true},{"open",open},{"program",programDefinitions_[qBound(0,source,programCount_-1)].id},{"program_name",programLabel(source)},{"published_to_window",window?window->frames():0},{"width",window?window->targetPixels().width():0},{"height",window?window->targetPixels().height():0},{"gpu_scaler_active",window&&window->gpuActive()}});}
        return {{"schema",2},{"version",QString(MizinVersion)},{"recorded_utc",QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)},{"language",language_},{"decode_mode_requested",qEnvironmentVariable("MIZIN_DECODE_MODE","auto")},{"sample_content",demo_},{"output_configuration",currentOutputConfiguration().json()},{"selected_program_id",programDefinitions_[selectedProgram_].id},{"take_enabled",canTake()},{"selected_row",playlistTable_->currentRow()},{"readiness",readiness_.snapshot()},{"channels",channels},{"network",senders},{"outputs",outputs},{"scope","Qt callbacks and CPU composition timing; dynamic Program allocation is not a concurrency qualification. Decoder/GPU timing and physical delivery are not measured."}};
    }
    bool canTake()const{return selectedProgram_>=0&&selectedProgram_<programCount_&&cuedRow_>=0&&cuedRow_<playlist_.size()&&cuedRow_==playlistTable_->currentRow()&&readiness_.readyFor(playlist_[cuedRow_]);}
    void takeSelected(PlaylistController::ManualTake mode){
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return;}
        if(pages_->currentIndex()!=0)return;
        if(!canTake()||!readiness_.recheckFile()){footer_->setText(tx("Cue media before taking it to Program."));return;}
        targetController()->takeManual(playlist_,cuedRow_,mode,manualFadeTime_->value());
    }
    void cueRow(int row){if(row<0 || row>=playlist_.size())return;syncEditor(row);cuedRow_=row;if(!demo_)readiness_.prepare(playlist_[row]);refreshTransport();}
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
        const bool rangeChanged=playlist_[editing_].in!=c.in||playlist_[editing_].out!=c.out;playlist_[editing_]=c;if(rangeChanged&&editing_==cuedRow_&&!demo_)readiness_.prepare(c);dirty_=true;refreshTables();setEditorStatus("Cue applied");footer_->setText(tx("Cue saved. Changes apply on the next TAKE."));return true;
    }
    void moveCue(int delta){int from=playlistTable_->currentRow(),to=from+delta;if(from<0||to<0||to>=playlist_.size())return;playlist_.move(from,to);cuedRow_=-1;dirty_=true;refreshTables();playlistTable_->selectRow(to);}
    void chooseFiles(){const auto paths=QFileDialog::getOpenFileNames(this,tx("Add media"),{},tx("Media files")+" (*.mp4 *.mkv *.mov *.avi *.webm *.mxf *.ts *.m4v *.mpg *.mpeg *.wmv *.wav *.mp3 *.flac *.aiff);;"+tx("All files")+" (*)");addPaths(paths);}
    void chooseFolder(){const auto path=QFileDialog::getExistingDirectory(this,tx("Add folder"));if(!path.isEmpty())scanFolder(path);}
    void scanFolder(const QString& path){if(demo_)return;if(scanner_.isRunning()){footer_->setText(tx("A folder scan is already running."));return;}scanProgramId_=programDefinitions_[selectedProgram_].id;if(!folders_.contains(path))folders_<<path;footer_->setText(tx("Scanning folder in background…"));scanner_.setFuture(QtConcurrent::run([path]{QStringList found;QDirIterator it(path,QDir::Files,QDirIterator::Subdirectories);const QStringList extensions{"mp4","mkv","mov","avi","webm","mxf","ts","m4v","mpg","mpeg","wmv","wav","mp3","flac","aiff","aac","ogg"};while(it.hasNext()){auto p=it.next();if(extensions.contains(QFileInfo(p).suffix().toLower()))found<<p;}found.sort(Qt::CaseInsensitive);return found;}));}
    void addPaths(const QStringList& paths,int target=-2){if(demo_)return;if(target==-2)target=selectedProgram_;for(const auto& path:paths){const auto canonical=QFileInfo(path).canonicalFilePath();if(canonical.isEmpty()||!QFileInfo(canonical).isFile())continue;if(!library_.contains(canonical,Qt::CaseInsensitive))library_<<canonical;if(target>=0&&target<programCount_){auto& cues=target==selectedProgram_?playlist_:programDefinitions_[target].cues;bool found=false;for(const auto& cue:cues)found|=cue.path.compare(canonical,Qt::CaseInsensitive)==0;if(!found)cues.append(Cue{canonical});}dirty_=true;}refreshTables();}
    void populate(QTableWidget* table,const QStringList& paths){int current=table->currentRow();table->setRowCount(paths.size());table->setHorizontalHeaderLabels({"#",tx("Media"),tx("Container"),tx("Availability"),tx("Location")});for(int i=0;i<paths.size();++i){const QFileInfo info(paths[i]);const QString state=demo_?tx("Sample"):info.exists()?tx("Available"):tx("Offline");const QStringList values{QString::number(i+1).rightJustified(2,'0'),info.fileName(),info.suffix().toUpper(),state,demo_?QString("Show media / ")+info.fileName():info.absolutePath()};for(int c=0;c<5;++c){auto* item=new QTableWidgetItem(values[c]);if(c==3)item->setForeground(demo_||info.exists()?QColor("#84c6a4"):QColor("#ff9478"));table->setItem(i,c,item);}}if(current>=0&&current<paths.size())table->selectRow(current);}
    void refreshTables(){runningMarkKey_.clear();QStringList paths;for(const auto& c:playlist_)paths<<c.path;{QSignalBlocker block(playlistTable_);populate(playlistTable_,paths);playlistTable_->setHorizontalHeaderLabels({"#",tx("Media"),tx("In / Out"),tx("Transition"),tx("Location")});for(int i=0;i<playlist_.size();++i){const auto& c=playlist_[i];playlistTable_->item(i,2)->setText(clockText(c.in)+" / "+(c.out<0?tx("End"):clockText(c.out)));playlistTable_->item(i,2)->setToolTip(QString::number(c.in)+" / "+QString::number(c.out)+" ms");playlistTable_->item(i,3)->setText(tx(c.transition==Transition::Cut?"Cut":c.transition==Transition::Dissolve?"Dissolve":"Fade through black"));}}if(editorCueBox_){QSignalBlocker block(editorCueBox_);editorCueBox_->clear();for(int i=0;i<playlist_.size();++i)editorCueBox_->addItem(QString("%1 · %2").arg(i+1,2,10,QChar('0')).arg(QFileInfo(playlist_[i].path).fileName()));editorCueBox_->setCurrentIndex(editing_>=0&&editing_<playlist_.size()?editing_:-1);}populate(libraryTable_,library_);roots_->clear();for(const auto& folder:folders_){auto* item=new QListWidgetItem(QFileInfo(folder).fileName(),roots_);item->setToolTip(folder);}}
    void refreshTransport(){
        if(!playlistTable_||sourceBoxes_.isEmpty())return;refreshOutputStatus();if(cutButton_){cutButton_->setEnabled(demo_||canTake());fadeButton_->setEnabled(demo_||canTake());}
        if(editorName_){editorName_->setText(demo_?"03 - Speaker intro.mkv":preview_.path().isEmpty()?tx("No media loaded"):QFileInfo(preview_.path()).fileName());editorTime_->setText(clockText(preview_.position())+QString(".%1").arg(preview_.position()%1000,3,10,QChar('0')));}
        auto name=[this](NativeChannel* c){return demo_?QString("02 - Opening film.mov"):c->pending()?tx("Preparing media…"):c->path().isEmpty()?tx("No media loaded"):QFileInfo(c->path()).fileName();};previewName_->setText(demo_?"03 - Speaker intro.mkv":name(&preview_));programName_->setText(name(&programA_));previewTime_->setText(clockText(preview_.position()));programTime_->setText(demo_?"00:01:24":clockText(qMax<qint64>(0,programA_.rangeEnd()-programA_.position())));
        if(secondaryName_){secondaryName_->setText(demo_?"04 - Sponsor loop.avi":name(targetChannel()));secondaryTime_->setText(demo_?"00:00:18":clockText(qMax<qint64>(0,targetChannel()->rangeEnd()-targetChannel()->position())));}
        if(scrub_&&!scrub_->isSliderDown()&&preview_.duration()>0)scrub_->setValue(int(1000.0*preview_.position()/preview_.duration()));refreshDashboard();
    }
    void retranslate(){
        bindings_.removeIf([](const Binding& binding){return binding.widget.isNull();});
        if(settingsTabs_){settingsTabs_->setTabText(0,tx("Playback"));settingsTabs_->setTabText(1,tx("Engine diagnostics"));}if(outputsTabs_){outputsTabs_->setTabText(0,tx("Displays"));outputsTabs_->setTabText(1,tx("Digital / IP"));}
        for(auto* widget:findChildren<QWidget*>()){const auto key=widget->property("tipKey").toString();if(!key.isEmpty()){widget->setToolTip(tx(key));widget->setAccessibleName(tx(key));}}
        for(int i=0;i<audioPanels_.size();++i){audioPanels_[i]->setProperty("programName",programDefinitions_[i].name);audioPanels_[i]->retranslate();digitalPanels_[i]->setProperty("programName",programDefinitions_[i].name);digitalPanels_[i]->retranslate();}
        for(const auto& binding:bindings_){if(auto* l=qobject_cast<QLabel*>(binding.widget.data()))l->setText(tx(binding.key));else if(auto* b=qobject_cast<QPushButton*>(binding.widget.data()))b->setText(tx(binding.key));else if(auto* c=qobject_cast<QCheckBox*>(binding.widget.data()))c->setText(tx(binding.key));else if(auto* e=qobject_cast<QLineEdit*>(binding.widget.data()))e->setPlaceholderText(tx(binding.key));}
        if(editorStatus_)editorStatus_->setText(tx(editorStatusKey_));if(playlistHeading_)playlistHeading_->setText(tx("RUNNING ORDER")+" · "+programLabel(selectedProgram_));
        for(auto* scaling:scalingBoxes_){scaling->setItemText(0,tx("Native · performance"));scaling->setItemText(1,tx("Lanczos · experimental (CPU)"));scaling->setItemText(2,tx("Lanczos · GPU (SDR)"));}
        for(auto* screen:screenBoxes_)screen->setItemText(0,tx("Floating test window"));for(auto* source:sourceBoxes_)for(int i=0;i<programCount_;++i)source->setItemText(i,programLabel(i));refreshOutputConfiguration();
        if(decodingBox_){decodingBox_->setItemText(0,tx("Automatic hardware selection"));decodingBox_->setItemText(1,tx("CPU decoding"));}
        if(transitionBox_){for(auto* spin:{inBox_,outBox_,transitionTime_,enterBox_,exitBox_})spin->setLocale(QLocale(language_=="pt-BR"?"pt_BR":"en_US"));transitionBox_->setItemText(0,tx("Cut"));transitionBox_->setItemText(1,tx("Dissolve"));transitionBox_->setItemText(2,tx("Fade through black"));outBox_->setSpecialValueText(tx("End of media"));}
        showTitle_->setText(demo_?"Opening Night / "+tx("Sample show"):projectPath_.isEmpty()?tx("Untitled show"):QFileInfo(projectPath_).completeBaseName());footer_->setText(demo_?tx("Layout preview — sample content"):tx("Native playback · EN / PT-BR · No mandatory conversion"));refreshTables();refreshTransport();if(diagnosticsPanel_)diagnosticsPanel_->retranslate();
    }
    void openOutput(int index){
        if(index<0||index>=displayCount_||sourceBoxes_[index]->currentIndex()<0||sourceBoxes_[index]->currentIndex()>=programCount_){footer_->setText(tx("Add this output before opening it."));return;}
        if(demo_){footer_->setText(tx("Layout preview — sample content"));return;}auto* screen=selectedScreen(index);if(screenBoxes_[index]->currentData().toString()!="floating"&&!screen){footer_->setText(tx("Selected display is unavailable"));return;}
        if(routeWindows_[index])routeWindows_[index]->close();const int source=sourceBoxes_[index]->currentIndex();const auto profile=scalingBoxes_[index]->currentData().toString();auto* window=new OutputWindow(channelAt(source),&outputRouter_,profile=="gpu"?OutputScaling::GpuLanczos:profile=="lanczos"?OutputScaling::CpuLanczos:OutputScaling::Native);window->setWindowTitle(QString("Mizin Playout — Output %1").arg(index+1));connect(window,&OutputWindow::warning,this,[this](const QString& text){footer_->setText(tx(text));});routePrograms_[index]=source;routeWindows_[index]=window;outputWindows_.append(window);window->openOn(screen);
    }
    Show currentShow(){storeActivePlaylist();return {library_,folders_,programDefinitions_[0].cues,currentOutputConfiguration(),programDefinitions_};}
    void saveProject(bool){
        if(demo_)return;QString path=projectPath_;if(path.isEmpty())path=QFileDialog::getSaveFileName(this,tx("Save show"),{},"Mizin show (*.mizinshow)");if(path.isEmpty())return;if(!path.endsWith(".mizinshow",Qt::CaseInsensitive))path+=".mizinshow";
        QSaveFile file(path);const auto payload=QJsonDocument(currentShow().json()).toJson();if(!file.open(QIODevice::WriteOnly)||file.write(payload)!=payload.size()||!file.commit()){footer_->setText(tx("Could not save show"));return;}projectPath_=path;dirty_=false;showTitle_->setText(QFileInfo(path).completeBaseName());footer_->setText(tx("Show saved"));
    }
    bool applyShow(const Show& loaded,const QString& path){
        if(scanner_.isRunning()){footer_->setText(tx("Wait for the folder scan before opening another show."));return false;}
        const auto definitions=loaded.definitions();if(!loaded.outputs.valid()||definitions.size()!=loaded.outputs.programs||definitions.isEmpty()||definitions[0].id!=1)return false;
        if(!canApplyOutputConfiguration(loaded.outputs))return false;bool prefix=true;for(int i=0;i<qMin(programCount_,int(definitions.size()));++i)prefix&=programDefinitions_[i].id==definitions[i].id;
        if(!prefix)for(int i=1;i<programCount_;++i)if(programBusy(i)){footer_->setText(tx("Black the Program and close its display and digital outputs before removing it."));return false;}
        switchProgram(0,true);if(!prefix)while(programCount_>1)dropProgram(programCount_-1);
        while(programCount_>definitions.size())dropProgram(programCount_-1);while(programCount_<definitions.size())appendProgram(definitions[programCount_]);
        programDefinitions_=definitions;for(const auto& definition:definitions)nextProgramId_=qMax(nextProgramId_,definition.id+1);if(!demo_)settings_->setValue("nextProgramId",nextProgramId_);library_=loaded.library;folders_=loaded.folders;playlist_=definitions[0].cues;selectedProgram_=0;editing_=cuedRow_=-1;setEditorStatus("Select a cue to edit.");readiness_.clear();preview_.black();rebuildSelectedDeck();applyOutputConfiguration(loaded.outputs,false);projectPath_=path;dirty_=false;refreshTables();refreshTransport();showTitle_->setText(QFileInfo(path).completeBaseName());return true;
    }
    void openProject(){
        if(demo_)return;if(dirty_&&QMessageBox::question(this,tx("Unsaved show"),tx("Open another show without saving?"),QMessageBox::Yes|QMessageBox::No,QMessageBox::No)!=QMessageBox::Yes)return;const auto path=QFileDialog::getOpenFileName(this,tx("Open show"),{},"Mizin show (*.mizinshow)");if(path.isEmpty())return;QFile file(path);if(!file.open(QIODevice::ReadOnly)){footer_->setText(tx("Could not open show"));return;}QJsonParseError error;const auto doc=QJsonDocument::fromJson(file.readAll(),&error);Show loaded;if(error.error!=QJsonParseError::NoError||!Show::read(doc.object(),loaded)){footer_->setText(tx("Invalid show file"));return;}applyShow(loaded,path);
    }
    void helpDialog(){QDialog dialog(this);dialog.setWindowTitle(tx("Quick start"));dialog.resize(700,540);auto* l=new QVBoxLayout(&dialog);auto* browser=new QTextBrowser;browser->setOpenExternalLinks(false);browser->setMarkdown(tx("HELP_MARKDOWN"));l->addWidget(browser);auto* close=button("Close");l->addWidget(close);connect(close,&QPushButton::clicked,&dialog,&QDialog::accept);dialog.exec();}
};

#include "main_ui_tests.inc"

static const char* style=R"(
QWidget {background:#0d151f;color:#e4edf6;font-family:'Segoe UI';font-size:13px;}
QLabel,QCheckBox {background:transparent;}
QFrame#rail {background:#090f17;border-right:1px solid #253448;}
QLabel#brand {font-size:25px;font-weight:700;letter-spacing:4px;color:#edf5fc;}
QLabel#heading {font-size:23px;font-weight:600;}
QLabel#eyebrow {font-size:10px;font-weight:600;letter-spacing:1.2px;color:#9eb4c9;}
QLabel#deckTitle {font-size:13px;font-weight:700;letter-spacing:.8px;}
QLabel[channel='preview'] {color:#53cce8;} QLabel[channel='program'] {color:#f5847a;} QLabel[channel='secondary'] {color:#b58be9;}
QLabel#deckState {font-size:10px;color:#a4b8cb;background:#192635;border-radius:3px;padding:3px 7px;}
QLabel#deckState[health='ready'] {color:#92e7ba;background:#183c32;}
QLabel#deckState[health='error'] {color:#ffb2a6;background:#492a2b;}
QLabel#deckState[health='pending'] {color:#f3cf87;background:#3c3425;}
QLabel#muted,QLabel#footer {color:#94a9be;font-size:11px;}
QLabel#footer {padding-top:6px;border-top:1px solid #24374b;}
QLabel#mediaTitle {font-size:13px;font-weight:600;}
QLabel#timecode {font-family:'Consolas';font-size:19px;color:#d7e7f5;}
QLabel#meterTitle {font-size:11px;font-weight:600;}
QLabel#routeNumber {font-family:'Consolas';font-size:34px;color:#77c7d8;}
QFrame#panel,QFrame#deck,QFrame#takeStrip,QFrame#orderPanel {background:#101c28;border:1px solid #283e52;border-radius:6px;}
QFrame#deck[channel='preview'] {border-top:2px solid #53cce8;}
QFrame#deck[channel='program'] {border-top:2px solid #f5847a;}
QFrame#deck[channel='secondary'] {border-top:2px solid #b58be9;}
QFrame#dashboard {background:#0b131d;border:1px solid #24374b;border-radius:5px;}
QPushButton {background:#1a2939;border:1px solid #324a61;border-radius:4px;padding:5px 10px;}
QPushButton:hover {background:#263b50;border-color:#638498;}
QPushButton:pressed {background:#344c60;} QPushButton:focus {border:1px solid #83d9e8;}
QPushButton:disabled {color:#718195;background:#172330;border-color:#283747;}
QPushButton#cut {background:#f1b661;color:#1b2229;font-weight:700;border:1px solid #ffcc88;font-size:19px;}
QPushButton#take {background:#55cce3;color:#10232c;font-weight:700;border:1px solid #92e1ed;font-size:19px;}
QPushButton#cut:disabled {background:#756147;color:#d3c5b5;border-color:#8a7354;}
QPushButton#take:disabled {background:#365f6d;color:#a8c7cf;border-color:#4c7888;}
QPushButton#navigation {text-align:left;background:transparent;border:none;padding:12px 8px;color:#a6bacd;}
QPushButton#navigation:checked {color:#56d1e8;background:#142e3c;border-left:3px solid #55cee5;}
QPushButton#targetA:checked {background:#f5847a;color:#161c26;border-color:#f5847a;font-weight:600;}
QPushButton#targetB:checked {background:#b58be9;color:#161c26;border-color:#b58be9;font-weight:600;}
QPushButton#mode:checked {background:#4dc4da;color:#10232c;border-color:#7fd9e7;font-weight:600;}
QPushButton#statusTile,QPushButton#networkTile {background:#101c28;font-size:10px;padding:4px 2px;border-color:#263d52;}
QComboBox,QLineEdit,QDoubleSpinBox,QSpinBox {background:#0c1723;border:1px solid #344d65;border-radius:4px;padding:7px;min-height:18px;selection-background-color:#285b70;}
QCheckBox::indicator {width:14px;height:14px;border:1px solid #526d86;border-radius:2px;background:#0c1723;}
QCheckBox::indicator:checked {background:#55cce3;border-color:#a6e5ed;}
QCheckBox::indicator:disabled {border-color:#293746;background:#17202a;}
QSlider::groove:horizontal {height:4px;background:#304457;border-radius:2px;} QSlider::handle:horizontal {background:#64cbde;width:12px;margin:-5px 0;border-radius:5px;}
QComboBox QAbstractItemView {background:#182536;selection-background-color:#285b70;}
QTableWidget {background:#0e1925;alternate-background-color:#121f2c;border:1px solid #263d52;border-radius:4px;selection-background-color:#174258;selection-color:#edf9fd;}
QTableWidget::item {padding:7px;border-bottom:1px solid #223344;}
QHeaderView::section {background:#1b2b3d;color:#a3bad0;border:none;padding:9px;text-align:left;font-weight:600;}
QListWidget {background:transparent;border:none;} QListWidget::item {padding:12px 2px;}
QTextBrowser {background:#151f2b;border:1px solid #334155;padding:20px;font-size:14px;}
QScrollBar:vertical {background:#101a26;width:10px;} QScrollBar::handle:vertical {background:#3d556e;min-height:20px;border-radius:4px;}
QProgressBar {border:1px solid #253e52;border-radius:3px;background:#0b151f;text-align:center;min-height:12px;}
QProgressBar::chunk {background:#51b98b;border-radius:2px;}
QProgressBar#deckProgress {border:none;min-height:3px;max-height:3px;background:#263d52;}
QProgressBar#deckProgress::chunk {background:#64cbde;border-radius:1px;}
QTabWidget::pane {border:1px solid #283e52;background:#0d151f;}
QTabBar::tab {background:#152433;color:#a7bed1;padding:8px 18px;border:1px solid #283e52;}
QTabBar::tab:selected {background:#234153;color:#d8f3fa;border-bottom:2px solid #55cce3;}
QToolTip {background:#223548;color:#e4edf6;border:1px solid #638498;padding:6px;}
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
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);
    QApplication app(argc,argv);QCoreApplication::setApplicationName("Mizin Playout");QCoreApplication::setOrganizationName("Mizin");app.setStyle("Fusion");app.setStyleSheet(style);
    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOption(QCommandLineOption(QStringLiteral("board"),QStringLiteral("Show sample content for layout review")));
    parser.addOption(QCommandLineOption(QStringLiteral("board-multi-output"),QStringLiteral("Show optional two-Program / three-display layout in sample mode")));
    parser.addOption(QCommandLineOption(QStringLiteral("lang"),QStringLiteral("UI language"),QStringLiteral("locale")));
    parser.addOption(QCommandLineOption(QStringLiteral("capture-dir"),QStringLiteral("Export one native layout board and exit"),QStringLiteral("directory")));
    parser.addOption(QCommandLineOption(QStringLiteral("capture-page"),QStringLiteral("Layout page: 0 MAIN, 1 EDIT, 2 library, 3 outputs, 4 audio"),QStringLiteral("page"),QStringLiteral("0")));
    parser.addOption(QCommandLineOption(QStringLiteral("capture-size"),QStringLiteral("Native board viewport, e.g. 1280x800"),QStringLiteral("widthxheight"),QStringLiteral("1600x1000")));
    parser.addOption(QCommandLineOption(QStringLiteral("state-dir"),QStringLiteral("Portable settings directory"),QStringLiteral("directory")));
    parser.addOption(QCommandLineOption(QStringLiteral("cpu"),QStringLiteral("Force software decoding")));
    parser.addOption(QCommandLineOption(QStringLiteral("network-test"),QStringLiteral("Test audio mixing and native NDI/OMT loopback")));
    parser.addOption(QCommandLineOption(QStringLiteral("capture-digital"),QStringLiteral("Capture the Digital/IP outputs tab")));
    parser.addOption(QCommandLineOption(QStringLiteral("capture-diagnostics"),QStringLiteral("Capture Settings / Engine diagnostics")));
    parser.addOption(QCommandLineOption(QStringLiteral("readiness-test"),QStringLiteral("Test real source readiness and engine metrics")));
    parser.addOption(QCommandLineOption(QStringLiteral("gpu-test"),QStringLiteral("Test GPU Lanczos pixels, output fallback and short playback")));
    parser.addOption(QCommandLineOption(QStringLiteral("output-test"),QStringLiteral("Test native output scaling and fullscreen geometry")));
    parser.addOption(QCommandLineOption(QStringLiteral("ui-test"),QStringLiteral("Test native MAIN/EDIT controls with fixture media")));
    parser.addOption(QCommandLineOption(QStringLiteral("transport-test"),QStringLiteral("Test trims, transitions and playlist modes")));
    parser.addOption(QCommandLineOption(QStringLiteral("smoke-test"),QStringLiteral("Decode fixture suite and exit")));
    parser.addOption(QCommandLineOption(QStringLiteral("fixtures"),QStringLiteral("Fixture directory"),QStringLiteral("directory")));
    parser.addOption(QCommandLineOption(QStringLiteral("result"),QStringLiteral("Smoke result JSON"),QStringLiteral("path")));
    parser.addPositionalArgument("media","Local media paths","[media...]");
    parser.process(app);
    if(parser.isSet("readiness-test"))return runReadinessTests(parser.value("fixtures"),parser.value("result"));
    if(parser.isSet("network-test"))return runNetworkTests(parser.value("fixtures"),parser.value("result"));
    if(parser.isSet("gpu-test"))return runGpuTests(parser.value("fixtures"),parser.value("result"));
    if(parser.isSet("output-test"))return runOutputTests(parser.value("fixtures"),parser.value("result"));
    if(parser.isSet("transport-test"))return runTransportTests(parser.value("fixtures"),parser.value("result"));
    if(parser.isSet("smoke-test"))return runSmoke(parser.value("fixtures"),parser.value("result"));
    const QString state=parser.isSet("state-dir")?parser.value("state-dir"):QCoreApplication::applicationDirPath()+"/state";
    QSettings decodeSettings(state+"/preferences.ini",QSettings::IniFormat);if(decodeSettings.value("decode","auto").toString()=="cpu"){qputenv("QT_FFMPEG_DECODING_HW_DEVICE_TYPES",",");qputenv("MIZIN_DECODE_MODE","cpu");}
    MainWindow window(parser.isSet("board"),parser.value("lang"),state);
    if(parser.isSet("board-multi-output"))window.configureBoardOutputs();
    if(parser.isSet("capture-dir")){const auto match=QRegularExpression("^([0-9]{3,4})x([0-9]{3,4})$").match(parser.value("capture-size"));if(!match.hasMatch()||match.captured(1).toInt()<1280||match.captured(2).toInt()<800)return 4;window.resize(match.captured(1).toInt(),match.captured(2).toInt());}
    window.show();if(parser.isSet("ui-test"))return window.runUiTests(parser.value("fixtures"),parser.value("result"));window.importExternal(parser.positionalArguments());
    if(parser.isSet("capture-dir")){
        const QString dir=parser.value("capture-dir");QDir().mkpath(dir);
        const int page=qBound(0,parser.value("capture-page").toInt(),4);window.selectPage(page);if(parser.isSet("capture-digital"))window.selectDigital();if(parser.isSet("capture-diagnostics"))window.selectDiagnostics();
        const bool portuguese=parser.value("lang")=="pt-BR";
        const QString name=parser.isSet("capture-diagnostics")?(portuguese?"12-engine-pt-BR.png":"11-engine-en.png"):parser.isSet("capture-digital")?(portuguese?"10-network-pt-BR.png":"09-network-en.png"):page==4?(portuguese?"08-audio-pt-BR.png":"07-audio-en.png"):page==3?"02-outputs-en.png":page==2?"03-library-en.png":page==1?(portuguese?"06-edit-pt-BR.png":"05-edit-en.png"):portuguese?"04-main-pt-BR.png":"01-main-en.png";
        QTimer::singleShot(900,&window,[&window,dir,name]{window.capture(dir+"/"+name);QCoreApplication::quit();});
    }
    return app.exec();
}
