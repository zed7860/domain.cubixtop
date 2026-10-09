const tables=new Set(['users','sessions','checkouts','auth_tokens','settings','admin_notes','admin_activity','payment_attempts']);
// Replace placeholders and qualify identifiers, leaving quoted values untouched.
export function postgresSql(sql:string){
 let index=0;
 return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?|\b[a-zA-Z_][a-zA-Z_0-9]*\b/g,(token,offset)=>{
  if(token==='?')return '$'+(++index);
  if(token.startsWith("'")||token.startsWith('"'))return token;
  if(tables.has(token.toLowerCase())&&sql[offset-1]!=='.')return 'cubixtop.'+token;
  if(token.toUpperCase()==='LIKE')return 'ILIKE';
  return token;
 });
}
