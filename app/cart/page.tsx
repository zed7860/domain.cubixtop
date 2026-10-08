import CartClient from './cart-client';
export const metadata={title:'Your domain cart'};
export default function Cart(){return <main className="wrap section"><span className="eyebrow">YOUR DOMAIN CART</span><h1 className="title">Review your domains.</h1><p className="muted">Availability and final pricing are checked again securely before each payment.</p><CartClient/></main>}
