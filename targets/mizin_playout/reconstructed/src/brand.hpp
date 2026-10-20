#pragma once
#include <QtWidgets>

// Original vector construction of the user-approved A monogram (2026-10-20).
inline void drawBrandMark(QPainter& painter,const QRectF& rect){
    painter.save();painter.setRenderHint(QPainter::Antialiasing);painter.translate(rect.topLeft());painter.scale(rect.width()/100.0,rect.height()/100.0);painter.setPen(Qt::NoPen);
    QLinearGradient teal(5,15,95,90);teal.setColorAt(0,QColor("#00e8ed"));teal.setColorAt(1,QColor("#00aeba"));painter.setBrush(teal);
    painter.drawPolygon(QPolygonF{{6,5},{50,30},{94,5},{94,90},{76,80},{76,33},{50,48},{24,33},{24,80},{6,90}});
    painter.setBrush(QColor("#00dbe4"));painter.drawPolygon(QPolygonF{{39,52},{68,69},{39,86}});painter.restore();
}
inline QIcon brandIcon(){QIcon icon;for(int size:{16,24,32,48,64,128,256}){QPixmap image(size,size);image.fill(Qt::transparent);QPainter p(&image);p.setRenderHint(QPainter::Antialiasing);p.setPen(Qt::NoPen);p.setBrush(QColor("#061525"));p.drawRoundedRect(QRectF(0,0,size,size),size*.18,size*.18);drawBrandMark(p,QRectF(size*.12,size*.12,size*.76,size*.76));p.end();icon.addPixmap(image);}return icon;}
class BrandMark final:public QWidget {
public:explicit BrandMark(QWidget* parent=nullptr):QWidget(parent){setObjectName("brandMark");setFixedSize(24,26);setAccessibleName("Mizin Playout");}
protected:void paintEvent(QPaintEvent*)override{QPainter p(this);drawBrandMark(p,QRectF(0,1,24,24));}
};
