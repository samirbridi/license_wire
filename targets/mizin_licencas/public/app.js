'use strict';
const $ = id => document.getElementById(id);
const money = cents => (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = value => value.split('-').reverse().join('/');
const escapeHtml = value => String(value).replace(/[&<>"']/g,ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let state, account, currentPage, formAction;
const plan = id => state.catalog.offers.find(x => x.id === id);
const product = id => state.catalog.products.find(x => x.id === id);
function notify(message) {
  $('message').textContent = message;
  $('message').hidden = !message;
}
async function api(url, data) {
  const response = await fetch('/api/'+url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Serviço indisponível.');
  return result;
}
function dialog(title,fields,label,action) {
  $('modalTitle').textContent=title;
  $('fields').innerHTML=fields;
  $('submit').textContent=label;
  $('switch').hidden=true;
  $('error').textContent='';
  formAction=action;
  if (!$('modal').open) $('modal').showModal();
}
$('close').onclick=()=>$('modal').close();
$('form').onsubmit=async event=>{
  event.preventDefault();
  $('submit').disabled=true;
  try {await formAction();} catch(error) {$('error').textContent=error.message;}
  finally {$('submit').disabled=false;}
};
function signIn(next,create=false) {
  dialog(create?'Criar conta':'Entrar na central',
    '<label>E-mail<input id="email" type="email" required autocomplete="email"></label><label>Senha<input id="pass" type="password" required autocomplete="'+(create?'new-password':'current-password')+'" minlength="'+(create?12:1)+'"></label>',
    create?'Criar conta':'Entrar',async()=>{
      const result=await api(create?'register':'login',{email:$('email').value,password:$('pass').value});
      state.email=result.email;
      $('login').textContent='Sair';
      $('modal').close();
      await next();
    });
  $('switch').hidden=false;
  $('switch').textContent=create?'Já tenho conta':'Criar uma conta';
  $('switch').onclick=()=>signIn(next,!create);
}
function header(page,title,intro) {
  currentPage=page;
  $('shop').setAttribute('aria-current',page==='shop'?'page':'false');
  $('library').setAttribute('aria-current',page==='library'?'page':'false');
  $('title').textContent=title;
  $('intro').textContent=intro;
}
function shop() {
  header('shop','Loja de software','Escolha os produtos e a quantidade de máquinas para o seu estúdio.');
  $('content').innerHTML='<h2>Catálogo</h2><div class="grid">'+state.catalog.offers.map(p=>{
    const items=p.items.map(product);
    const detail=items.length>1?items.map(i=>i.name).join(' · '):items[0].terms===null?'Atualizações incluídas por tempo indeterminado.':items[0].terms+' meses de atualizações incluídos.';
    return '<article class="card"><p class="kind">'+escapeHtml(items.length>1?'Pacote de programas e plugins':items[0].kind)+'</p><h3>'+escapeHtml(p.name)+'</h3><p class="detail">'+escapeHtml(detail)+'</p><div class="bottom"><span class="price">'+money(p.price)+'</span><button data-buy="'+escapeHtml(p.id)+'">Configurar licença</button></div></article>';
  }).join('')+'</div>';
}
async function library() {
  if (!state.email) return signIn(library);
  account=await api('account');
  header('library','Minhas licenças',state.email);
  const cards=account.licenses.map(l=>{
    const terms=Object.entries(l.rights).map(([id,r])=>'<li>'+escapeHtml(product(id).name)+' · '+(r.until?'versões até '+date(r.until):'atualizações sem prazo')+'</li>').join('');
    const devices=l.devices.map(d=>'<div class="row"><span>'+escapeHtml(d.label)+'</span><button data-free="'+d.device+'" data-serial="'+l.serial+'">Liberar máquina</button></div>').join('');
    const renewable=Object.values(l.rights).some(r=>r.months>0);
    return '<article class="panel"><div class="row"><h3>'+escapeHtml(plan(l.offer).name)+'</h3><span>'+l.devices.length+' de '+l.seats+' máquinas em uso</span></div><p><code>'+l.serial+'</code></p><ul>'+terms+'</ul>'+devices+'<div class="actions"><button data-expand="'+l.serial+'">Adicionar máquinas</button>'+(renewable?'<button data-renew="'+l.serial+'">Renovar atualizações</button>':'')+'</div></article>';
  });
  const orders=account.orders.map(o=>'<div class="row"><span>'+escapeHtml(plan(o.offer).name)+' · '+({buy:'Compra',expand:'Máquinas',renew:'Atualizações'}[o.action])+'</span><span>'+money(o.total)+' · '+(o.paid?'Pago':'Pendente')+'</span>'+(!o.paid?'<button data-pay="'+o.id+'">'+ (state.sandbox?'Simular pagamento':'Retomar checkout') +'</button>':'')+'</div>').join('');
  $('content').innerHTML='<div class="stack">'+(cards.join('')||'<div class="panel"><h3>Nenhuma licença nesta conta</h3><p>Os seriais aparecem aqui após a confirmação do pagamento.</p><button data-catalog>Ver catálogo</button></div>')+'</div>'+(orders?'<section class="orders"><h2>Pedidos</h2><div class="panel">'+orders+'</div></section>':'');
}
function payment(id,total) {
  dialog('Confirmar pagamento de teste','<p>Pedido de homologação no valor de <strong>'+money(total)+'</strong>. Nenhum valor será cobrado.</p>','Simular pagamento',async()=>{
    await api('test-payment',{id});
    $('modal').close();
    await library();
    notify('Pagamento de teste confirmado. Sua licença está disponível.');
  });
}
function configure(offerId,action='buy',license=null) {
  if (!state.email) return signIn(()=>configure(offerId,action,license));
  const p=plan(offerId);
  const terms=p.items.map(id=>{
    const item=product(id);
    const months=license?license.rights[id].months:item.terms;
    return '<li>'+escapeHtml(item.name)+' · '+(months===null?'atualizações sem prazo':months+' meses de atualizações')+'</li>';
  }).join('');
  const renew=action==='renew';
  let requestId=crypto.randomUUID();
  dialog(({buy:'Configurar licença',expand:'Adicionar máquinas',renew:'Renovar atualizações'})[action],
    '<h3>'+escapeHtml(p.name)+'</h3><p>Licença perpétua</p><ul>'+terms+'</ul><label>'+(action==='expand'?'Máquinas adicionais':'Máquinas')+'<input id="qty" type="number" min="1" max="'+(renew?license.seats:100)+'" required value="'+(renew?license.seats:1)+'" '+(renew?'readonly':'')+'></label><p id="quote"></p>',
    state.sandbox?'Criar pedido de teste':'Ir para pagamento',async()=>{
      const o=await api('orders',{offer:p.id,quantity:Number($('qty').value),action,serial:license?.serial,requestId});
      if (o.paid) {$('modal').close(); return library();}
      if (o.checkout) {location.assign(o.checkout);return;}
      payment(o.id,o.total);
    });
  function quote() {
    const q=Number($('qty').value);
    const tier=state.catalog.tiers.filter(t=>q>=t.from).at(-1);
    $('quote').textContent=tier?'Total '+money(Math.round((renew?p.renew:p.price)*q*(100-tier.discount)/100))+(tier.discount?' · '+tier.discount+'% de desconto':''):'Selecione a quantidade.';
  }
  $('qty').oninput=()=>{requestId=crypto.randomUUID();quote();};
  quote();
}
$('content').onclick=async event=>{
  const b=event.target.closest('button');
  if (!b) return;
  const d=b.dataset;
  try {
    if ('catalog' in d) return shop();
    if (d.buy) return configure(d.buy);
    if (d.expand || d.renew) {
      const l=account.licenses.find(x=>x.serial===(d.expand||d.renew));
      return configure(l.offer,d.expand?'expand':'renew',l);
    }
    if (d.pay) {
      const order = await api('resume-order',{requestId:d.pay});
      if (order.paid) return library();
      if (order.checkout) return location.assign(order.checkout);
      return payment(order.id,order.total);
    }
    if (d.free) dialog('Liberar máquina','<p>A vaga ficará disponível para outra instalação. A autorização offline anterior continua válida até o vencimento.</p>','Liberar vaga',async()=>{
      await api('release-machine',{serial:d.serial,device:d.free});
      $('modal').close();await library();
    });
  } catch(error) {notify(error.message);}
};
$('shop').onclick=()=>{notify('');shop();};
$('library').onclick=()=>library().catch(e=>notify(e.message));
$('login').onclick=async()=>{
  if (!state.email) return signIn(library);
  try {await api('logout',{});location.assign('/');} catch(e) {notify(e.message);}
};
async function init() {
  state=await api('catalog');
  $('environment').textContent=state.sandbox?'Homologação local · Preços demonstrativos e pagamentos simulados':state.test?'Homologação · Stripe em modo de teste':'Loja Mizin';
  $('login').textContent=state.email?'Sair':'Entrar';
  shop();
  const params=new URLSearchParams(location.search);
  if (params.has('pedido')) {
    await library();
    if (state.email) notify(account.orders.find(o=>o.id===params.get('pedido'))?.paid?'Pagamento confirmado.':'Aguardando confirmação do pagamento. Consulte Minhas licenças para atualizar.');
  } else if (params.has('cancelado')) notify('Checkout cancelado.');
  else if (plan(params.get('produto'))) configure(params.get('produto'));
}
init().catch(e=>notify(e.message));
