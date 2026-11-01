// Envio de notificação para um pedido de abertura por placa (REV: build 0066).
//
// Este módulo NUNCA decide nada: só entrega um aviso "Abrir/Ignorar" aos assinantes (Web Push e/ou
// Telegram) para um pedido que plate-gate.mjs já criou como 'pending'. A resposta humana chega pelas
// rotas normais do portal (POST /api/gate/plate-requests/:id/confirm|ignore), nunca por aqui.
//
// Os dois canais recebem um "entregador" injetável (webPushSend, telegramSend) para ficar testável sem
// rede real, no mesmo padrão de spawnProcess em camera-archive.mjs. A falha de um canal, ou de um
// destinatário dentro de um canal, nunca derruba os outros nem o pedido em si: a notificação é
// best-effort, a fila de confirmação é a única fonte da verdade sobre o que foi decidido.

function plateLine(req) {
  return req.known ? `${req.vehicle.label} (${req.plateRaw || req.plate})` : `Placa não cadastrada: ${req.plateRaw || req.plate}`;
}

export function createPlateNotifier({
  webPushSend = null,     // async (subscription, jsonPayload) => void — injeta a lib real (web-push)
  telegramSend = null,    // async ({chatId, text, requestId}) => void — injeta a chamada HTTP à Bot API
  listPushSubscriptions = () => [],  // pode devolver array direto (testes) ou Promise<array> (store real em disco)
  listTelegramChats = () => [],
  onDeliveryError = () => {},
} = {}) {
  async function settleAll(items, task, channel) {
    const results = await Promise.allSettled(items.map(task));
    let delivered = 0;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') delivered++;
      else onDeliveryError({channel, recipient: items[i], error: result.reason});
    });
    return delivered;
  }

  return {
    // Chamado uma vez por pedido pending de verdade (request().deduped === false); nunca para uma
    // releitura deduplicada da mesma visita.
    async requestCreated(req) {
      let delivered = 0;
      if (webPushSend) {
        const title = req.known ? 'Confirmar abertura do portão' : 'Placa não cadastrada no portão';
        const payload = JSON.stringify({
          type: 'plate-request', id: req.id, title, body: `${plateLine(req)} no portão (${req.camera}). Abrir?`,
          plate: req.plate, known: req.known, camera: req.camera, expiresAt: req.expiresAt,
          actions: [{action: 'confirm', title: 'Abrir'}, {action: 'ignore', title: 'Ignorar'}],
        });
        delivered += await settleAll(await listPushSubscriptions(), sub => webPushSend(sub, payload), 'web-push');
      }
      if (telegramSend) {
        const seconds = Math.max(0, Math.round((req.expiresAt - req.createdAt) / 1000));
        const text = `🚪 ${plateLine(req)} no portão (${req.camera}).\nAbrir em até ${seconds}s?`;
        delivered += await settleAll(await listTelegramChats(), chatId => telegramSend({chatId, text, requestId: req.id}), 'telegram');
      }
      return {delivered};
    },
    // Chamado quando o pedido sai de pending (confirmado/ignorado/expirado), só para que os canais que
    // suportam isso possam fechar a notificação (ex: apagar os botões). Nunca aciona nada por si só.
    async requestDecided(req) {
      if (!webPushSend) return;
      const payload = JSON.stringify({type: 'plate-decided', id: req.id, status: req.status});
      await settleAll(await listPushSubscriptions(), sub => webPushSend(sub, payload), 'web-push');
    },
  };
}
