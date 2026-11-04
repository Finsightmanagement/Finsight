import { createClient } from "npm:@supabase/supabase-js@2";
const env=(name)=>Deno.env.get(name)||"";
const publishes=JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS")||"{}");
const secrets=JSON.parse(env("SUPABASE_SECRET_KEYS")||"{}");
const pub=env("SUPABASE_ANON_KEY")||env("SUPABASE_PUBLISHABLE_KEY")||publishes.default||"";
const sec=env("SUPABASE_SERVICE_ROLE_KEY")||secrets.default||"";
const url=env("SUPABASE_URL");
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type"};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function darajaAuth(){
 const basic=btoa(env("FIN_MPESA_SANDBOX_CONSUMER_KEY")+":"+env("FIN_MPESA_SANDBOX_CONSUMER_SECRET"));
 const r=await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
 {headers:{Authorization:"Basic "+basic},signal:AbortSignal.timeout(10000)});
 const body=await r.json();
 if(!r.ok||!body.access_token)throw Error("Daraja sandbox authorization unavailable");
 return body.access_token;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return out({error:"POST required"},405);
 try{
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer ")||!pub||!sec||!url)return out({error:"Sign in required"},401);
 const userClient=createClient(url,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await userClient.auth.getUser();
 if(!user||authError)return out({error:"Sign in required"},401);
 const data=await req.json();
 const {company_id,outlet_id,employee_token,intent_id}=data;
 const {data:status,error:statusError}=await userClient.rpc("pos_mpesa_status",{
  p_company:company_id,p_outlet:outlet_id,p_token:employee_token,p_intent:intent_id});
 if(statusError)return out({error:statusError.message},403);
 if(status.state!=="Pending")return out(status);
 if(company_id!==env("FIN_MPESA_SANDBOX_COMPANY_ID")||
  !env("FIN_MPESA_SANDBOX_CONSUMER_KEY")||!env("FIN_MPESA_SANDBOX_CONSUMER_SECRET")||
  !env("FIN_MPESA_SANDBOX_PASSKEY")||!env("FIN_MPESA_SANDBOX_SHORTCODE"))
  return out({state:"Pending",message:"Sandbox credentials have not been configured"});
 const admin=createClient(url,sec,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:intent,error:intentError}=await admin.from("pos_payment_intents")
  .select("id,company_id,checkout_request_id,amount,state").eq("id",intent_id)
  .eq("company_id",company_id).eq("provider","Safaricom Daraja").single();
 if(intentError||!intent)return out({error:"Payment request unavailable"},404);
 if(!intent.checkout_request_id)return out({state:"Pending",message:"Waiting for Daraja to acknowledge the request"});
 const checkout=intent.checkout_request_id;
 const shortcode=env("FIN_MPESA_SANDBOX_SHORTCODE");
 const timestamp=new Date().toISOString().replace(/[-:T.Z]/g,"").slice(0,14);
 const password=btoa(shortcode+env("FIN_MPESA_SANDBOX_PASSKEY")+timestamp);
 const bearer=await darajaAuth();
 const query=await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",{
  method:"POST",headers:{Authorization:"Bearer "+bearer,"Content-Type":"application/json"},
  body:JSON.stringify({BusinessShortCode:shortcode,Password:password,Timestamp:timestamp,CheckoutRequestID:checkout}),
  signal:AbortSignal.timeout(11000)
 });
 const answer=await query.json();
 if(!query.ok||String(answer.ResponseCode)!=="0")
  return out({state:"Pending",message:"Awaiting final Daraja status"});
 const result=String(answer.ResultCode??"");
 const {data:callback,error:callbackError}=await admin.from("pos_mpesa_callback_events")
  .select("provider_result_code,receipt_number,callback_amount").eq("intent_id",intent_id)
  .eq("checkout_request_id",checkout).maybeSingle();
 if(callbackError)throw Error("Unable to check provider confirmation");
 if(result==="0"&&callback?.provider_result_code==="0"&&callback?.receipt_number&&
    Number(callback.callback_amount)===Number(intent.amount)){
  const {data:verified,error:verifyError}=await admin.rpc("pos_mpesa_service",{
   p_action:"confirm",p_intent:intent_id,p_checkout:checkout,p_result_code:"0",
   p_receipt:callback.receipt_number,p_amount:Number(intent.amount)});
  if(verifyError)throw Error("Payment verified but could not be posted: "+verifyError.message);
  return out({state:"Confirmed",receipt:verified.receipt,message:"M-Pesa payment verified"});
 }
 if(result!==""&&result!=="0"&&callback&&callback.provider_result_code===result){
  const {error:failError}=await admin.rpc("pos_mpesa_service",{
   p_action:"fail",p_intent:intent_id,p_result_code:result,
   p_description:"Daraja confirmed that the payment was not completed"});
  if(failError)throw Error("Unable to record failed payment");
  return out({state:"Failed",message:"M-Pesa payment was not completed"});
 }
 return out({state:"Pending",message:result==="0"?"Waiting for matching Safaricom receipt callback":"Awaiting final Daraja confirmation"});
 }catch(e){return out({error:String(e?.message||"M-Pesa status unavailable")},500)}
});