import nodemailer from 'nodemailer';

function transport() {
  const host=process.env.SMTP_HOST, user=process.env.SMTP_USER, pass=process.env.SMTP_PASSWORD;
  if(!host||!user||!pass) return null;
  return nodemailer.createTransport({host,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user,pass}});
}
export function emailReady(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD);}
export async function sendCubixtopEmail(to:string,subject:string,heading:string,copy:string,action?:{label:string;url:string}){
  const sender=transport();if(!sender)return false;
  const html=`<!doctype html><html><body style="margin:0;background:#f5f6f2;font-family:Arial,sans-serif;color:#12221b"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dce3d5"><tr><td style="padding:30px"><div style="font-weight:800;font-size:20px">CUBIXTOP <span style="color:#fa6400">DOMAINS</span></div><h1 style="font-size:30px;margin:32px 0 16px">${heading}</h1><p style="font-size:16px;line-height:1.7;color:#526158">${copy}</p>${action?`<p style="margin:30px 0"><a href="${action.url}" style="display:inline-block;background:#fa6400;color:#fff;text-decoration:none;padding:14px 20px;font-weight:700">${action.label}</a></p>`:''}<p style="font-size:12px;color:#7b877f;margin-top:36px">Sent by Cubixtop · info@cubixtop.com</p></td></tr></table></td></tr></table></body></html>`;
  await sender.sendMail({from:process.env.EMAIL_FROM||'Cubixtop <info@cubixtop.com>',to,subject,html,text:`${heading}\n\n${copy}${action?`\n\n${action.label}: ${action.url}`:''}\n\nBy Cubixtop`});return true;
}
