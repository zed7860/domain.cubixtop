import { requireUser, HttpError, errorResponse, rateLimit } from '@/lib/auth';
import { db } from '@/lib/db';
import { csvValue } from '@/lib/admin';
export async function GET(req:Request) {
  try {
    const user=await requireUser(true);rateLimit('admin-export:'+user.id,10);
    const kind=new URL(req.url).searchParams.get('kind');
    const queries:Record<string,string>={
      customers:'SELECT id,name,email,phone,address,city,state,postal_code,country,role,email_verified,created_at FROM users ORDER BY created_at DESC',
      orders:'SELECT c.id,c.domain,u.email customer_email,c.status,c.amount_inr,c.registrar_reference,c.failure_reason,c.created_at,c.updated_at FROM checkouts c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC',
      payments:'SELECT p.id,c.domain,u.email customer_email,p.provider,p.status,p.amount_inr,p.gateway_order_id,p.created_at FROM payment_attempts p JOIN checkouts c ON c.id=p.checkout_id JOIN users u ON u.id=c.user_id ORDER BY p.created_at DESC',
    };
    if(!kind||!Object.hasOwn(queries,kind))throw new HttpError('Choose customers, orders or payments.');
    const statement=db.prepare(queries[kind]),headers=statement.columns().map(column=>column.name);
    const rows=statement.all() as Record<string,unknown>[];
    const csv='\uFEFF'+[headers.map(csvValue).join(','),...rows.map(row=>headers.map(key=>csvValue(row[key])).join(','))].join('\r\n');
    return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="cubixtop-${kind}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){return errorResponse(error);}
}

