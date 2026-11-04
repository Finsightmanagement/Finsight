import { createClient } from "npm:@supabase/supabase-js@2";
const env=(name)=>Deno.env.get(name)||"";
const secrets=JSON.parse(env("SUPABASE_SECRET_KEYS")||"{}");
const adminKey=env("SUPABASE_SERVICE_ROLE_KEY")||secrets.default||"";
const serverUrl=env("SUPABASE_URL");
function safeEq(a,b){
 const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);
 if(x.length!==y.length)return false;let d=0;
 for(let n=0;n<x.length;n++)d|=x[n]^y[n];return d===0;
}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const accepted=()=>Response.json({ResultCode:0,ResultDesc:"Received"});
 try{
  const secret=env("FIN_MPESA_SANDBOX_CALLBACK_TOKEN");
  if(!secret||secret.length<32||!safeEq(new URL(req.url).searchParams.get("token")||"",secret))
    return new Response("Unauthorized",{status:401});
  if(!adminKey||!serverUrl||!env("FIN_MPESA_SANDBOX_COMPANY_ID"))
    return new Response("Not configured",{status:503});
  if(Number(req.headers.get("content-length")||"0")>16000)return new Response("Too large",{status:413});
  const data=await req.json();
  const callback=data?.Body?.stkCallback;
  const checkout=String(callback?.CheckoutRequestID||"");
  const result=String(callback?.ResultCode??"");
  if(!checkout||checkout.length>200||result.length>40)return accepted();
  const admin=createClient(serverUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let intent=null;
  for(let attempt=0;attempt<3;attempt++){
   const {data:row}=await admin.from("pos_payment_intents")
     .select("id,company_id,amount,checkout_request_id,state")
     .eq("provider","Safaricom Daraja").eq("checkout_request_id",checkout).maybeSingle();
   if(row){intent=row;break}
   if(attempt<2)await new Promise(ok=>setTimeout(ok,350));
  }
  if(!intent||intent.company_id!==env("FIN_MPESA_SANDBOX_COMPANY_ID")||intent.state!=="Pending")
    return accepted();
  const meta=Array.isArray(callback?.CallbackMetadata?.Item)?callback.CallbackMetadata.Item:[];
  const map=Object.fromEntries(meta.filter(x=>typeof x?.Name==="string").map(x=>[x.Name,x.Value]));
  const receipt=String(map.MpesaReceiptNumber||"").toUpperCase();
  const amount=Number(map.Amount);
  if(result==="0"&&(!/^[A-Za-z0-9]{6,30}$/.test(receipt)||
      !Number.isFinite(amount)||Math.abs(Number(intent.amount)-amount)>0.005))
    return accepted();
  const {error}=await admin.from("pos_mpesa_callback_events")
    .upsert({intent_id:intent.id,checkout_request_id:checkout,provider_result_code:result,
      receipt_number:result==="0"?receipt:null,
      callback_amount:result==="0"?amount:null},
      {onConflict:"intent_id,checkout_request_id",ignoreDuplicates:true});
  if(error)throw error;
  // A callback is evidence, not proof: confirmation requires an authenticated Daraja status query.
  return accepted();
 }catch(_){return new Response("Callback could not be recorded",{status:500})}
});