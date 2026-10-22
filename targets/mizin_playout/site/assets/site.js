// Language: ?lang= → saved choice → browser language. Content carries both languages (lang="en"/"pt-BR").
(function(){
  const supported=["en","pt-BR"];
  const param=new URLSearchParams(location.search).get("lang");
  let saved=null;try{saved=localStorage.getItem("mizin-lang");}catch(_){}
  const browser=(navigator.language||"en").toLowerCase().startsWith("pt")?"pt-BR":"en";
  const pick=supported.includes(param)?param:supported.includes(saved)?saved:browser;
  function apply(lang){
    document.documentElement.dataset.lang=lang;document.documentElement.lang=lang;
    document.querySelectorAll(".lang button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.lang===lang)));
    const title=document.querySelector("meta[name='title-"+lang+"']");if(title)document.title=title.content;
    const desc=document.querySelector("meta[name='description']");const d=document.querySelector("meta[name='description-"+lang+"']");if(desc&&d)desc.content=d.content;
    document.querySelectorAll("img[data-src-en]").forEach(img=>{img.src=img.dataset["src"+(lang==="en"?"En":"Pt")];});
  }
  document.querySelectorAll(".lang button").forEach(b=>b.addEventListener("click",()=>{try{localStorage.setItem("mizin-lang",b.dataset.lang);}catch(_){}apply(b.dataset.lang);}));
  apply(pick);
})();

// What's new: rendered from assets/changelog.json (newest first), in both languages.
(async function(){
  const box=document.getElementById("releases");if(!box)return;
  try{const r=await fetch("assets/changelog.json",{cache:"no-store"});if(!r.ok)return;const list=await r.json();
    list.forEach((item,index)=>{const card=document.createElement("article");card.className="release";
      const head=document.createElement("header");const title=document.createElement("h3");title.textContent=item.version;head.append(title);
      if(index===0){const badge=document.createElement("span");badge.className="latest";badge.innerHTML='<span lang="en">LATEST</span><span lang="pt-BR">ATUAL</span>';head.append(badge);}
      if(item.date){const time=document.createElement("time");time.dateTime=item.date;time.textContent=item.date;head.append(time);}
      card.append(head);
      for(const lang of ["en","pt-BR"]){const ul=document.createElement("ul");ul.lang=lang;for(const line of (item.notes&&item.notes[lang])||[]){const li=document.createElement("li");li.textContent=line;ul.append(li);}card.append(ul);}
      box.append(card);});
  }catch(_){}
})();

// Downloads: links are baked into the page; assets/release.json (same origin, written by
// scripts/site.py at deploy time from the validated package) refreshes them.
(async function(){
  try{
    const r=await fetch("assets/release.json",{cache:"no-store"});if(!r.ok)return;const release=await r.json();
    for(const kind of ["setup","portable"]){const a=release.artifacts&&release.artifacts[kind];if(!a)continue;
      document.querySelectorAll("[data-download='"+kind+"']").forEach(el=>{el.href=a.url;});
      document.querySelectorAll("[data-sha='"+kind+"']").forEach(el=>{el.textContent="SHA-256 "+a.sha256;});
      document.querySelectorAll("[data-size='"+kind+"']").forEach(el=>{el.textContent=(a.bytes/1e6).toFixed(1)+" MB";});}
    document.querySelectorAll("[data-version]").forEach(el=>{el.textContent=release.version;});
  }catch(_){/* Static links stay. */}
})();

// Screenshots open in an in-page viewer (no new tab): Esc / click outside / × close, arrows browse.
(function(){
  const shots=[...document.querySelectorAll(".shot img")];if(!shots.length)return;
  const pt=()=>document.documentElement.dataset.lang==="pt-BR";
  const box=document.createElement("dialog");box.className="lightbox";
  box.innerHTML='<button class="lb-close" type="button">×</button><button class="lb-prev" type="button">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="lb-next" type="button">›</button>';
  document.body.append(box);
  const image=box.querySelector("img"),caption=box.querySelector("figcaption"),prev=box.querySelector(".lb-prev"),next=box.querySelector(".lb-next"),close=box.querySelector(".lb-close");
  let current=0;
  const visible=()=>shots.filter(img=>img.offsetParent!==null);
  function show(index){
    const list=visible();if(!list.length)return;current=(index+list.length)%list.length;const img=list[current];
    image.src=img.currentSrc||img.src;image.alt=img.alt||"";caption.textContent=(current+1)+" / "+list.length;
    prev.hidden=next.hidden=list.length<2;
    close.setAttribute("aria-label",pt()?"Fechar":"Close");prev.setAttribute("aria-label",pt()?"Anterior":"Previous");next.setAttribute("aria-label",pt()?"Próxima":"Next");
  }
  function open(img){show(visible().indexOf(img));if(!box.open)box.showModal();document.body.classList.add("lb-open");}
  function shut(){if(box.open)box.close();}
  box.addEventListener("close",()=>document.body.classList.remove("lb-open"));
  shots.forEach(img=>{img.style.cursor="zoom-in";img.tabIndex=0;img.setAttribute("role","button");
    img.title=pt()?"Clique para ampliar":"Click to enlarge";
    img.addEventListener("click",()=>open(img));img.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(img);}});});
  close.addEventListener("click",shut);prev.addEventListener("click",e=>{e.stopPropagation();show(current-1);});next.addEventListener("click",e=>{e.stopPropagation();show(current+1);});
  box.addEventListener("click",e=>{if(e.target===box||e.target.tagName==="FIGURE")shut();});
  box.addEventListener("keydown",e=>{if(e.key==="ArrowLeft")show(current-1);else if(e.key==="ArrowRight")show(current+1);});
  let startX=null;box.addEventListener("touchstart",e=>{startX=e.touches[0].clientX;},{passive:true});
  box.addEventListener("touchend",e=>{if(startX===null)return;const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)>50)show(current+(dx<0?1:-1));startX=null;});
})();
