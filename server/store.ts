import fs from 'node:fs/promises';
import { retainOffers, retainAuctions } from './retention.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuctionListing, Order, Product, StoreOffer } from '../shared/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = process.env.DATA_DIR || path.join(root, 'data');
const productsFile = path.join(root, 'data', 'products.json');
const ordersFile = path.join(dataRoot, 'orders.json');
const auctionsFile = path.join(dataRoot, 'auctions.json');
const offersFile = path.join(dataRoot, 'offers.json');
let writeQueue = Promise.resolve();

async function ensureDataRoot(){ await fs.mkdir(dataRoot,{recursive:true}); }

export async function getProducts(): Promise<Product[]> { return JSON.parse(await fs.readFile(productsFile, 'utf8')); }
export async function getOrders(): Promise<Order[]> { try { return JSON.parse(await fs.readFile(ordersFile, 'utf8')); } catch { return []; } }
export async function saveOrders(orders: Order[]) { await ensureDataRoot(); writeQueue = writeQueue.then(() => fs.writeFile(ordersFile, JSON.stringify(orders, null, 2))); return writeQueue; }
export async function saveProducts(products: Product[]) { await fs.writeFile(productsFile, JSON.stringify(products, null, 2)); }

// Serialize cleanup with reads/writes; persist with rename so readers never see partial JSON.
function queued<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}
async function readItems<T>(file: string): Promise<T[]> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
async function writeItems<T>(file: string, items: T[]) {
  await ensureDataRoot();
  await fs.writeFile(file + '.tmp', JSON.stringify(items, null, 2));
  await fs.rename(file + '.tmp', file);
}
function retainedStore<T>(file: string, retain: (items: T[]) => T[]) {
  return {
    get: () => queued(async () => {
      const items = await readItems<T>(file);
      const before = JSON.stringify(items);
      const kept = retain(items);
      if (JSON.stringify(kept) !== before) await writeItems(file, kept);
      return kept;
    }),
    save: (items: T[]) => queued(() => writeItems(file, retain(items)))
  };
}
const auctions = retainedStore<AuctionListing>(auctionsFile, retainAuctions);
const offers = retainedStore<StoreOffer>(offersFile, retainOffers);
export const getAuctions = auctions.get;
export const saveAuctions = auctions.save;
export const getOffers = offers.get;
export const saveOffers = offers.save;
export async function cleanupProcessedData() { await getOffers(); await getAuctions(); }
