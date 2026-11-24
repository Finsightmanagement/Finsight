(function(){
'use strict';
// Supplier bill display breakdown only: preserve existing accounting/posting calculations.
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
function breakdown(row){
 const batch=!!row.closest('#fsBillBatchRows');
 const qty=Number($(batch?'.fsbb-qty':'.line-qty',row)?.value||0);
 const rate=Number($(batch?'.fsbb-rate':'.line-rate',row)?.value||0);
 const vat=Number($(batch?'.fsbb-vat':'.line-vat',row)?.value||0);
 const amount=Math.max(0,qty*rate);
 // In existing supplier bill form 'rate' is VAT-inclusive; only display derived amounts.
 const exclusive=vat>0?amount/(1+vat/100):0;
 const vatAmount=vat>0?amount-exclusive:0;
 const ex=$('.fsVatExclusive',row),tax=$('.fsVatAmount',row),inc=$('.fsVatInclusive',row);
 if(ex)ex.textContent=vat>0?money(exclusive):'—';
 if(tax)tax.textContent=vat>0?money(vatAmount):'—';
 if(inc)inc.textContent=money(amount);
}
function setup(tableId,mode){
 const body=document.getElementById(tableId);if(!body)return;
 const table=body.closest('table');if(!table)return;
 let head=table.querySelector('thead tr');
 if(head && !head.dataset.fsVatColumns){
  const cells=[...head.cells];const last=cells.find(c=>/^total$/i.test(c.textContent.trim()));
  if(last){last.textContent='Inclusive';const ex=document.createElement('th'),tax=document.createElement('th');ex.textContent='Exclusive';tax.textContent='VAT';last.before(ex,tax);}
  else {const v=cells.find(c=>/^vat$/i.test(c.textContent.trim()));if(v){const ex=document.createElement('th'),tax=document.createElement('th'),inc=document.createElement('th');ex.textContent='Exclusive';tax.textContent='VAT Amount';inc.textContent='Inclusive';v.after(ex,tax,inc)}}
  head.dataset.fsVatColumns='1';
 }
 for(const row of [...body.rows]){
  if(row.dataset.fsVatDisplay==='1'){breakdown(row);continue;}
  const vat=$(mode==='batch'?'.fsbb-vat':'.line-vat',row);
  if(!vat)continue;
  const totalCell=mode==='batch'?$('.fsbb-line-total',row):[...row.cells].find(td=>td.textContent.trim().startsWith('KSh')&&!td.querySelector('input'));
  const make=(cls)=>{const td=document.createElement('td');td.className=cls;td.style.cssText='text-align:right;white-space:nowrap;min-width:100px';return td};
  const ex=make('fsVatExclusive'),tax=make('fsVatAmount');
  if(totalCell){totalCell.classList.add('fsVatInclusive');totalCell.before(ex,tax);}
  else{const inc=make('fsVatInclusive');vat.closest('td')?.after(ex,tax,inc);}
  row.dataset.fsVatDisplay='1';breakdown(row);
 }
}
function update(){setup('fsBillBatchRows','batch');setup('billLines','single');}
let queued=false;function schedule(){if(queued)return;queued=true;setTimeout(()=>{queued=false;update()},50)}
document.addEventListener('input',e=>{if(e.target.closest('#fsBillBatchRows,#billLines'))schedule()},true);
document.addEventListener('change',e=>{if(e.target.closest('#fsBillBatchRows,#billLines'))schedule()},true);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',schedule);schedule();
})();