#pragma once
#include "channel.hpp"
#include <QtWidgets>
#include <cmath>

// Small native vector icons; no screenshot textures or external icon runtime.
enum class DeskIcon { Play, Pause, Stop, Restart, Main, Edit, Folder, Display, Audio, Settings, Cut, Fade, Add, Save };
inline QIcon deskIcon(DeskIcon icon, QColor color=QColor("#afc2d5")) {
    QPixmap pix(48,48); pix.fill(Qt::transparent);
    QPainter p(&pix); p.setRenderHint(QPainter::Antialiasing); p.scale(2,2);
    p.setPen(QPen(color,1.6,Qt::SolidLine,Qt::RoundCap,Qt::RoundJoin)); p.setBrush(Qt::NoBrush);
    switch(icon) {
    case DeskIcon::Play: case DeskIcon::Main:
        p.setBrush(color); p.setPen(Qt::NoPen); p.drawPolygon(QPolygonF{QPointF(7,4),QPointF(20,12),QPointF(7,20)}); break;
    case DeskIcon::Pause: p.fillRect(QRectF(6,5,4,14),color);p.fillRect(QRectF(14,5,4,14),color);break;
    case DeskIcon::Stop: p.fillRect(QRectF(6,6,12,12),color);break;
    case DeskIcon::Restart: p.drawLine(5,5,5,19);p.setBrush(color);p.drawPolygon(QPolygonF{QPointF(18,5),QPointF(7,12),QPointF(18,19)});break;
    case DeskIcon::Edit: p.drawPolygon(QPolygonF{QPointF(4,16),QPointF(16,4),QPointF(20,8),QPointF(8,20),QPointF(3,21)});p.drawLine(14,6,18,10);break;
    case DeskIcon::Folder: p.drawPolyline(QPolygonF{QPointF(3,8),QPointF(3,5),QPointF(10,5),QPointF(13,8),QPointF(21,8)});p.drawRoundedRect(QRectF(3,8,18,12),1,1);break;
    case DeskIcon::Display: p.drawRoundedRect(QRectF(3,4,18,13),1,1);p.drawLine(12,17,12,21);p.drawLine(8,21,16,21);break;
    case DeskIcon::Audio: for(int i=0;i<4;++i)p.drawLine(5+i*5,19,5+i*5,5+(i%2)*5);break;
    case DeskIcon::Settings: p.drawEllipse(QPointF(12,12),7,7);p.drawEllipse(QPointF(12,12),2,2);for(int i=0;i<8;++i){p.save();p.translate(12,12);p.rotate(i*45);p.drawLine(0,7,0,10);p.restore();}break;
    case DeskIcon::Cut: p.drawEllipse(QPointF(6,18),3,3);p.drawEllipse(QPointF(18,18),3,3);p.drawLine(4,3,17,16);p.drawLine(20,3,7,16);break;
    case DeskIcon::Fade: p.setBrush(color);p.drawPolygon(QPolygonF{QPointF(4,5),QPointF(12,12),QPointF(4,19)});p.drawPolygon(QPolygonF{QPointF(20,5),QPointF(12,12),QPointF(20,19)});break;
    case DeskIcon::Add: p.drawLine(12,5,12,19);p.drawLine(5,12,19,12);break;
    case DeskIcon::Save: p.drawRoundedRect(QRectF(4,3,16,18),1,1);p.drawRect(QRectF(8,3,8,6));p.drawRect(QRectF(8,14,8,7));break;
    }
    return QIcon(pix);
}

class ElidedLabel final : public QLabel {
public:
    using QLabel::QLabel;
    QSize minimumSizeHint() const override { return {0,QLabel::minimumSizeHint().height()}; }
    QSize sizeHint() const override { return {140,QLabel::sizeHint().height()}; }
protected:
    void paintEvent(QPaintEvent*) override {
        QPainter p(this);p.setFont(font());p.setPen(palette().color(QPalette::WindowText));
        p.drawText(contentsRect(),Qt::AlignLeft|Qt::AlignVCenter,fontMetrics().elidedText(text(),Qt::ElideMiddle,contentsRect().width()));
    }
};

