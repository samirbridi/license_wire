const origin='https://homecams.pages.dev';
const failure=(status,error)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
// Rotas autenticadas por segredo de máquina (vision-ingest-auth.mjs / secret_token do Telegram), nunca
// por sessão de navegador: plate-watcher.mjs (script no PC da GPU) e o Telegram em si nunca mandam um
// cabeçalho Origin igual ao site, então ficam isentas da checagem de Origin abaixo. A autenticação real
// delas acontece dentro do portal (server.mjs), não aqui -- este Worker só precisa deixar passar.
const MACHINE_AUTH_PATHS=new Set(['/api/vision/plate-event','/api/vision/telegram-webhook']);
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.origin!==origin)return failure(403,'Origem não autorizada.');
    if(!url.pathname.startsWith('/api/')||['/api/local-link','/api/remote-link'].includes(url.pathname))return failure(404,'Recurso indisponível.');
    if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(request.method))return failure(405,'Método indisponível.');
    if(!['GET','HEAD'].includes(request.method)&&!MACHINE_AUTH_PATHS.has(url.pathname)&&request.headers.get('origin')!==origin)return failure(403,'Origem não autorizada.');
    if(Number(request.headers.get('content-length')??0)>1048576)return failure(413,'Requisição muito grande.');
    if(!env.CENTRAL||!env.GATEWAY_TOKEN)return failure(503,'A central está desconectada.');
    const headers=new Headers();
    // x-vision-token e x-telegram-bot-api-secret-token: credenciais das duas rotas de máquina acima.
    // plate-event também aceita o token no corpo da requisição como alternativa (ver server.mjs), mas
    // o webhook do Telegram só manda o secret_token nesse cabeçalho -- sem ele aqui, 401 sempre.
    for(const name of ['cookie','content-type','origin','x-csrf-token','upgrade','sec-websocket-protocol','sec-websocket-key','sec-websocket-version','x-vision-token','x-telegram-bot-api-secret-token']){const v=request.headers.get(name);if(v)headers.set(name,v);}
    headers.set('x-mizin-gateway',env.GATEWAY_TOKEN);
    headers.set('x-forwarded-proto','https');
    headers.set('x-mizin-client-ip',request.headers.get('x-homecams-client-ip')??'');
    try{
      const result=await env.CENTRAL.fetch('http://homecams.pages.dev'+url.pathname+url.search,{method:request.method,headers,body:!['GET','HEAD'].includes(request.method)?request.body:undefined,redirect:'manual'});
      if(result.status===101)return result;
      if(result.status>=300&&result.status<400){await result.body?.cancel();return failure(502,'Resposta inesperada da central.');}
      const output=new Headers(result.headers);output.set('Cache-Control','no-store');output.set('X-Content-Type-Options','nosniff');
      return new Response(result.body,{status:result.status,headers:output});
    }catch{return failure(503,'A central está desconectada. Tente novamente em instantes.');}
  }
};
