import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { CartLine, Product } from '../shared/types';

interface CartContextValue {
  lines: CartLine[];
  count: number;
  add(product: Product): void;
  remove(productId: string): void;
  clear(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('raid-cart') || '[]'); } catch { return []; }
  });
  useEffect(() => localStorage.setItem('raid-cart', JSON.stringify(lines)), [lines]);
  const value = useMemo(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    add: (product: Product) => setLines(current => current.some(x => x.productId === product.id)
      ? current.map(x => x.productId === product.id ? { ...x, quantity: x.quantity + 1 } : x)
      : [...current, { productId: product.id, quantity: 1 }]),
    remove: (productId: string) => setLines(current => current.filter(x => x.productId !== productId)),
    clear: () => setLines([])
  }), [lines]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('CartProvider is missing');
  return value;
}
