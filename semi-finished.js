(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number(x)||0;
const company=()=>window.finsightOnline?.companyId;
const db=()=>window.finsightSupabase;
const fmt=x=>'KSh '+n(x).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
async function fetchData(){
 const cid=company(),sb=db();
 if(!cid||!sb)throw Error('Select a company and connect to FinSight.');
 const requests=[
  sb.from('fs_semi_finished_goods').select('id,name,unit,is_active').eq('company_id',cid).order('name'),
  sb.from('fs_recipe_components').select('owner_kind,owner_id,component_kind,component_id,quantity').eq('company_id',cid),
  sb.from('menu_items').select('id,name,is_active').eq('company_id',cid).order('name'),
  sb.from('stock_items').select('id,name,unit,is_active,unit_cost').eq('company_id',cid).eq('is_active',true).order('name')
 ];
 const all=await Promise.all(requests);
 for(const r of all)if(r.error)throw Error(r.error.message);
 return {semi:all[0].data||[],components:all[1].data||[],menu:all[2].data||[],stock:all[3].data||[]};
}
function options(d,kind,ownerKind,ownerId){
 const group=kind==='stock'?d.stock:kind==='menu'?d.menu:d.semi;
 return group.filter(x=>x.is_active!==false&&!(ownerKind===kind&&String(x.id)===String(ownerId)))
 .map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+(kind==='stock'?' ('+esc(x.unit||'Unit')+')':'')+'</option>').join('');
}
function addLine(host,d,record,ownerKind,ownerId,allowed){
 const div=document.createElement('div');div.className='fs-composition-row';
 const available=allowed.filter(kind=>options(d,kind,ownerKind,ownerId));
 if(!available.length)throw Error('Add active purchase, menu or semi-finished items before composing recipes.');
 const kind=record?.component_kind&&available.includes(record.component_kind)?record.component_kind:available[0];
 div.innerHTML='<select class="input fs-comp-kind">'+available.map(x=>'<option value="'+x+'" '+(x===kind?'selected':'')+'>'+({stock:'Purchase Item',menu:'Menu Item',semi:'Semi-Finished Good'}[x])+'</option>').join('')+'</select>'+
 '<select class="input fs-comp-item"></select><input class="input fs-comp-qty" type="number" step="any" min="0.000001" placeholder="Quantity" value="'+esc(record?.quantity??'')+'">'+
 '<button class="btn fs-comp-remove" type="button">Remove</button>';
 const type=$('.fs-comp-kind',div),target=$('.fs-comp-item',div);
 const update=()=>{target.innerHTML=options(d,type.value,ownerKind,ownerId);if(record&&type.value===record.component_kind)target.value=record.component_id};
 type.onchange=()=>{record=null;update()};
 $('.fs-comp-remove',div).onclick=()=>div.remove();
 update();host.appendChild(div);
}
function getLines(host){
 const seen=new Set();
 return $$('.fs-composition-row',host).map((row,i)=>{
  const kind=$('.fs-comp-kind',row).value,id=$('.fs-comp-item',row).value,raw=$('.fs-comp-qty',row).value.trim(),quantity=Number(raw);
  if(!kind||!id||raw===''||!Number.isFinite(quantity)||quantity<=0)throw Error('Line '+(i+1)+': choose an item and enter a positive quantity.');
  if(seen.has(kind+':'+id))throw Error('Line '+(i+1)+': the same ingredient is already in this recipe.');
  seen.add(kind+':'+id);return {kind,id,quantity};
 });
}
async function save(ownerKind,ownerId,name,unit,host){
 const lines=getLines(host);if(!lines.length)throw Error('Add at least one recipe ingredient.');
 const {data,error}=await db().rpc('fs_save_composite_recipe',{
  p_company:company(),p_owner_kind:ownerKind,p_owner_id:ownerId||null,
  p_name:name||'',p_unit:unit||'Pcs',p_lines:lines
 });
 if(error)throw Error(error.message);return data;
}
async function preview(ownerKind,ownerId,qty,target){
 if(!ownerId)throw Error('Save the recipe before previewing it.');
 target.textContent='Calculating purchase-item requirements…';
 const {data,error}=await db().rpc('fs_expand_recipe',{
  p_company:company(),p_owner_kind:ownerKind,p_owner_id:ownerId,p_quantity:qty||1
 });
 if(error)throw Error(error.message);
 const rows=data||[];
 target.innerHTML=rows.length?'<div style="overflow:auto"><table style="width:100%"><thead><tr><th>Purchase Item</th><th>Quantity</th><th>Unit</th><th>Estimated Cost</th></tr></thead><tbody>'+
 rows.map(x=>'<tr><td>'+esc(x.stock_name)+'</td><td>'+esc(x.quantity)+'</td><td>'+esc(x.unit||'')+'</td><td>'+fmt(x.total_cost)+'</td></tr>').join('')+
 '</tbody><tfoot><tr><th colspan="3">Total</th><th>'+fmt(rows.reduce((a,x)=>a+n(x.total_cost),0))+'</th></tr></tfoot></table></div>':'No purchase-item ingredients found in this recipe.';
}
const style=document.createElement('style');style.id='fs-composite-styles';
style.textContent='.fs-composition-row{display:grid;grid-template-columns:150px minmax(170px,1fr) 120px auto;gap:8px;margin:8px 0;align-items:center}.fs-composition-row .input{min-width:0;width:100%}.fs-composition-panel{margin:18px 0;padding:14px;border:1px solid var(--line,#ddd);border-radius:12px}.fs-composition-panel .fs-comp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.fs-semi-item{padding:10px;border-bottom:1px solid var(--line,#ddd);cursor:pointer}.fs-semi-item:hover{background:var(--soft-primary,#f4f4ff)}@media(max-width:700px){.fs-composition-row{grid-template-columns:1fr 1fr}.fs-composition-row .fs-comp-qty{width:100%}}';
document.head.appendChild(style);
window.openSemiFinishedManager=async function(){
 try{
  let d=await fetchData(),selected=null;
  openModal('Semi-Finished Goods','',`<div class="fs-comp-actions" style="display:flex;gap:8px;margin-bottom:12px"><button id="fsSemiNew" class="btn primary" type="button">+ New Semi-Finished Good</button></div>
   <div id="fsSemiList" style="max-height:190px;overflow:auto"></div>
   <div class="fs-composition-panel" id="fsSemiEditor"><div class="empty-state">Select an item or create a new one.</div></div>`);
  function list(){
   $('#fsSemiList').innerHTML=d.semi.length?d.semi.map(x=>'<div class="fs-semi-item" data-semi="'+esc(x.id)+'"><b>'+esc(x.name)+'</b> · '+esc(x.unit)+'</div>').join(''):'No semi-finished goods yet.';
   $$('.fs-semi-item').forEach(x=>x.onclick=()=>edit(d.semi.find(z=>z.id===x.dataset.semi)));
  }
  function edit(item){
   selected=item||null;
   const host=$('#fsSemiEditor');if(!host)return;
   host.innerHTML='<h3>'+(item?'Edit Semi-Finished Good':'New Semi-Finished Good')+'</h3>'+
    '<div class="form-grid"><div class="field"><label>Name</label><input class="input" id="fsSemiName" value="'+esc(item?.name||'')+'"></div>'+
    '<div class="field"><label>Output Unit</label><select class="input" id="fsSemiUnit">'+
      ['Pcs','Kg','g','Litre','ml','Pack','Tray','Portion'].map(x=>'<option '+(x===(item?.unit||'Pcs')?'selected':'')+'>'+x+'</option>').join('')+
    '</select></div></div>'+
    '<div style="margin-top:12px"><b>Ingredients used to make one output unit</b></div><div id="fsSemiLines"></div>'+
    '<div class="fs-comp-actions"><button class="btn" type="button" id="fsSemiAdd">+ Ingredient</button><button class="btn primary" type="button" id="fsSemiSave">Save Recipe</button>'+
    (item?'<button class="btn" type="button" id="fsSemiPreview">Preview Consumption</button>':'')+'</div>'+
    '<div id="fsSemiResult" role="status" style="margin-top:12px"></div>';
   const rows=$('#fsSemiLines'),existing=item?d.components.filter(x=>x.owner_kind==='semi'&&x.owner_id===item.id):[];
   existing.forEach(x=>addLine(rows,d,x,'semi',item?.id,['stock','semi','menu']));
   if(!existing.length)addLine(rows,d,null,'semi',item?.id,['stock','semi','menu']);
   $('#fsSemiAdd').onclick=()=>addLine(rows,d,null,'semi',item?.id,['stock','semi','menu']);
   $('#fsSemiSave').onclick=async()=>{
    const btn=$('#fsSemiSave'),out=$('#fsSemiResult');btn.disabled=true;out.textContent='Saving recipe…';
    try{
      const id=await save('semi',item?.id,$('#fsSemiName').value.trim(),$('#fsSemiUnit').value,rows);
      d=await fetchData();
      const saved=d.semi.find(x=>x.id===id);
      list();edit(saved);$('#fsSemiResult').textContent='Recipe saved successfully.';
    }catch(e){out.textContent=e.message||String(e)}
    finally{if(btn.isConnected)btn.disabled=false}
   };
   if(item)$('#fsSemiPreview').onclick=()=>preview('semi',item.id,1,$('#fsSemiResult')).catch(e=>$('#fsSemiResult').textContent=e.message);
  }
  $('#fsSemiNew').onclick=()=>edit(null);list();
 }catch(e){if(window.toast)toast(e.message||String(e));else alert(e.message||String(e))}
};
function mountInventory(){
 const a=$('#inventory #recipeManagerBtn')||$('#inventory #stockItemsBtn');
 if(a&&!$('#inventory #fsSemiOpen')){
  const btn=document.createElement('button');btn.id='fsSemiOpen';btn.className='btn';btn.textContent='Semi-Finished Goods';btn.type='button';
  btn.onclick=()=>window.openSemiFinishedManager();a.insertAdjacentElement('afterend',btn);
 }
}
let editingId='',editToken=0;
async function mountMenu(){
 const editor=$('#fsMenuEditor'),item=$('#fsMenuList .fs-menu-card.active'),id=item?.dataset.mid;
 if(!editor||!id||!$('#fsmSave')||$('#fsNestedPanel'))return;
 const ticket=++editToken;editingId=id;
 const panel=document.createElement('div');panel.className='fs-composition-panel';panel.id='fsNestedPanel';
 panel.innerHTML='<b>Menu Offers & Nested Ingredients</b><div id="fsNestedRows"></div>'+
  '<div class="fs-comp-actions"><button class="btn" id="fsNestedAdd" type="button">+ Menu / Semi-Finished Item</button>'+
  '<button class="btn primary" id="fsNestedSave" type="button">Save Nested Ingredients</button>'+
  '<button class="btn" id="fsNestedPreview" type="button">Preview Purchase-Item Usage</button></div>'+
  '<div id="fsNestedStatus" role="status" style="margin-top:10px"></div>';
 editor.appendChild(panel);
 try{
  const d=await fetchData();if(ticket!==editToken||!panel.isConnected||$('#fsMenuList .fs-menu-card.active')?.dataset.mid!==id)return;
  const list=$('#fsNestedRows',panel),existing=d.components.filter(x=>x.owner_kind==='menu'&&x.owner_id===id);
  existing.forEach(x=>addLine(list,d,x,'menu',id,['menu','semi']));
  $('#fsNestedAdd',panel).onclick=()=>{try{addLine(list,d,null,'menu',id,['menu','semi'])}catch(e){$('#fsNestedStatus',panel).textContent=e.message}};
  $('#fsNestedSave',panel).onclick=async()=>{
   const btn=$('#fsNestedSave',panel),out=$('#fsNestedStatus',panel);
   btn.disabled=true;out.textContent='Saving nested ingredients…';
   try{await save('menu',id,'','',list);out.textContent='Nested ingredients saved.'}
   catch(e){out.textContent=e.message||String(e)}
   finally{btn.disabled=false}
  };
  $('#fsNestedPreview',panel).onclick=()=>preview('menu',id,1,$('#fsNestedStatus',panel)).catch(e=>$('#fsNestedStatus',panel).textContent=e.message);
 }catch(e){if(panel.isConnected)$('#fsNestedStatus',panel).textContent=e.message||String(e)}
}
function init(){
 mountInventory();
 const inventory=$('#inventory'),modal=$('#modalBody');
 if(inventory)new MutationObserver(mountInventory).observe(inventory,{childList:true,subtree:true});
 if(modal)new MutationObserver(()=>{if($('#fsMenuEditor'))mountMenu()}).observe(modal,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();