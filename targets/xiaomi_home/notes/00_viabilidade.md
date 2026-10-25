# Viabilidade inicial — 2026-10-25

Evidência documental pública; compatibilidade do equipamento do usuário ainda não validada.

| Caminho | Evidência e limite | Próxima prova |
| --- | --- | --- |
| App próprio usando uma ponte local | go2rtc oferece uma fonte Xiaomi com suporte variável por modelo. A documentação exige internet para obter chaves a cada conexão e mantém a conexão de mídia local. [S1] | Uma câmera real na região China, com modelo e firmware conhecidos. |
| Acesso local sem nuvem | Não demonstrado. Precisamos verificar se o modelo oferece RTSP/ONVIF ou outra interface utilizável sem autenticação na nuvem. | Documentação específica e teste do dispositivo, sem modificar firmware nesta etapa. |
| Integração oficial Xiaomi no Home Assistant | O projeto oficial documenta que não disponibiliza vídeo da câmera. Isso não invalida implementações independentes. [S3] | Não usar essa integração como prova de obtenção do stream. |
| Google Home direto | Xiaomi documenta compatibilidade para produtos específicos, como a C300 global. Isso não prova suporte das variantes chinesas do usuário. [S4] | Identificar o modelo/região e testar o destino: celular, Nest Hub ou TV. |
| Google Home por ponte | Google tem CameraStream; Home Assistant documenta exposição de câmeras compatíveis ao Google Assistant. [S5, S6] | Validar formato, autenticação e reprodução real no destino escolhido. |
| SmartLife/Tuya | O SDK de app atende dispositivos Tuya-enabled; autorização de dispositivo e infraestrutura são próprias do ecossistema. Obter RTSP não demonstra que o SmartLife aceitará uma câmera Xiaomi. [S7, S8] | Encontrar uma rota suportada de gateway/produto antes de prometer essa integração. |

A lista mantida pelo go2rtc inclui modelos antigos e novos, com diferenças por firmware/protocolo. Ela é referência para triagem e não certificado de funcionamento. [S2]

## Sequência proposta

1. Identificar por imagens os modelos e firmwares; conservar cadastro na China.
2. Selecionar uma câmera e testar primeiro o caminho já implementado por projetos abertos ou uma interface nativa documentada.
3. Medir abertura do vídeo, continuidade e reconexão. Verificar se a autorização continua estável e quais operações ainda dependem da Xiaomi.
4. Com vídeo real comprovado, definir a ponte e implementar clientes Android/Windows, incluindo acesso externo autenticado.
5. Tratar Google Home como validação separada. Manter Tuya como possibilidade sem compromisso de compatibilidade.
6. Caso o suporte existente não cubra o aparelho, analisar uma cópia do APK/firmware fornecido pelo usuário, com hashes e ferramentas adequadas ao tipo de código.

Ainda não existe diagnóstico para a lentidão ou queda de login relatadas. Um cliente novo pode melhorar a interface e a reconexão; não garante corrigir uma dependência de autenticação ou limitação da câmera.
