(function(){
'use strict';
// Price history is derived from posted supplier bill lines, not edited stock item costs.
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const appState=()=>typeof state!=='undefined'?state:(window.state||{});
const norm=v=>String(v??'').trim().toLocaleLowerCase();
const money=v=>Number(v).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const currentDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function history(){
  const records=[];
  for(const bill of (appState()?.bills||[])){
    const date=String(bill.date||'').slice(0,10),supplier=norm(bill.supplier);
    if(!date||!supplier)continue;
    for(const [i,line] of (bill.lines||[]).entries()){
      if(line.group!=='Purchase Item'||!line.item)continue;
      const rate=Number(line.rate);
      if(!Number.isFinite(rate)||rate<=0)continue;
      records.push({date,supplier,item:norm(line.item),rate,postedAt:String(bill.createdAt||''),lineAt:String(line.createdAt||''),order:records.length,invoice:bill.invoice||''});
    }
  }
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.postedAt.localeCompare(b.postedAt)||a.lineAt.localeCompare(b.lineAt)||a.order-b.order);
  return records;
}
function lookup(records,supplier,item,date){
  let found=null;
  for(const r of records){
    if(r.date>date)break;
    if(r.supplier===norm(supplier)&&r.item===norm(item))found=r;
  }
  return found;
}
function itemName(id){return (appState()?.stockItems||[]).find(x=>String(x.id)===String(id))?.name||'';}
function rateForRow(row,records){
  const batch=!!row.closest('#fsBillBatchRows');
  const supplier=batch?$('#fsBillBatchSupplier option:checked')?.textContent:$('#bSupplier')?.value;
  const item=batch?itemName($('.fsbb-item',row)?.value):itemName($('.purchase-item-select',row)?.value);
  const day=batch?$('.fsbb-date',row)?.value:$('#bDate')?.value;
  const rate=$(batch?'.fsbb-rate':'.line-rate',row);
  if(!rate||!supplier||!item||!day)return;
  const match=lookup(records,supplier,item,day);
  // A suggestion, not a restriction: the input always remains editable.
  if(match){rate.value=String(match.rate);rate.dataset.fsSuggested='1';rate.title='Last posted cost from this supplier on '+match.date;}
  else {rate.value='';delete rate.dataset.fsSuggested;rate.removeAttribute('title');}
  rate.dispatchEvent(new Event('input',{bubbles:true}));
}
function updateRows(scope){
  const records=history();
  if(scope==='batch')$$('#fsBillBatchRows tr').forEach(r=>{if($('.fsbb-group',r)?.value==='Purchase Item')rateForRow(r,records)});
  else $$('#billLines tr').forEach(r=>{if($('.line-group',r)?.value==='Purchase Item')rateForRow(r,records)});
}
document.addEventListener('change',e=>{
  const target=e.target;
  if(target.matches('#fsBillBatchSupplier,.fsbb-item,.fsbb-date,.fsbb-group')){
    if(target.matches('#fsBillBatchSupplier'))updateRows('batch');
    else if(target.closest('#fsBillBatchRows'))rateForRow(target.closest('tr'),history());
  }
  if(target.matches('#bSupplier,#bDate,.purchase-item-select,.line-group')){
    if(target.matches('#bSupplier,#bDate'))updateRows('single');
    else if(target.closest('#billLines'))setTimeout(()=>rateForRow(target.closest('tr'),history()),0);
  }
},true);
document.addEventListener('input',e=>{
  if(e.target.matches('.fsbb-rate,.line-rate')&&e.isTrusted){
    e.target.dataset.fsSuggested='0';
    e.target.removeAttribute('title');
  }
},true);
// Both bill forms add rows dynamically. Suggest a rate when the user adds a row;
// do not touch hand-entered values on unrelated interactions.
document.addEventListener('click',e=>{
  if(e.target.closest('#fsBillBatchAdd,#addBillLine')){
    setTimeout(()=>updateRows(e.target.closest('#fsBillBatchAdd')?'batch':'single'),0);
  }
},true);

function priceGrid(asOf){
  const items=(appState()?.stockItems||[]).filter(x=>x.is_active!==false);
  const suppliers=[...new Set(history().filter(x=>x.date<=asOf).map(x=>x.supplier))];
  // Display the supplier's original name from the supplier master, if available.
  const names=(appState()?.suppliers||[]);
  const label=s=>names.find(n=>norm(n)===s)||s;
  const records=history();
  return {suppliers: suppliers.map(s=>({key:s,label:label(s)})).sort((a,b)=>a.label.localeCompare(b.label)),
    items:items.slice().sort((a,b)=>a.name.localeCompare(b.name)),records};
}
function priceTable(grid,asOf){
  const {items,suppliers,records}=grid;
  return '<table class="line-table" style="width:100%;border-collapse:collapse"><thead><tr><th>Purchase Item</th>'+
  suppliers.map(s=>'<th style="text-align:right;white-space:nowrap">'+escape(s.label)+'</th>').join('')+
  '</tr></thead><tbody>'+items.map(item=>'<tr><td>'+escape(item.name)+'</td>'+
  suppliers.map(s=>{const v=lookup(records,s.key,item.name,asOf);return '<td style="text-align:right">'+(v?'KSh '+money(v.rate):'—')+'</td>'}).join('')+
  '</tr>').join('')+'</tbody></table>';
}
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
function saveCSV(grid,asOf){
 const lines=[['Purchase Item',...grid.suppliers.map(s=>s.label)].map(csvCell).join(',')];
 for(const item of grid.items){
  lines.push([item.name,...grid.suppliers.map(s=>lookup(grid.records,s.key,item.name,asOf)?.rate??'')].map(csvCell).join(','));
 }
 const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='FinSight_Supplier_Price_List_'+asOf+'.csv';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function printPrices(grid,asOf){
 const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0';
 document.body.appendChild(frame);
 const doc=frame.contentDocument;
 doc.open();doc.write('<!doctype html><html><head><title>Supplier Price List</title><style>body{font:12px Arial;padding:20px;color:#192337}h2{margin:0 0 8px}p{margin:0 0 18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd2dc;padding:7px;text-align:left}th{background:#eef0f8}th:not(:first-child),td:not(:first-child){text-align:right}@page{size:landscape;margin:12mm}</style></head><body><h2>Supplier Price List</h2><p>As at '+escape(asOf)+' · KSh per purchase unit</p>'+priceTable(grid,asOf)+'</body></html>');doc.close();
 setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}finally{setTimeout(()=>frame.remove(),3000)}},200);
}
function openPrices(){
 if(typeof window.openModal!=='function')return;
 window.openModal('Supplier Price List','', '<div class="toolbar" style="display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:12px"><div class="field"><label>As at</label><input class="input" type="date" id="fsPriceAsAt" value="'+currentDate()+'"></div><button class="btn" id="fsPriceCsv">Export Excel / CSV</button><button class="btn" id="fsPricePdf">Export PDF</button></div><div id="fsPriceView" style="max-height:65vh;overflow:auto"></div>');
 const date=$('#fsPriceAsAt'),view=$('#fsPriceView');
 const render=()=>{const asOf=date.value||currentDate(),grid=priceGrid(asOf);view.innerHTML=grid.suppliers.length?priceTable(grid,asOf):'<div class="empty-state">No supplier purchase prices recorded on or before this date.</div>';return grid};
 date.onchange=render;$('#fsPriceCsv').onclick=()=>saveCSV(render(),date.value);
 $('#fsPricePdf').onclick=()=>printPrices(render(),date.value);render();
}
function attachButton(){
 const panel=$('#inventory .section-title');
 if(!panel||$('#fsSupplierPriceListBtn'))return;
 const actions=panel.querySelector(':scope > div:last-child');
 if(!actions)return;
 const button=document.createElement('button');button.id='fsSupplierPriceListBtn';button.className='btn';button.textContent='Supplier Price List';button.type='button';
 button.onclick=openPrices;actions.insertBefore(button,actions.firstChild);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachButton);else attachButton();
document.addEventListener('finsight:cloud-state-loaded',attachButton);
})();
