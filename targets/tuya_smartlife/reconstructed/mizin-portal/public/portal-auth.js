(async()=>{
 const remote=location.hostname==='homecams.pages.dev';
 function start(){for(const src of ['app.js','camera-archive.js']){const script=document.createElement('script');script.src=src;script.async=false;document.body.append(script);}}
 if(!remote){start();return;}
 window.MIZIN_PRIVATE_GATEWAY=true;
 const original=window.fetch.bind(window);
 async function session(){const response=await original('/api/session',{cache:'no-store'});if(!response.ok)return false;const data=await response.json();window.MIZIN_CSRF=data.csrf;return!!data.csrf;}
 function protectFetch(){window.fetch=(url,options={})=>{const target=new URL(typeof url==='string'?url:url.url,location.href);if(target.origin===location.origin&&target.pathname.startsWith('/api/')){const headers=new Headers(options.headers);headers.set('X-CSRF-Token',window.MIZIN_CSRF);options={...options,headers};}return original(url,options);};}
 try{if(await session()){protectFetch();start();return;}}catch{}
 const panel=document.createElement('dialog');panel.style.cssText='max-width:420px;width:90%;padding:28px;border:1px solid #334155;border-radius:20px;background:#0b1120;color:#e2e8f0;font-family:Outfit,sans-serif';
 const heading=document.createElement('h2');heading.textContent='Conectar ao Mizin Home';
 const help=document.createElement('p');help.textContent='Use o link de acesso gerado pelo seu NAS, ou cole o código desse link. Ele fica na pasta privada da instalação, em owner-remote-access.json.';
 const input=document.createElement('input');input.type='password';input.autocomplete='off';input.placeholder='Código de acesso';input.setAttribute('aria-label','Código de acesso');input.style.cssText='box-sizing:border-box;width:100%;padding:14px;background:#172033;color:white;border:1px solid #475569;border-radius:10px';
 const button=document.createElement('button');button.textContent='Conectar';button.style.cssText='margin-top:16px;padding:12px 24px;border:0;border-radius:10px;background:#3b82f6;color:white;cursor:pointer';
 const message=document.createElement('p');message.setAttribute('role','status');panel.append(heading,help,input,button,message);document.body.append(panel);panel.showModal();
 const pair=new URLSearchParams(location.hash.slice(1)).get('pair');if(pair){input.value=pair;history.replaceState(null,'',location.pathname+location.search);}
 button.onclick=async()=>{button.disabled=true;message.textContent='Conectando…';try{let code=input.value.trim();if(code.includes('#pair='))code=new URLSearchParams(code.split('#')[1]).get('pair');const response=await original('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});if(!response.ok){const data=await response.json();throw new Error(data.error||'Não foi possível conectar.');}if(!await session())throw new Error('Sessão não confirmada.');panel.close();panel.remove();protectFetch();start();}catch(error){message.textContent=error.message;}finally{button.disabled=false;}};
 input.onkeydown=event=>{if(event.key==='Enter')button.click();};if(pair)button.click();
})();
