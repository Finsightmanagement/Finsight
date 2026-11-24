(function(){
'use strict';
// Non-destructive type-anywhere search for existing native <select> dropdowns.
let popup=null, input=null, list=null, active=null;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s||'').toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
function close(){if(popup)popup.hidden=true;active=null;}
function matches(query){
 if(!active)return [];
 const terms=clean(query).split(/\s+/).filter(Boolean);
 return [...active.options].filter(o=>!o.disabled&&!o.hidden&&o.value!==''&&terms.every(t=>clean(o.textContent).includes(t))).slice(0,150);
}
function render(){
 const found=matches(input.value);
 list.innerHTML='';
 if(!found.length){list.innerHTML='<div style="padding:11px;opacity:.7">No matching items</div>';return;}
 for(const option of found){
  const item=document.createElement('button');item.type='button';item.style.cssText='display:block;width:100%;text-align:left;border:0;background:transparent;padding:9px 12px;cursor:pointer;color:inherit;font:inherit';
  item.textContent=option.textContent.trim();
  if(option.selected)item.style.fontWeight='700';
  item.addEventListener('pointerdown',e=>e.preventDefault());
  item.onclick=()=>{if(!active)return;const el=active;el.value=option.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));close();el.focus();};
  list.appendChild(item);
 }
}
function ensure(){
 if(popup)return;
 popup=document.createElement('div');
 popup.id='fsKeywordSelectPopup';popup.hidden=true;
 popup.style.cssText='position:fixed;z-index:2147483600;background:var(--card-bg,#fff);color:var(--text-color,#192337);border:1px solid #c7ced9;box-shadow:0 10px 32px #0002;border-radius:9px;overflow:hidden;max-height:65vh;display:flex;flex-direction:column';
 // 'display:flex' overrides browser [hidden]; explicitly hide with inline display.
 popup.style.display='none';
 input=document.createElement('input');input.type='search';input.placeholder='Search by any keyword…';input.setAttribute('aria-label','Search dropdown options');
 input.style.cssText='box-sizing:border-box;width:100%;padding:11px;border:0;border-bottom:1px solid #ddd;background:transparent;color:inherit;outline:none;font:inherit';
 list=document.createElement('div');list.style.cssText='overflow:auto;max-height:45vh';
 input.addEventListener('input',render);
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();close();active?.focus();return;}
  if(e.key==='Enter'){const b=list.querySelector('button');if(b){e.preventDefault();b.click();}}
 });
 popup.append(input,list);document.body.appendChild(popup);
}
function open(el,initial=''){
 if(!el||el.disabled||el.multiple||el.size>1||el.options.length<3||el.closest('#fsKeywordSelectPopup'))return false;
 ensure();active=el;input.value=initial;
 const rect=el.getBoundingClientRect(),width=Math.max(240,rect.width);
 popup.style.width=Math.min(width,window.innerWidth-16)+'px';
 popup.style.left=Math.min(Math.max(8,rect.left),window.innerWidth-Math.min(width,window.innerWidth-16)-8)+'px';
 popup.style.top=(rect.bottom+220<window.innerHeight?Math.min(rect.bottom+3,window.innerHeight-70):Math.max(8,rect.top-270))+'px';
 popup.hidden=false;popup.style.display='flex';render();input.focus();input.setSelectionRange(input.value.length,input.value.length);return true;
}
function isTypeKey(e){return e.key.length===1&&!e.ctrlKey&&!e.altKey&&!e.metaKey;}
document.addEventListener('keydown',e=>{
 if(e.target instanceof HTMLSelectElement&&isTypeKey(e)&&open(e.target,e.key)){e.preventDefault();e.stopPropagation();}
},true);
document.addEventListener('pointerdown',e=>{if(popup&&!popup.contains(e.target)&&e.target!==active)close()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)close()},true);
window.addEventListener('resize',close);
window.addEventListener('scroll',()=>{if(active)close()},true);
})();