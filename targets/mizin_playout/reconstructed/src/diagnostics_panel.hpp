#pragma once
#include "routing_panels.hpp"

class DiagnosticsPanel final : public QWidget {
public:
    DiagnosticsPanel(Translate translate,std::function<QJsonObject()> report,bool demo,QWidget* parent=nullptr);
    void retranslate();
    void refresh();
    bool exportTo(const QString& path);
private:
    Translate tx_;
    std::function<QJsonObject()> report_;
    bool demo_;
    QLabel *heading_,*hint_,*ready_,*result_;
    QPushButton *refresh_,*export_;
    QTableWidget *channels_,*network_;
};
