import { createHmac, timingSafeEqual } from 'node:crypto';
import { catalog, fail } from './licensing.mjs';

export function stripeEvent(raw, signature, secret, now = Date.now()) {
  const entries = (signature || '').split(',').map(x => x.trim().split('='));
  const stamp = entries.find(([key]) => key === 't')?.[1];
  if (!/^\d+$/.test(stamp) || Math.abs(now/1000-Number(stamp)) > 300) fail('Assinatura expirada.',400);
  const expected = createHmac('sha256',secret).update(stamp+'.').update(raw).digest();
  if (!entries.some(([key,value]) => key === 'v1' && /^[\da-f]{64}$/.test(value) && timingSafeEqual(expected,Buffer.from(value,'hex')))) fail('Assinatura inválida.');
  return JSON.parse(raw);
}

export async function stripeCheckout(order, secret, origin) {
  const offer = catalog.offers.find(x => x.id === order.offer);
  const action = {buy:'Licença',expand:'Máquinas adicionais',renew:'Atualizações'}[order.action];
  const form = new URLSearchParams({
    mode:'payment', success_url:origin+'/?pedido='+order.id, cancel_url:origin+'/?cancelado=1',
    'metadata[mizin_order]':order.id, 'line_items[0][quantity]':'1',
    'line_items[0][price_data][currency]':catalog.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]':String(order.total),
    'line_items[0][price_data][product_data][name]':action+' · '+offer.name+' · '+order.quantity+' máquina(s)'
  });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions',{
    method:'POST',headers:{Authorization:'Bearer '+secret,'Idempotency-Key':order.id},body:form,signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) fail('Checkout indisponível. Tente novamente.',502);
  const session = await response.json();
  return {url:session.url,expires:session.expires_at};
}

export function fulfillStripe(store, event, live) {
  if (!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) return;
  const session = event.data.object;
  if (event.livemode !== live || session.mode !== 'payment' || session.payment_status !== 'paid' || !session.metadata?.mizin_order) return;
  store.settle(session.metadata.mizin_order,session.amount_total,session.currency.toUpperCase());
}
