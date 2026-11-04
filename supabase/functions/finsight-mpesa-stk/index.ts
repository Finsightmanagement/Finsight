import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")||"";
const secrets=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
const publishes=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
const publishable=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||publishes.default||"";
const serviceSecret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||secrets.default||"";
const allowedOrigin="*";
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Headers":"authorization,apikey,content-type"};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const env=(name)=>Deno.env.get(name)||"";
function configured(company){
 return Boolean(company&&company===env("FIN_MPESA_SANDBOX_COMPANY_ID")
 &&env("FIN_MPESA_SANDBOX_CONSUMER_KEY")&&env("FIN_MPESA_SANDBOX_CONSUMER_SECRET")
 &&env("FIN_MPESA_SANDBOX_PASSKEY")&&env("FIN_MPESA_SANDBOX_SHORTCODE")
 &&env("FIN_MPESA_SANDBOX_CALLBACK_TOKEN")?.length>=32
 &&publishable&&serviceSecret&&url);
}
async function token(){
 const credentials=btoa(env("FIN_MPESA_SANDBOX_CONSUMER_KEY")+":"+env("FIN_MPESA_SANDBOX_CONSUMER_SECRET"));
 const response=await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",{
  headers:{Authorization:"Basic "+credentials},signal:AbortSignal.timeout(11000)});
 const data=await response.json();
 if(!response.ok||!data.access_token)throw Error("Daraja sandbox authorization failed");
 return data.access_token;
}
function normalizePhone(raw){
 let p=String(raw||"").replace(/[\s()+-]/g,"");
 if(/^0[17]\d{8}$/.test(p))p="254"+p.slice(1);
 if(!/^254[17]\d{8}$/.test(p))throw Error("Enter a valid Kenyan M-Pesa phone number");
 return p;
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return response({error:"POST required"},405);
 try{
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer ")||!publishable||!url)return response({error:"Sign in required"},401);
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await userClient.auth.getUser();
 if(userError||!user)return response({error:"Your POS login has expired"},401);
 const body=await req.json();
 const {company_id,outlet_id,employee_token,order_id,payment_type_id,request_id}=body;
 if(!configured(company_id))return response({error:"M-Pesa sandbox is not yet configured for this company. No request was sent."},409);
 const amount=Number(body.amount);
 if(!Number.isSafeInteger(amount)||amount<=0||amount>150000)return response({error:"Enter a whole-shilling M-Pesa amount"},400);
 const phone=normalizePhone(body.phone);
 const {data:intent,error:prepareError}=await userClient.rpc("pos_mpesa_prepare",{
  p_company:company_id,p_outlet:outlet_id,p_token:employee_token,p_order:order_id,
  p_amount:amount,p_request:request_id,p_method:payment_type_id});
 if(prepareError)return response({error:prepareError.message},403);
 if(intent.reused){
   return response({intent_id:intent.intent_id,state:intent.state,reused:true,
     message:intent.checkout_request_id?"Existing request was already sent. Check its status.":"Request already exists; check its status before retrying."});
 }
 const admin=createClient(url,serviceSecret,{auth:{persistSession:false,autoRefreshToken:false}});
 const bearer=await token();
 const shortcode=env("FIN_MPESA_SANDBOX_SHORTCODE");
 const timestamp=new Date().toISOString().replace(/[-:T.Z]/g,"").slice(0,14);
 const password=btoa(shortcode+env("FIN_MPESA_SANDBOX_PASSKEY")+timestamp);
 const callbackUrl=url+"/functions/v1/finsight-mpesa-callback?token="+encodeURIComponent(env("FIN_MPESA_SANDBOX_CALLBACK_TOKEN"));
 const r=await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",{
  method:"POST",headers:{"Authorization":"Bearer "+bearer,"Content-Type":"application/json"},
  body:JSON.stringify({BusinessShortCode:shortcode,Password:password,Timestamp:timestamp,
   TransactionType:"CustomerPayBillOnline",Amount:amount,PartyA:phone,PartyB:shortcode,
   PhoneNumber:phone,CallBackURL:callbackUrl,AccountReference:String(order_id).slice(0,12),
   TransactionDesc:"FinSight POS"}),
  signal:AbortSignal.timeout(14000)
 });
 const result=await r.json();
 if(!r.ok||String(result.ResponseCode)!=="0"||!result.CheckoutRequestID){
  await admin.rpc("pos_mpesa_service",{p_action:"fail",p_intent:intent.intent_id,
   p_result_code:String(result.ResponseCode||result.errorCode||"REJECTED"),
   p_description:String(result.ResponseDescription||result.errorMessage||"Sandbox request declined")});
  return response({intent_id:intent.intent_id,state:"Failed",error:"Safaricom sandbox declined the STK request"},409);
 }
 const ack=await admin.rpc("pos_mpesa_service",{p_action:"ack",p_intent:intent.intent_id,
  p_checkout:String(result.CheckoutRequestID),p_description:String(result.CustomerMessage||"STK prompt initiated")});
 if(ack.error)throw Error("STK request was sent, but its tracking record needs administrator attention");
 return response({intent_id:intent.intent_id,state:"Pending",message:"STK request accepted by Daraja. Do not mark Paid until verified."});
 }catch(e){return response({error:String(e?.message||"Unable to initiate M-Pesa request")},500)}
});