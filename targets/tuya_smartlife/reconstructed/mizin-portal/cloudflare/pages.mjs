export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')){
      if(url.origin!=='https://homecams.pages.dev')return new Response('Origem não autorizada.',{status:403});
      if(!env.GATEWAY)return Response.json({error:'A central ainda está em preparação.'},{status:503,headers:{'Cache-Control':'no-store'}});
      const headers=new Headers(request.headers);
      headers.set('x-homecams-client-ip',request.headers.get('cf-connecting-ip')??'');
      return env.GATEWAY.fetch(new Request(request,{headers}));
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Método indisponível.',{status:405});
    const result=await env.ASSETS.fetch(request),headers=new Headers(result.headers);
    headers.set('Cache-Control','no-cache');headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
    return new Response(result.body,{status:result.status,headers});
  }
};