// Both sample and real media stay inside a 16:9 view, without distorting frames.
class DeskMonitor final : public QWidget {
    QWidget* image_;
public:
    explicit DeskMonitor(QWidget* image):image_(image) {
        image_->setParent(this);setMinimumSize(120,80);setSizePolicy(QSizePolicy::Expanding,QSizePolicy::Expanding);
        setAutoFillBackground(true);auto colors=palette();colors.setColor(QPalette::Window,Qt::black);setPalette(colors);
    }
protected:
    void resizeEvent(QResizeEvent*) override {
        // The viewport has a stable 16:9 shape; QVideoWidget fits other source ratios inside it.
        const int w=qMin(width(),height()*16/9),h=w*9/16;
        image_->setGeometry((width()-w)/2,(height()-h)/2,w,h);
    }
};

class StereoMeter final : public QWidget {
    float peak_[2]{},shown_[2]{};
    bool demo_;
public:
    StereoMeter(NativeChannel* channel,bool demo,QWidget* parent=nullptr):QWidget(parent),demo_(demo) {
        setMinimumSize(110,27);setSizePolicy(QSizePolicy::Expanding,QSizePolicy::Fixed);
        connect(channel,&NativeChannel::audioMeter,this,[this](float left,float right){peak_[0]=qMax(peak_[0],left);peak_[1]=qMax(peak_[1],right);});
        auto* timer=new QTimer(this);timer->setInterval(80);connect(timer,&QTimer::timeout,this,[this]{
            for(int c=0;c<2;++c){shown_[c]=demo_?(c==0?.47f:.38f):qMax(peak_[c],shown_[c]*.72f);peak_[c]=0;}
            if(isVisible())update();
        });timer->start();
    }
    float level(int channel)const{return shown_[qBound(0,channel,1)];}
protected:
    void paintEvent(QPaintEvent*) override {
        QPainter p(this);p.setFont(QFont("Segoe UI",7));
        const int count=28,space=2,start=16,cell=qMax(1,(width()-start)/count);
        for(int c=0;c<2;++c){p.setPen(QColor("#9aacc0"));p.drawText(0,11+c*13,c==0?"L":"R");
            const float db=shown_[c]>0.00001f?20*std::log10(shown_[c]):-60;
            const int lit=qRound(qBound(0.0f,(db+60)/60,1.0f)*count);
            for(int i=0;i<count;++i)p.fillRect(start+i*cell,3+c*13,qMax(1,cell-space),7,i>=lit?QColor("#243343"):i>25?QColor("#f47f74"):i>21?QColor("#e7c86b"):QColor("#55cc8f"));
        }
    }
};

class MediaDelegate final : public QStyledItemDelegate {
public:
    using QStyledItemDelegate::QStyledItemDelegate;
    void paint(QPainter* p,const QStyleOptionViewItem& option,const QModelIndex& index)const override {
        auto opt=option;initStyleOption(&opt,index);const QString name=opt.text;opt.text.clear();
        const auto* widget=opt.widget;(widget?widget->style():QApplication::style())->drawControl(QStyle::CE_ItemViewItem,&opt,p,widget);
        p->save();p->setClipRect(opt.rect);p->setRenderHint(QPainter::Antialiasing);
        const QRect r=opt.rect.adjusted(8,5,-8,-5);const QString ext=QFileInfo(name).suffix().toUpper().left(6);
        const QString state=index.data(Qt::UserRole+1).toString();
        const QColor color=state.startsWith('A')||state.startsWith("PROGRAM")?QColor("#f37e75"):state.startsWith('B')?QColor("#b38bea"):QColor("#64cde0");
        const QRect chip(r.x(),r.center().y()-12,46,24);p->setPen(QColor("#324d61"));p->setBrush(QColor("#1a3040"));p->drawRoundedRect(chip,3,3);
        p->setPen(color);p->setFont(QFont("Segoe UI",7,QFont::DemiBold));p->drawText(chip,Qt::AlignCenter,ext);
        const int tagWidth=state.isEmpty()?0:qMin(qMax(49,QFontMetrics(option.font).horizontalAdvance(state)+12),qMax(0,r.width()-64));const int badge=tagWidth?tagWidth+6:0;
        const QRect textRect=r.adjusted(58,0,-badge,0);p->setFont(option.font);p->setPen(QColor("#e4edf6"));p->drawText(textRect,Qt::AlignVCenter|Qt::AlignLeft,QFontMetrics(option.font).elidedText(name,Qt::ElideMiddle,textRect.width()));
        if(tagWidth){const QRect tag(r.right()-tagWidth,r.center().y()-10,tagWidth,20);p->setPen(color);p->drawText(tag,Qt::AlignCenter,QFontMetrics(option.font).elidedText(state,Qt::ElideRight,tagWidth));}
        p->restore();
    }
};
