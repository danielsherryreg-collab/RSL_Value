export type Category = 'starter' | 'upgraded' | 'donate';

export interface Product {
  id: string;
  title: string;
  category: Category;
  description: string;
  image: string;
  gallery: string[];
  priceRub: number;
  priceStars: number;
  available: boolean;
  featured?: boolean;
  tags: string[];
  stats?: Record<string, string | number>;
}

export interface CartLine { productId: string; quantity: number }

export interface Order {
  id: string;
  telegramUserId: number;
  username?: string;
  lines: CartLine[];
  amountStars: number;
  status: 'pending' | 'paid' | 'delivering' | 'completed' | 'cancelled' | 'refunded';
  createdAt: string;
  paymentChargeId?: string;
}

export interface AuctionBid {
  id: string;
  telegramUserId: number;
  username?: string;
  amountRub: number;
  createdAt: string;
  status: 'active' | 'accepted' | 'rejected';
}

export interface AuctionListing {
  id: string;
  sellerTelegramUserId: number;
  sellerUsername?: string;
  title: string;
  description: string;
  images: string[];
  askingPriceRub: number;
  estimatedPriceRub?: number;
  status: 'active' | 'deal' | 'closed';
  createdAt: string;
  bids: AuctionBid[];
  acceptedBidId?: string;
}

export interface StoreOffer {
  id: string;
  sellerTelegramUserId: number;
  sellerUsername?: string;
  title: string;
  description: string;
  images: string[];
  offerPriceRub: number;
  retailPriceRub?: number;
  commissionRub?: number;
  estimatedPriceRub: number;
  status: 'pending' | 'active' | 'sold' | 'cancelled';
  createdAt: string;
  acceptedAt?: string;
  acceptedByTelegramUserId?: number;
  acceptedByUsername?: string;
  moderationFlags?: string[];
}
