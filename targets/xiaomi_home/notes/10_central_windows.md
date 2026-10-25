# Central Windows e cliente responsivo

Em 2026-10-25 o proprietário confirmou que pode manter um Windows ligado na rede das câmeras. A central fica responsável pela ponte Xiaomi, conversão de vídeo e sessões dos clientes.

## Implementação e evidência

- Serviço Node.js sem dependências npm, restrito a `127.0.0.1:19845`.
- Painel das seis câmeras, prévias sob demanda, filtros por família, qualidade e reconexão limitada.
- Sessão própria por cookie HttpOnly/SameSite=Strict, tokens persistidos somente como hash e autorização por link de uso único. API de mídia exige sessão. Operações de sessão exigem origem e CSRF, conforme o endpoint.
- Nenhuma senha, token Xiaomi, IP ou ID da conta é enviado ao cliente. O cliente recebe apenas identificador interno e nome de exibição da câmera.
- Vídeo H.265 da ponte convertido para H.264, sem áudio, por FFmpeg/libx264 em CPU. Um vídeo por sessão e até dois clientes de vídeo. Prévias têm fila de dois processos, cache de até 60 segundos e permanecem apenas na memória do serviço/navegador.
- Mi 2K reproduzida no navegador a 1280×720, readyState 4, tempo avançando de 17,6844 para 62,4926 segundos; AW300 a 640×360, readyState 4 e 81,2357 segundos. Ver recibo sanitizado de QA para resultados finais.
- Capturas de aprovação do painel, quando geradas, ficam exclusivamente em `evidence/private/`, por conterem imagens das câmeras.

## Próxima etapa remota

Proposta inicial pesquisada: Tailscale Personal e Serve. O usuário recusou esta opção e confirmou link/login sem VPN no Android; o desenho atual com Cloudflare está na nota 11. Nenhuma conta Tailscale foi criada; nenhuma rota foi publicada. Os comandos abaixo são registro da pesquisa inicial, não plano de execução atual.

Fontes oficiais consultadas: [preços](https://tailscale.com/pricing), [Serve](https://tailscale.com/docs/features/tailscale-serve), [CLI Serve](https://tailscale.com/docs/reference/tailscale-cli/serve), [Android](https://tailscale.com/docs/install/android), [Windows sem usuário conectado](https://tailscale.com/docs/how-to/run-unattended).

Antes de ativar: instalar a distribuição oficial com assinatura conferida, proprietário autenticar Windows e Android, examinar rotas Serve existentes, configurar origem HTTPS explícita e confiança no proxy no aplicativo, validar sessão/CSRF/cookie Secure e somente então encaminhar HTTPS para a central. O servidor atual recusa proxy e acesso externo por padrão. Não basta executar Serve com a versão local atual.

Comandos candidatos, sujeitos à configuração efetiva e preservando qualquer rota existente:

```powershell
$xiaomiTailscale = 'C:\Program Files\Tailscale\tailscale.exe'
& $xiaomiTailscale status
& $xiaomiTailscale serve status --json
& $xiaomiTailscale set --unattended=true
& $xiaomiTailscale serve --bg --https=443 http://127.0.0.1:19845
& $xiaomiTailscale serve status
```

Se 443 estiver em uso, escolher porta HTTPS alternativa; não resetar configurações existentes. Não usar Funnel, redirecionamento de portas do roteador, subnet router nem exit node para este protótipo. A emissão de certificado HTTPS envolve consentimento DNS/certificado. Inicialização automática da central/ponte é uma etapa separada do modo unattended do Tailscale.

## Limites

Layout móvel não comprova execução no Android físico. O cliente desta etapa é web responsivo; APK/EXE empacotados, acesso remoto, estabilidade por dias, expiração/renovação Xiaomi, áudio, controles e demais sensores Outdoor Pro permanecem pendentes. Google Home e Tuya/SmartLife continuam investigações próprias. O acesso nativo ainda depende da nuvem Xiaomi para obter chaves em reconexões.
