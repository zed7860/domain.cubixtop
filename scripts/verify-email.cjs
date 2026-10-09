const nodemailer = require('nodemailer');
async function main() {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass } = process.env;
  if (!host || !user || !pass) throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASSWORD must be configured.');
  const port = Number(process.env.SMTP_PORT || 587), secure = process.env.SMTP_SECURE === 'true';
  if (port === 465 && !secure) throw new Error('Port 465 requires SMTP_SECURE=true.');
  const transport = nodemailer.createTransport({host,port,secure,requireTLS:!secure,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
  try { await transport.verify(); console.log('SMTP connection, TLS and authentication verified. No email was sent.'); }
  finally { transport.close(); }
}
main().catch(error => {
  const response = String(error.response || '').split(process.env.SMTP_PASSWORD || '\0').join('[redacted]');
  console.error('SMTP verification failed:', error.code || error.message, error.responseCode || '', response);
  process.exitCode = 1;
});
