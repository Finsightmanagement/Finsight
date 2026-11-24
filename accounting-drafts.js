(function(){
'use strict';
// Client-side recovery. Does not post or mutate ledgers.
const STORE='finsight.accounting.drafts.v1';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const company=()=>{try{return String(typeof companyId!=='undefined'?companyId:(typeof state!=='undefined'?(state.companyId||state.company?.id):window.state?.companyId)||'unknown')}catch{return 'unknown'}};
const user=()=>{try{return String(typeof currentUser!=='undefined'?(currentUser?.id||currentUser?.email||'user'):(window.state?.user?.id||'user'))}catch{return 'user'}};
const namespace=()=>company()+'::'+user();

const cloudClient=()=>{try{return typeof sb!=='undefined'?sb:(window.sb||window.finsightSupabase||null)}catch{return null}};
async function cloudContext(){
 const client=cloudClient(),cid=company();
 if(!client||!client.auth||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(cid))return null;
 try{const {data,error}=await client.auth.getUser();if(error||!data?.user?.id)return null;return {client,cid,uid:data.user.id}}catch{return null}
}
async function cloudSave(item){
 const ctx=await cloudContext();if(!ctx)return;
 const {error}=await ctx.client.from('fs_accounting_drafts').upsert({
  company_id:ctx.cid,user_id:ctx.uid,form_key:item.label.slice(0,180),payload:item.payload,updated_at:item.updatedAt
 },{onConflict:'company_id,user_id,form_key'});
 if(error)console.warn('Draft cloud save unavailable; local recovery retained',error.message);
}
async function cloudDelete(formKey){
 const ctx=await cloudContext();if(!ctx)return;
 await ctx.client.from('fs_accounting_drafts').delete().eq('company_id',ctx.cid).eq('user_id',ctx.uid).eq('form_key',formKey);
}
async function syncCloud(){
 const ctx=await cloudContext();if(!ctx)return;
 const {data,error}=await ctx.client.from('fs_accounting_drafts').select('form_key,payload,created_at,updated_at').eq('company_id',ctx.cid).eq('user_id',ctx.uid);
 if(error||!data)return;
 const items=read(),owner=namespace();
 for(const d of data){
  const id=owner+'::'+d.form_key,index=items.findIndex(x=>x.id===id);
  if(index===-1||new Date(items[index].updatedAt)<new Date(d.updated_at)){
   const entry={id,owner,label:d.form_key,createdAt:d.created_at,updatedAt:d.updated_at,payload:d.payload};
   if(index===-1)items.push(entry);else items[index]=entry;
  }
 }
 write(items.slice(-100));
}

const read=()=>{try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return []}};
const write=rows=>{try{localStorage.setItem(STORE,JSON.stringify(rows));return true}catch(e){console.warn('FinSight draft save failed',e);return false}};
const formKey=el=>el.id||el.getAttribute('data-draft-key')||el.getAttribute('aria-label')||el.querySelector('h1,h2,h3,h4')?.textContent.trim()||'Accounting Form';
function container(node){
 if(!node||!(node instanceof Element))return null;
 const modal=node.closest('[role="dialog"],dialog,.modal,.modal-content,.modal-body');
 if(modal && modal.querySelector('input:not([type=hidden]),textarea,select'))return modal;
 const section=node.closest('section,.page-section,.tab-panel,.content-section');
 return section && section.querySelector('input:not([type=hidden]),textarea,select')?section:null;
}
function controls(root){return $$('input,textarea,select',root).filter(e=>!e.disabled&&e.type!=='hidden'&&e.type!=='file'&&e.type!=='password'&&!e.closest('[data-fs-draft-ui]')&&e.id!=='fsPriceAsAt');}
function ident(e,i){return e.id?'id:'+e.id:(e.name?'name:'+e.name+':'+i:'position:'+i);}
function capture(root){
 const rows={};
 for(const [i,e] of controls(root).entries()){
  const key=ident(e,i);
  rows[key]={value:e.type==='checkbox'||e.type==='radio'?e.checked:e.value,tag:e.tagName,type:e.type};
 }
 const tables={};
 for(const tbody of $$('tbody[id]',root)){
  const rowsCount=tbody.querySelectorAll(':scope > tr').length;
  if(rowsCount)tables[tbody.id]=Math.min(rowsCount,500);
 }
 return {fields:rows,tables};
}
function draftId(root){return namespace()+'::'+formKey(root);}
function store(root,manual=false){
 const id=draftId(root),payload=capture(root);
 if(!Object.keys(payload.fields).length)return false;
 const all=read(),old=all.find(x=>x.id===id);
 const item={id,owner:namespace(),label:formKey(root),updatedAt:new Date().toISOString(),payload,createdAt:old?.createdAt||new Date().toISOString()};
 const idx=all.findIndex(x=>x.id===id);if(idx>=0)all[idx]=item;else all.push(item);
 const ok=write(all.slice(-100));if(ok)void cloudSave(item);if(manual)notify(ok?'Draft saved to this browser.':'Draft could not be saved.');return ok;
}
function notify(msg){let el=$('#fsDraftNotice');if(!el){el=document.createElement('div');el.id='fsDraftNotice';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:20px;right:20px;z-index:2147483646;background:#172238;color:white;padding:12px 16px;border-radius:8px;box-shadow:0 4px 20px #0003';document.body.appendChild(el)}el.textContent=msg;setTimeout(()=>{if(el.textContent===msg)el.remove()},3500);}
const ADD={fsBillBatchRows:'#fsBillBatchAdd',billLines:'#addBillLine',fsBatchRows:'#fsBatchAdd'};
async function restore(root,item){
 for(const [id,count] of Object.entries(item.payload.tables||{})){
  const body=document.getElementById(id),add=$(ADD[id]||'#___');
  if(!body||!add)continue;
  let attempts=0;while(body.rows.length<count && attempts++<count+2){const before=body.rows.length;add.click();await new Promise(r=>setTimeout(r,15));if(body.rows.length<=before)break;}
 }
 const fields=item.payload.fields||{};
 for(const [i,e] of controls(root).entries()){
  const saved=fields[ident(e,i)];if(!saved)continue;
  if(e.type==='checkbox'||e.type==='radio')e.checked=!!saved.value;
  else if(e.tagName==='SELECT'){
   if([...e.options].some(o=>o.value===String(saved.value)))e.value=String(saved.value);
  }else e.value=saved.value;
  e.dispatchEvent(new Event('input',{bubbles:true}));
  e.dispatchEvent(new Event('change',{bubbles:true}));
 }
 notify('Draft restored. Review the details before posting.');
}
async function draftPanel(root){
 await syncCloud();
 const drafts=read().filter(x=>x.owner===namespace()).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const dialog=document.createElement('dialog');dialog.setAttribute('data-fs-draft-ui','');dialog.style.cssText='border:1px solid #d5dbe4;border-radius:12px;padding:20px;max-width:92vw;width:620px;background:#fff;color:#172238';
 const title=document.createElement('h3');title.textContent='Saved Drafts';dialog.appendChild(title);
 const info=document.createElement('p');info.textContent='Drafts are stored on this browser until cloud draft synchronization is enabled.';dialog.appendChild(info);
 if(!drafts.length){const empty=document.createElement('p');empty.textContent='No saved drafts yet.';dialog.appendChild(empty);}
 for(const item of drafts){
  const row=document.createElement('div');row.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #ddd';
  const name=document.createElement('span');name.textContent=item.label+' · '+new Date(item.updatedAt).toLocaleString();
  const actions=document.createElement('div');
  const resume=document.createElement('button');resume.type='button';resume.className='btn';resume.textContent='Continue';
  resume.onclick=()=>{const target=formKey(root)===item.label?root:$$('[role="dialog"],dialog,.modal,.modal-content,section,.page-section').find(x=>formKey(x)===item.label);if(!target){notify('Open the '+item.label+' form first, then select Continue.');return;}dialog.close();void restore(target,item)};
  const del=document.createElement('button');del.type='button';del.className='btn';del.textContent='Delete';del.onclick=()=>{write(read().filter(x=>x.id!==item.id));void cloudDelete(item.label);row.remove()};
  actions.append(resume,del);row.append(name,actions);dialog.append(row);
 }
 const close=document.createElement('button');close.type='button';close.className='btn';close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(close);document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}
function install(root){
 if(!root||root.dataset.fsDraftReady==='1'||root.closest('[data-fs-draft-ui]'))return;
 if(!controls(root).length)return;
 root.dataset.fsDraftReady='1';
 const bar=document.createElement('div');bar.dataset.fsDraftUi='1';bar.style.cssText='display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin:8px 0';
 const save=document.createElement('button');save.type='button';save.className='btn';save.textContent='Save Draft';save.onclick=()=>store(root,true);
 const view=document.createElement('button');view.type='button';view.className='btn';view.textContent='View Drafts';view.onclick=()=>{void draftPanel(root)};
 bar.append(save,view);
 const actions=root.querySelector('.modal-actions,.toolbar,.section-title');if(actions)actions.append(bar);else root.insertBefore(bar,root.firstChild);
}
let pending=null;
document.addEventListener('input',e=>{const root=container(e.target);if(!root)return;install(root);clearTimeout(pending);pending=setTimeout(()=>store(root),550)},true);
document.addEventListener('change',e=>{const root=container(e.target);if(!root)return;install(root);store(root)},true);
document.addEventListener('click',e=>{const root=container(e.target);if(root)setTimeout(()=>install(root),30)},true);
const observer=new MutationObserver(()=>{for(const el of $$('[role="dialog"],dialog,.modal,.modal-content,section,.page-section')){if(!el.dataset.fsDraftReady&&el.querySelector('input,textarea,select'))install(el)}});
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',()=>{for(const el of $$('[role="dialog"],dialog,.modal,.modal-content,section,.page-section'))install(el)});
window.addEventListener('pagehide',()=>{for(const el of $$('[data-fs-draft-ready="1"]'))store(el)});
})();