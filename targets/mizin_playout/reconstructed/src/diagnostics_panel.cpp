#include "diagnostics_panel.hpp"
#include <QSaveFile>
#include <QJsonDocument>
#include <QDateTime>
#include <QFileInfo>

DiagnosticsPanel::DiagnosticsPanel(Translate tx,std::function<QJsonObject()> report,bool demo,QWidget* parent):QWidget(parent),tx_(std::move(tx)),report_(std::move(report)),demo_(demo){
    auto* l=new QVBoxLayout(this);l->setContentsMargins(14,14,14,14);l->setSpacing(10);
    auto* top=new QHBoxLayout;heading_=new QLabel;heading_->setObjectName("heading");top->addWidget(heading_);top->addStretch();refresh_=new QPushButton;top->addWidget(refresh_);export_=new QPushButton;export_->setObjectName("exportDiagnostics");top->addWidget(export_);l->addLayout(top);
    hint_=new QLabel;hint_->setObjectName("muted");hint_->setWordWrap(true);l->addWidget(hint_);ready_=new QLabel;ready_->setWordWrap(true);l->addWidget(ready_);
    auto table=[](int columns){auto* t=new QTableWidget(0,columns);t->setEditTriggers(QAbstractItemView::NoEditTriggers);t->setSelectionBehavior(QAbstractItemView::SelectRows);t->setAlternatingRowColors(true);t->verticalHeader()->hide();t->setShowGrid(false);t->verticalHeader()->setDefaultSectionSize(28);t->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);return t;};
    channels_=table(4);channels_->setObjectName("engineMetrics");channels_->setMinimumHeight(340);channels_->horizontalHeader()->setSectionResizeMode(0,QHeaderView::ResizeToContents);l->addWidget(channels_,1);
    network_=table(8);network_->setObjectName("networkMetrics");network_->setMinimumHeight(160);network_->setMaximumHeight(180);l->addWidget(network_);
    result_=new QLabel;result_->setObjectName("muted");result_->setWordWrap(true);l->addWidget(result_);
    connect(refresh_,&QPushButton::clicked,this,&DiagnosticsPanel::refresh);
    connect(export_,&QPushButton::clicked,this,[this]{const auto path=QFileDialog::getSaveFileName(this,tx_("Export diagnostics"),"mizin-diagnostics-"+QDateTime::currentDateTimeUtc().toString("yyyyMMdd-HHmmss")+".json","JSON (*.json)");if(!path.isEmpty())exportTo(path);});
    auto* timer=new QTimer(this);timer->setInterval(500);connect(timer,&QTimer::timeout,this,[this]{if(isVisible())refresh();});timer->start();retranslate();
}
void DiagnosticsPanel::retranslate(){
    heading_->setText(tx_("Engine diagnostics"));refresh_->setText(tx_("Refresh"));export_->setText(tx_("Export report"));
    hint_->setText(tx_("Local callback and CPU composition measurements. Decoder/GPU timing and packet queues are not exposed by this backend."));
    channels_->setHorizontalHeaderLabels({tx_("Metric"),tx_("PREVIEW"),tx_("Program A"),tx_("Program B")});
    network_->setHorizontalHeaderLabels({tx_("Program"),tx_("Protocol"),tx_("Status"),tx_("Video frames"),tx_("Audio packets"),tx_("Superseded video"),tx_("Dropped audio"),tx_("Connections")});refresh();
}
void DiagnosticsPanel::refresh(){
    const auto report=report_();const auto readiness=report["readiness"].toObject();const auto cue=readiness["cue"].toObject();
    auto state=[this](const QString& key){return tx_(key=="ready"?"READY":key=="preparing"?"Preparing":key=="error"?"Error":key=="cancelled"?"Cancelled":key=="playing"?"Playing":key=="paused"?"Paused":"Empty");};
    ready_->setText(demo_?tx_("Sample content — no engine measurements"):tx_("Cue readiness")+": "+state(readiness["state"].toString())+" · "+QFileInfo(cue["source"].toString()).fileName()+" · "+tx_(readiness["error"].toString()));
    const QStringList labels{"Source","Playback","Preparation","Resolution","Nominal frame rate","Video frames in last second","Backend buffer","Published video frames","Filtered preroll frames","CPU composition last (ms)","CPU composition peak (ms)","Audio buffers tapped","Decoder adapter","Decode time (ms)","Last error"};
    channels_->setRowCount(labels.size());
    auto put=[](QTableWidget* table,int row,int column,const QString& text,const QString& hint=QString{}){auto* item=table->item(row,column);if(!item){item=new QTableWidgetItem;table->setItem(row,column,item);}item->setText(text);item->setToolTip(hint.isEmpty()?text:hint);};
    for(int row=0;row<labels.size();++row)put(channels_,row,0,tx_(labels[row]));
    const auto channelData=report["channels"].toArray();
    for(int col=0;col<3;++col){const auto c=channelData[col].toObject();const QString unavailable=tx_("Not available");
        auto number=[&](const QString& key,int decimals=0){const auto value=c[key];return value.isDouble()?QString::number(value.toDouble(),'f',decimals):unavailable;};
        const QString source=c["source"].toString();const int w=c["width"].toInt(),h=c["height"].toInt();
        const QStringList values{source.isEmpty()?tx_("No media loaded"):QFileInfo(source).fileName(),state(c["playback"].toString()),
            state(c["preparation_state"].toString())+" · "+number("preparation_ms")+" ms",w>0&&h>0?QString("%1 × %2").arg(w).arg(h):unavailable,
            number("nominal_fps",3),number("video_frames_last_second"),source.isEmpty()?unavailable:QString::number(c["backend_buffer_progress"].toDouble()*100,'f',0)+" %",
            number("published_frames"),number("preroll_frames_filtered"),number("cpu_composition_last_ms",3),number("cpu_composition_peak_ms",3),number("audio_buffers_tapped"),
            unavailable,unavailable,c["last_error"].toString().isEmpty()?QString("—"):c["last_error"].toString()};
        for(int row=0;row<values.size();++row)put(channels_,row,col+1,demo_?tx_("Sample"):values[row],row==0?source:row==2?c["preparation_source"].toString()+"\n"+c["preparation_error"].toString():QString{});
    }
    const auto senders=report["network"].toArray();network_->setRowCount(senders.size());
    for(int row=0;row<senders.size();++row){const auto s=senders[row].toObject();const QStringList values{tx_(s["program"].toString()=="A"?"Program A":"Program B"),s["protocol"].toString(),tx_(s["running"].toBool()?"Sending":s["error"].toString().isEmpty()?"Stopped":"Error"),QString::number(s["video_frames"].toInt()),QString::number(s["audio_packets"].toInt()),QString::number(s["superseded_video"].toInt()),QString::number(s["dropped_audio"].toInt()),QString::number(s["connections"].toInt())};for(int col=0;col<values.size();++col)put(network_,row,col,demo_?tx_("Sample"):values[col],col==2?s["error"].toString():QString{});}
}
bool DiagnosticsPanel::exportTo(const QString& path){
    QSaveFile file(path);const auto payload=QJsonDocument(report_()).toJson();
    const bool ok=file.open(QIODevice::WriteOnly)&&file.write(payload)==payload.size()&&file.commit();
    result_->setText(tx_(ok?"Diagnostics saved":"Could not save diagnostics"));return ok;
}
