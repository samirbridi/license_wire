# Diagnóstico Xiaomi com operações de leitura fixas

Componente experimental separado do player. Aceita apenas a CW701 registrada neste alvo e a operação `device-info`. O corpo de leitura HL9200 tem fixture estática, mas sua transmissão permanece bloqueada até validar o encapsulamento nativo. Não inicia mídia nem implementa formatação, exclusão, alteração de posição ou movimento.

O programa usa a autorização já preservada da ponte, obtém uma sessão temporária Xiaomi e chama o transporte aberto go2rtc. Tokens, chaves de sessão e respostas completas não são impressos. Respostas de diagnóstico ficam em evidence/private. O retorno só é considerado positivo quando o comando de resposta esperado é recebido.

Compilação: `powershell -File scripts/build-readonly-probe.ps1 -RunId <identificador-unico>`, a partir deste alvo, após commit estruturado das fontes. A reserva de versão/build usa o mesmo mecanismo automático do aplicativo. O compilador e os caches ficam somente em runtime. O build preserva binários anteriores e emite recibo com SHA256; compilar não prova funcionamento na câmera.

Dependência de transporte: [go2rtc v1.9.15](https://github.com/AlexxIT/go2rtc/tree/v1.9.15), licença MIT. Os payloads próprios reconstroem fatos de protocolo identificados nas fontes; nenhum módulo JavaScript proprietário é executado ou incorporado ao aplicativo.
