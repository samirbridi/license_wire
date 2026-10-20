#pragma once
#include <QString>
int runSmoke(const QString& directory, const QString& resultPath);
int runTransportTests(const QString& directory, const QString& resultPath);
int runOutputTests(const QString& directory, const QString& resultPath);
int runGpuTests(const QString& directory, const QString& resultPath);
