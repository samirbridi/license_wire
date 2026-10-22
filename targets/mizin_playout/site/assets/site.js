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
