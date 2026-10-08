export const paymentProviders = ['cashfree', 'razorpay', 'paytm', 'payu', 'easebuzz'] as const;
export type PaymentProvider = typeof paymentProviders[number];
export type PaymentEnvironment = 'sandbox' | 'production';
export type PaymentConfig = { provider: PaymentProvider; environment: PaymentEnvironment; credentials: Record<string,string>; connection?: { verified: boolean; checkedAt: string; scope: 'api'|'payment' } };
export const paymentCatalog: Record<PaymentProvider, {name:string; docs:string; fields:{key:string; label:string; secret?:boolean; hint?:string}[]}> = {
  cashfree:{name:'Cashfree',docs:'https://www.cashfree.com/docs/payments/online/web',fields:[{key:'appId',label:'App ID'},{key:'secretKey',label:'Secret key',secret:true}]},
  razorpay:{name:'Razorpay',docs:'https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/',fields:[{key:'keyId',label:'Key ID',hint:'Use rzp_test_ keys for sandbox and rzp_live_ keys for production.'},{key:'keySecret',label:'Key secret',secret:true},{key:'webhookSecret',label:'Webhook secret',secret:true,hint:'Set the same secret in the Razorpay webhook dashboard. Enable order.paid and payment.captured.'}]},
  paytm:{name:'Paytm',docs:'https://www.paytmpayments.com/docs/js-checkout/',fields:[{key:'mid',label:'Merchant ID (MID)'},{key:'merchantKey',label:'Merchant key',secret:true,hint:'The 16-character key for the selected environment.'},{key:'websiteName',label:'Website name',hint:'Usually WEBSTAGING for sandbox or DEFAULT for production.'}]},
  payu:{name:'PayU / PayUMoney',docs:'https://docs.payu.in/docs/prebuilt-checkout-page-integration',fields:[{key:'merchantKey',label:'Merchant key'},{key:'salt',label:'Merchant salt',secret:true,hint:'Use the key and salt issued for PayU Hosted Checkout.'}]},
  easebuzz:{name:'Easebuzz',docs:'https://docs.easebuzz.in/',fields:[{key:'merchantKey',label:'Merchant key'},{key:'salt',label:'Merchant salt',secret:true}]},
};
export type PaymentLaunch = {
  provider:PaymentProvider; orderId:string; amount:number; currency:'INR'; mode:PaymentEnvironment;
  paymentSessionId?:string; gatewayOrderId?:string; keyId?:string; mid?:string; token?:string;
  redirectUrl?:string; formAction?:string; fields?:Record<string,string>;
};
