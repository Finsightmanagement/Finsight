(function(){
'use strict';
// Keyword search is rendered inside the selected field, never in a global popup.
const normalize=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
let active=null;
function excluded(el){return !!el.closest('#stock-take-clerk,#stock12body,#stock12form,#stockApprovalQueue12,#fsKeywordCellEditor,[data-fs-draft-ui]');}
function close(focus=false){
 if(!active)return;
 const {select,wrap,editor}=active;
 if(wrap.parentNode){wrap.parentNode.insertBefore(select,wrap);wrap.remove();}
 select.style.display='';
 active=null;
 if(focus)select.focus();
}
function open(select,first=''){
 if(!(select instanceof HTMLSelectElement)||select.disabled||select.multiple||select.size>1||excluded(select)||select.options.length<3)return false;
 if(active?.select===select){active.input.value+=first;render();return true;}
 close();
 const rect=select.getBoundingClientRect();
 const wrap=document.createElement('span');wrap.id='fsKeywordCellEditor';
 wrap.style.cssText='position:relative;display:inline-block;vertical-align:middle;width:100%;min-width:0';
 select.before(wrap);wrap.appendChild(select);
 select.style.display='none';
 const editor=document.createElement('div');editor.style.cssText='position:relative;width:100%;z-index:1000';
 const input=document.createElement('input');input.type='search';input.className=select.className;
 input.placeholder='Search items…';input.setAttribute('aria-label','Search '+(select.getAttribute('aria-label')||'dropdown'));
 input.style.cssText='box-sizing:border-box;width:100%;min-height:'+Math.max(32,rect.height)+'px';
 const menu=document.createElement('div');
 menu.style.cssText='position:absolute;top:100%;left:0;width:100%;max-height:225px;overflow-y:auto;overscroll-behavior:contain;background:var(--card,#fff);color:var(--text,#172033);border:1px solid #cbd5e1;border-radius:0 0 8px 8px;box-shadow:0 9px 24px #0002;z-index:1001';
 editor.append(input,menu);wrap.appendChild(editor);
 active={select,wrap,editor,input,menu};
 input.value=first;render();input.focus();input.setSelectionRange(input.value.length,input.value.length);
 input.addEventListener('input',render);
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();close(true)}
  else if(e.key==='Enter'){e.preventDefault();const first=menu.querySelector('button');if(first)first.click();}
  else if(e.key==='Tab')close();
 });
 return true;
}
function render(){
 if(!active)return;
 const {select,input,menu}=active;
 const words=normalize(input.value).split(/\s+/).filter(Boolean);
 const options=[...select.options].filter(o=>!o.disabled&&!o.hidden&&o.value!==''&&words.every(w=>normalize(o.textContent).includes(w))).slice(0,120);
 menu.replaceChildren();
 if(!options.length){const msg=document.createElement('div');msg.textContent='No matching items';msg.style.padding='10px';menu.append(msg);return;}
 for(const option of options){
  const row=document.createElement('button');row.type='button';row.textContent=option.textContent.trim();
  row.style.cssText='display:block;width:100%;padding:9px 11px;border:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer';
  row.onpointerdown=e=>e.preventDefault();
  row.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));close();};
  menu.append(row);
 }
}
document.addEventListener('keydown',e=>{
 if(e.target instanceof HTMLSelectElement&&e.key.length===1&&!e.altKey&&!e.ctrlKey&&!e.metaKey){
  if(open(e.target,e.key)){e.preventDefault();e.stopPropagation();}
 }
},true);
document.addEventListener('pointerdown',e=>{if(active&&!active.wrap.contains(e.target))close()},true);
document.addEventListener('focusin',e=>{if(active&&!active.wrap.contains(e.target))close()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)close()},true);
window.addEventListener('resize',()=>close());
})();
