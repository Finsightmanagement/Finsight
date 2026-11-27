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


/* Global master-data dropdown enhancements.
   Only new-entry forms are normalized; never blank existing saved records. */
(function(){
'use strict';
const terms={
 account:{placeholder:'Select account',actions:['add account','new account','create account']},
 supplier:{placeholder:'Select supplier',actions:['add supplier','new supplier','create supplier']},
 item:{placeholder:'Select item',actions:['add item','new item','create item']},
 category:{placeholder:'Select category',actions:['add category','new category','create category']},
 department:{placeholder:'Select department',actions:['add department','new department','create department']},
 employee:{placeholder:'Select employee',actions:['add employee','new employee','create employee']},
 bank:{placeholder:'Select bank',actions:['add bank','new bank','create bank']}
};
const clean=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
const entryRe=/\b(new|add|create|post|batch|record|entry|purchase|bill|sales|cheque|transfer|deposit|journal|expense|payment|advance)\b/i;
const editingRe=/\b(edit|update|amend|view|details|history|filter|search|report|statement|reconcil)\b/i;
function context(el){
 const root=el.closest('dialog,[role="dialog"],.modal,.modal-content,form,section,.page-section,.tab-panel')||el.parentElement;
 const heading=root?.querySelector('h1,h2,h3,h4,.modal-title,.section-title')?.textContent||'';
 return {root,heading:clean(heading)};
}
function fieldName(sel){
 const label=sel.labels?.[0]?.textContent||document.querySelector('label[for="'+CSS.escape(sel.id||'__none__')+'"]')?.textContent||'';
 return clean([label,sel.getAttribute('aria-label'),sel.name,sel.id,sel.closest('.field,.form-group')?.querySelector('label')?.textContent].filter(Boolean).join(' '));
}
function kind(sel){
 const s=fieldName(sel);
 if(/payment method|payment type|account type|account subtype|employment type|item type|status|station|role|tax|currency/.test(s))return null;
 return Object.keys(terms).find(k=>new RegExp('\\b'+k+'s?\\b','i').test(s))||null;
}
function valid(sel){
 if(!(sel instanceof HTMLSelectElement)||sel.multiple||sel.disabled||sel.closest('[data-fs-draft-ui],#fsKeywordCellEditor,#stock-take-clerk,#stock12body,#stock12form,#stockApprovalQueue12'))return false;
 if(sel.closest('[data-fs-quick-add]'))return false;
 const {heading,root}=context(sel);
 if(editingRe.test(heading))return false;
 if(root?.querySelector('[data-mode="edit"],input[name="record_id"][value]:not([value=""])'))return false;
 return true;
}
function placeholder(sel){
 if(sel.dataset.fsSelectInit==='1'||!valid(sel))return;
 const {heading}=context(sel);
 // Only reset new-entry dropdowns. Existing edits, historical records and filters stay intact.
 if(!entryRe.test(heading))return;
 const name=kind(sel);
 const defaultText=terms[name]?.placeholder||'Select';
 let blank=[...sel.options].find(o=>o.value==='');
 if(!blank){
   const wasFirstDefault=sel.selectedIndex===0 && !sel.options[0]?.hasAttribute('selected');
   blank=document.createElement('option');blank.value='';blank.textContent=defaultText;blank.dataset.fsPlaceholder='1';
   sel.insertBefore(blank,sel.firstChild);
   // Prevent removing meaningful saved selections in forms that were populated before enhancement.
   if(wasFirstDefault||sel.value==='')sel.value='';
 }else if(!clean(blank.textContent)||/choose|select|--/.test(clean(blank.textContent)))blank.textContent=defaultText;
 sel.dataset.fsSelectInit='1';
}
function actionFor(name,origin){
 const actions=terms[name].actions;
 const candidates=[...document.querySelectorAll('button,[role="button"],a')].filter(e=>{
   if(e.closest('[data-fs-quick-add]')||e.disabled)return false;
   const t=clean(e.textContent||e.getAttribute('aria-label'));
   return actions.some(a=>t===a||t===('+'+a)||t===('+ '+a));
 });
 const local=candidates.find(e=>origin.closest('section,.modal,dialog,[role="dialog"]')?.contains(e));
 return local||candidates.find(e=>e.getClientRects().length>0)||null;
}
function install(sel){
 if(!valid(sel))return;
 placeholder(sel);
 const name=kind(sel);
 if(!name||sel.dataset.fsQuickAddInit==='1')return;
 const action=actionFor(name,sel);
 if(!action)return; // No parallel master-data creation workflow or unsafe direct DB inserts.
 sel.dataset.fsQuickAddInit='1';
 const button=document.createElement('button');button.type='button';button.className='fs-inline-quick-add';
 button.dataset.fsQuickAdd='1';button.textContent='+';button.title='Quick Add '+name;button.setAttribute('aria-label','Quick Add '+name);
 button.style.cssText='display:inline-flex;align-items:center;justify-content:center;margin-left:5px;min-width:32px;min-height:32px;padding:3px 8px;border:1px solid #cbd5e1;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer;vertical-align:middle';
 button.addEventListener('click',()=>{
   const trigger=actionFor(name,sel);
   if(!trigger)return;
   const old=new Set([...sel.options].map(x=>x.value));
   // Reuse application-native creation action and refresh the source dropdown after save.
   trigger.click();
   const watch=new MutationObserver(()=>{
     const options=[...sel.options].filter(x=>x.value&&!old.has(x.value));
     if(options.length===1){
       sel.value=options[0].value;
       sel.dispatchEvent(new Event('input',{bubbles:true}));
       sel.dispatchEvent(new Event('change',{bubbles:true}));
       watch.disconnect();
     }
   });
   watch.observe(sel,{subtree:true,childList:true});
   setTimeout(()=>watch.disconnect(),60000);
 });
 sel.insertAdjacentElement('afterend',button);
}
let scheduled=false;
function scan(){
 scheduled=false;
 document.querySelectorAll('select').forEach(install);
}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(scan,70);}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',schedule);
schedule();
})();


