import type {PaymentLaunch} from './payment-catalog';
type RazorpayResult={razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string};
declare global{interface Window{
 Cashfree?:(config:{mode:'sandbox'|'production'})=>{checkout:(config:{paymentSessionId:string;redirectTarget:string})=>Promise<unknown>};
 Razorpay?:new(options:Record<string,unknown>)=>{open:()=>void;on:(event:string,callback:(value:unknown)=>void)=>void};
 Paytm?:{CheckoutJS:{init:(config:Record<string,unknown>)=>Promise<void>;invoke:()=>void;onLoad?:(callback:()=>void)=>void}};
}}
const scripts=new Map<string,Promise<void>>();
function loadScript(src:string){const cached=scripts.get(src);if(cached)return cached;const promise=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;const timeout=setTimeout(()=>{script.remove();scripts.delete(src);reject(new Error('Payment service took too long to load. Resume this payment from your dashboard.'));},20000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();scripts.delete(src);reject(new Error('Payment service could not load. Resume this payment from your dashboard.'));};document.head.appendChild(script);});scripts.set(src,promise);return promise;}
export async function launchPayment(data:PaymentLaunch,contact:{name:string;email?:string;phone:string}){
 const returnUrl='/payment/return?order_id='+encodeURIComponent(data.orderId);
 if(data.provider==='cashfree'){if(!window.Cashfree)await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');if(!window.Cashfree||!data.paymentSessionId)throw new Error('Cashfree checkout is unavailable.');await window.Cashfree({mode:data.mode}).checkout({paymentSessionId:data.paymentSessionId,redirectTarget:'_self'});return;}
 if(data.provider==='razorpay'){
  if(!window.Razorpay)await loadScript('https://checkout.razorpay.com/v1/checkout.js');if(!window.Razorpay)throw new Error('Razorpay checkout is unavailable.');
  await new Promise<void>((resolve,reject)=>{const checkout=new window.Razorpay!({key:data.keyId,order_id:data.gatewayOrderId,amount:Math.round(data.amount*100),currency:'INR',name:'Cubixtop',description:'Domain registration',prefill:{name:contact.name,email:contact.email,contact:contact.phone},modal:{ondismiss:()=>reject(new Error('Checkout closed. Resume this payment from your dashboard.'))},handler:async(result:RazorpayResult)=>{try{const response=await fetch('/api/payments/razorpay/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:data.orderId,...result})});if(!response.ok)throw new Error('Payment confirmation is pending. Check your dashboard before paying again.');location.assign(returnUrl);resolve();}catch(error){reject(error);}}});checkout.on('payment.failed',()=>reject(new Error('Payment was unsuccessful. Resume this order from your dashboard to try again.')));checkout.open();});return;
 }
 if(data.provider==='paytm'){
  const base=data.mode==='production'?'https://secure.paytmpayments.com':'https://securestage.paytmpayments.com';
  await loadScript(`${base}/merchantpgpui/checkoutjs/merchants/${encodeURIComponent(data.mid||'')}.js`);
  const checkout=window.Paytm?.CheckoutJS;if(!checkout)throw new Error('Paytm checkout is unavailable.');
  await checkout.init({root:'',flow:'DEFAULT',data:{orderId:data.gatewayOrderId,token:data.token,tokenType:'TXN_TOKEN',amount:data.amount.toFixed(2)},merchant:{mid:data.mid,redirect:true},handler:{notifyMerchant:(event:string)=>{if(event==='APP_CLOSED')location.assign(returnUrl);}}});checkout.invoke();return;
 }
 if(data.formAction&&data.fields){const form=document.createElement('form');form.method='POST';form.action=data.formAction;for(const [name,value] of Object.entries(data.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}document.body.appendChild(form);form.submit();return;}
 if(data.redirectUrl){location.assign(data.redirectUrl);return;}
 throw new Error('No checkout method was returned by the gateway.');
}
