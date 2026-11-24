(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
function printInvoice(snapshot){
 const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;left:-10000px;width:1px;height:1px;border:0';
 document.body.append(iframe);
 const doc=iframe.contentDocument;
 const rows=snapshot.rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.item)+'</td><td>'+esc(r.qty)+'</td><td style="text-align:right">KSh '+money(r.amount)+'</td></tr>').join('');
 const sum=snapshot.rows.reduce((n,r)=>n+Number(r.amount),0);
 doc.open();doc.write('<!doctype html><html><head><title>Sales Invoice</title><style>body{font:13px Arial;color:#1d2735;padding:28px}h1{font-size:24px;margin:0 0 24px}table{border-collapse:collapse;width:100%;margin-top:24px}td,th{border-bottom:1px solid #cbd1d8;padding:10px;text-align:left}th{background:#eef1f5}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:24px}@page{size:A4;margin:16mm}</style></head><body><h1>SALES INVOICE</h1><div><strong>Customer:</strong> '+esc(snapshot.customer||'Walk-in Customer')+'</div><div><strong>Sales Date:</strong> '+esc(snapshot.date)+'</div><div><strong>Payment Type:</strong> '+esc(snapshot.payment)+'</div><table><thead><tr><th>No.</th><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>'+rows+'</tbody></table><div class="total">Total: KSh '+money(sum)+'</div></body></html>');doc.close();
 setTimeout(()=>{try{iframe.contentWindow.focus();iframe.contentWindow.print()}finally{setTimeout(()=>iframe.remove(),3000)}},250);
}
function install(){
 const rows=$('#fsBatchRows'),post=$('#fsBatchPost'),status=$('#fsBatchStatus');
 if(!rows||!post||!status||$('#fsInvoiceOption'))return;
 const wrap=document.createElement('div');wrap.id='fsInvoiceOption';wrap.style.cssText='padding:12px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:end';
 const label=document.createElement('label');label.style.cssText='display:flex;align-items:center;gap:8px';
 const check=document.createElement('input');check.type='checkbox';check.id='fsInvoiceGenerate';label.append(check,document.createTextNode('Generate a plain invoice after posting'));
 const field=document.createElement('div');field.className='field';field.innerHTML='<label for="fsInvoiceCustomer">Customer / Bill To (optional)</label><input class="input" id="fsInvoiceCustomer" placeholder="Customer name">';
 field.style.display='none';check.onchange=()=>{field.style.display=check.checked?'':'none'};
 wrap.append(label,field);post.closest('.modal-actions')?.before(wrap);
 let snapshot=null,printed=false;
 const snap=()=>{
  const lines=$$('#fsBatchRows tr').map(tr=>({
   date:$('.fs-date',tr)?.value||'',item:$('.fs-item option:checked',tr)?.textContent.trim()||'',
   qty:$('.fs-qty',tr)?.value||'',amount:Number($('.fs-amount',tr)?.value||0)
  }));
  const dates=[...new Set(lines.map(x=>x.date))];
  if(dates.length!==1)return null;
  return {rows:lines,date:dates[0],customer:$('#fsInvoiceCustomer')?.value.trim(),payment:$('#fsBatchPayment option:checked')?.textContent.trim()};
 };
 post.addEventListener('click',e=>{
  if(post.textContent.trim()!=='Post Batch Sales'&&post.textContent.trim()!=='Retry Batch')return;
  printed=false;snapshot=check.checked?snap():null;
  if(check.checked&&!snapshot){e.preventDefault();e.stopImmediatePropagation();alert('To generate one invoice, all sales lines must have the same sales date. You can still post without an invoice.');return;}
 },true);
 new MutationObserver(()=>{
  if(!check.checked||!snapshot||printed)return;
  const message=status.textContent.trim();
  if(/^Successfully posted \d+ sales items\.$/.test(message)||/already posted; no duplicates/i.test(message)){
   printed=true;printInvoice(snapshot);
  }
 }).observe(status,{childList:true,subtree:true,characterData:true});
}
let pending=false;const schedule=()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;install()},60)};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',schedule);schedule();
})();