/* Chart of Accounts quick balances: fetch posted-journal totals in one RPC.
   Read-only presentation enhancement; never modifies ledger data. */
(function(){
'use strict';
const normalize=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
const client=()=>{try{return typeof sb!=='undefined'?sb:(window.sb||window.finsightSupabase||null)}catch{return null}};
const company=()=>{try{
 return String(typeof companyId!=='undefined'?companyId:(typeof state!=='undefined'?(state.companyId||state.company?.id):window.state?.companyId)||'');
}catch{return ''}};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let pending=false,request=null,cache=null,cacheCompany='',cachedAt=0;
function relevantRows(){
 return [...document.querySelectorAll('tr')].filter(tr=>{
   if(tr.cells.length<6||tr.closest('[data-fs-draft-ui]'))return false;
   const buttons=[...tr.querySelectorAll('button,a')];
   return buttons.some(x=>normalize(x.textContent)==='statement') &&
      [...tr.cells].some(x=>normalize(x.textContent)==='loading...');
 });
}
function balanceCell(tr){
 const cells=[...tr.cells];
 // The Chart of Accounts columns are: Account, Type, Subtype, Cash Flow, Balance, Status, Actions.
 // Prefer the header index if it is present instead of a fixed column index.
 const headers=[...(tr.closest('table')?.querySelectorAll('thead th')||[])].map(x=>normalize(x.textContent));
 const col=headers.findIndex(x=>x==='balance'||x==='quick balance'||x==='current balance');
 if(col>=0&&cells[col])return cells[col];
 return cells.find(x=>normalize(x.textContent)==='loading...')||null;
}
function apply(rows){
 const byName=new Map(),duplicates=new Set();
 for(const a of rows){
  const key=normalize(a.account_name);
  if(byName.has(key))duplicates.add(key);
  byName.set(key,a);
 }
 for(const tr of relevantRows()){
   const name=normalize(tr.cells[0]?.textContent);
   if(!name||duplicates.has(name))continue;
   const account=byName.get(name),cell=balanceCell(tr);
   if(!account||!cell||normalize(cell.textContent)!=='loading...')continue;
   const numeric=Number(account.balance);
   if(!Number.isFinite(numeric))continue;
   cell.textContent=numeric.toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
   cell.dataset.fsFastBalance='1';
 }
}
async function refresh(){
 const rows=relevantRows();
 if(!rows.length)return;
 const id=company(),db=client();
 if(!uuid.test(id)||!db?.rpc)return;
 if(cache&&cacheCompany===id&&Date.now()-cachedAt<12000){apply(cache);return;}
 if(request)return;
 request=(async()=>{
  const {data,error}=await db.rpc('fs_chart_account_balances_named',{p_company:id});
  if(error)throw error;
  if(company()!==id)return;
  cache=Array.isArray(data)?data:[];cacheCompany=id;cachedAt=Date.now();
  apply(cache);
 })();
 try{await request}catch(e){console.warn('Quick balance summary unavailable; normal balances remain in use.',e?.message||e);}
 finally{request=null;}
}
function schedule(){if(pending)return;pending=true;setTimeout(()=>{pending=false;void refresh()},120);}
new MutationObserver(records=>{
 if(records.some(r=>(r.type==='characterData'&&r.target?.parentElement?.closest('tr'))||
  [...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('tr,td,tbody,table')||n.querySelector?.('tr')))))schedule();
}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
document.addEventListener('DOMContentLoaded',schedule);
schedule();
})();
