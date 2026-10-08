export type CartItem={domain:string;priceUsd:number|null;currency:'USD';addedAt:number};
const key='cubixtop-domain-cart';
export function getCart():CartItem[]{if(typeof window==='undefined')return[];try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.domain==='string').slice(0,20):[];}catch{return[];}}
export function saveCart(items:CartItem[]){localStorage.setItem(key,JSON.stringify(items));window.dispatchEvent(new Event('cubixtop-cart'));}
export function addCartItem(item:Omit<CartItem,'addedAt'>){const items=getCart();if(!items.some(value=>value.domain===item.domain))items.push({...item,addedAt:Date.now()});saveCart(items);return items;}
export function removeCartItem(domain:string){const items=getCart().filter(item=>item.domain!==domain);saveCart(items);return items;}
