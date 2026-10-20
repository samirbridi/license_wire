#pragma once
#include "network.hpp"
#include <QtWidgets>
#include <QMediaDevices>
#include <functional>

using Translate=std::function<QString(const QString&)>;
class AudioPanel final:public QFrame {
public:
    AudioPanel(NativeChannel* channel,QSettings* settings,QString id,Translate translate,bool demo,QWidget* parent=nullptr);
    void retranslate();
private:
    NativeChannel* channel_;
    QSettings* settings_;
    QString prefix_;
    Translate tx_;
    bool demo_;
    QLabel *title_,*volumeLabel_,*deviceLabel_,*hint_;
    QSlider* volume_;
    QCheckBox *mute_,*local_;
    QComboBox* devices_;
    QProgressBar *left_,*right_;
    float leftPeak_=0,rightPeak_=0;
    void refreshDevices();
};
class DigitalPanel final:public QFrame {
public:
    DigitalPanel(NetworkBus* bus,QSettings* settings,QString id,Translate translate,bool demo,QWidget* parent=nullptr);
    void retranslate();
private:
    NetworkBus* bus_;
    QSettings* settings_;
    QString prefix_;
    Translate tx_;
    bool demo_;
    QLabel *title_,*nameLabel_,*hint_,*status_;
    QLineEdit* name_;
    QCheckBox* audio_;
    QPushButton *ndi_,*omt_;
    void refresh();
};
