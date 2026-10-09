import {getPaymentConfig} from '@/lib/payment-gateways';
import {getRegistrarSettings} from '@/lib/settings';
import {emailReady} from '@/lib/email';
export default async function Readiness(){
 const config=(await getPaymentConfig()),registrar=(await getRegistrarSettings());
 const checks=[
  ['Payment gateway configured',Boolean(config)],
  ['Production payment environment selected',config?.environment==='production'],
  ['Domain registrar configured',Boolean(registrar?.provider==='namesilo'&&registrar.credentials.apiKey||process.env.NAMESILO_API_KEY)],
  ['Public HTTPS site URL configured',Boolean(process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://'))],
  ['Secure session cookies enabled',process.env.COOKIE_SECURE==='true'],
  ['Account and order email configured',emailReady()],
 ] as const;
 return <section className="card"><span className="eyebrow">LAUNCH SETUP</span><h2>Production configuration</h2><div className="grid">{checks.map(([label,ready])=><p key={label}><span className={`status-dot ${ready?'connected':''}`}>{ready?'Configured':'Needs setup'}</span> {label}</p>)}</div><p className="muted fine-print">These checks report saved configuration. Before launch, confirm merchant activation, callbacks, a funded registrar account and one complete payment-to-registration test. Set the website URL, secure cookies and SMTP values in your server environment.</p></section>;
}
