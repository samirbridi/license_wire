# Diagnóstico local do Wi-Fi — 2026-10-27

O proprietário informou o IP `192.168.1.119` para o GWM ORA 5. A identidade do equipamento nesse endereço ainda não foi confirmada. Evidência: [`../evidence/lan-192.168.1.119-20261027.json`](../evidence/lan-192.168.1.119-20261027.json).

## Resultado observado

- Este computador: Ethernet `192.168.1.30/24`, gateway `192.168.1.1`. A interface Wi-Fi física do computador estava desconectada; isso não impede comunicação Ethernet/Wi-Fi se a LAN permitir.
- O sandbox bloqueou inicialmente os sockets TCP com `EACCES`. Isso é uma restrição do ambiente de execução, sem valor para identificar serviços no carro.
- Repetição com permissão de rede: dois pings sem resposta, tentativas TCP em 80 e 443 com timeout de 2500 ms e nenhuma entrada ARP para o destino.
- Nenhuma comunicação bem-sucedida, identidade, porta aberta ou acesso à central foi confirmado. Timeout não equivale a porta fechada. Não se conclui que o veículo esteja desligado.
- Somente esse IP foi testado. Não houve varredura da sub-rede, payload de aplicação TCP, autenticação, acesso à conta My GWM, comando veicular, instalação ou gravação de firmware/configuração.

## Comandos executados

Diretório: `D:\REA - ENGENHARIA REVERSA`. Windows PowerShell; executáveis locais.

Inventário inicial: `Get-NetIPConfiguration` e `Get-NetNeighbor -IPAddress 192.168.1.119` encontraram restrições de acesso CIM. O fallback foi:

```powershell
ipconfig.exe
arp.exe -a 192.168.1.119
route.exe print 192.168.1.119
```

`route print` foi filtrado pelo destino exato e não representa a tabela de rotas completa.

O teste abaixo foi executado primeiro com timeout TCP de 2000 ms no sandbox (resultado `EACCES`) e depois com 2500 ms fora da restrição de rede (resultado `timeout`). A repetição completa foi:

```powershell
ping.exe -n 2 -w 1000 192.168.1.119
node.exe -e 'const net=require("node:net"); Promise.all([80,443].map(port=>new Promise(resolve=>{const s=new net.Socket();let done=false;const finish=result=>{if(done)return;done=true;s.destroy();resolve({host:"192.168.1.119",port,...result})};s.setTimeout(2500);s.once("connect",()=>finish({status:"open"}));s.once("timeout",()=>finish({status:"timeout"}));s.once("error",e=>finish({status:"error",code:e.code}));s.connect(port,"192.168.1.119")}))).then(r=>console.log(JSON.stringify({timestamp:new Date().toISOString(),probes:r})))'
arp.exe -a 192.168.1.119
```

## Estado Atual e Próximos Passos

1. Confirmar modelo/ano e que o veículo esteja estacionado em P, com a central ligada.
2. Conferir o IP atual nas configurações Wi-Fi da central e a associação/lease ativa no roteador. Um lease antigo não confirma que o cliente esteja conectado agora.
3. Conferir se central e computador pertencem à mesma LAN e se existe isolamento de clientes, rede de convidados ou VLAN.
4. Quando houver conectividade e identidade confirmadas, identificar serviços com consultas limitadas de leitura. O resultado desta etapa não autoriza afirmar que exista API local ou ADB.
5. O REA/Ghidra poderá analisar um APK, firmware obtido legitimamente ou cliente/protocolo identificado. Nenhum novo binário foi recebido ou extraído; por isso não houve análise REA nesta sessão nem novos hashes em `binaries/SHA256SUMS.txt`.
6. Eventuais funções adicionais dependem da central, versão e interfaces realmente disponíveis. Priorizar integrações de leitura e recursos da multimídia; alterações em sistemas de condução/segurança não fazem parte deste diagnóstico.

Há um cliente My GWM preexistente no alvo. A existência desse código e os testes históricos de gateway não comprovam autenticação do proprietário nem leitura real deste veículo. Nenhuma credencial local foi aberta nesta sessão.

## Referências oficiais consultadas

- [ORA 5 — GWM Brasil](https://www.gwmmotors.com.br/pt/modelos/ora5): central Coffee OS3, conexão Wi-Fi compartilhada e conectividade remota pelo aplicativo. A página não estabelece uma API de administração acessível pela LAN.
- [Serviços conectados — GWM Brasil](https://www.gwmmotors.com.br/pt/servicos/servicos-conectados): recursos sujeitos ao modelo, versão e ano. Não é evidência da disponibilidade de um serviço no IP informado.
