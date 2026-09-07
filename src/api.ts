import type { AuctionListing, Order, Product, StoreOffer } from '../shared/types';

const initData = () => window.Telegram?.WebApp.initData || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData(),
      ...options?.headers
    }
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Ошибка запроса');
  return response.json() as Promise<T>;
}

export const api = {
  products: () => request<Product[]>('/products'),
  orders: () => request<Order[]>('/orders'),
  createOrder: (lines: { productId: string; quantity: number }[], promoCode?: string) =>
    request<{ order: Order; invoiceLink?: string }>('/orders', {
      method: 'POST', body: JSON.stringify({ lines, promoCode })
    }),
  auctions: () => request<AuctionListing[]>('/auctions'),
  createAuction: (data:{title:string;description:string;images:string[];askingPriceRub:number;estimatedPriceRub?:number}) => request<AuctionListing>('/auctions',{method:'POST',body:JSON.stringify(data)}),
  placeBid: (id:string,amountRub:number) => request<AuctionListing>(`/auctions/${id}/bids`,{method:'POST',body:JSON.stringify({amountRub})}),
  acceptBid: (id:string,bidId:string) => request<AuctionListing>(`/auctions/${id}/accept`,{method:'POST',body:JSON.stringify({bidId})}),
  offers: () => request<StoreOffer[]>('/offers'),
  offer: (id:string) => request<StoreOffer>(`/offers/${id}`),
  createOffer: (data:{title:string;description:string;images:string[];offerPriceRub:number;estimatedPriceRub:number}) => request<StoreOffer>('/offers',{method:'POST',body:JSON.stringify(data)}),
  adminSession: () => request<{isAdmin:boolean}>('/admin/session'),
  pendingOffers: () => request<StoreOffer[]>('/admin/offers/pending'),
  acceptOffer: (id:string,commissionRub:number) => request<StoreOffer>(`/admin/offers/${id}/accept`,{method:'POST',body:JSON.stringify({commissionRub})})
};
