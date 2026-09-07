import fs from 'node:fs/promises';
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
export async function getAuctions(): Promise<AuctionListing[]> { try { return JSON.parse(await fs.readFile(auctionsFile,'utf8')); } catch { return []; } }
export async function saveAuctions(items: AuctionListing[]) { await ensureDataRoot(); writeQueue=writeQueue.then(()=>fs.writeFile(auctionsFile,JSON.stringify(items,null,2))); return writeQueue; }
export async function getOffers(): Promise<StoreOffer[]> { try { return JSON.parse(await fs.readFile(offersFile,'utf8')); } catch { return []; } }
export async function saveOffers(items: StoreOffer[]) { await ensureDataRoot(); writeQueue=writeQueue.then(()=>fs.writeFile(offersFile,JSON.stringify(items,null,2))); return writeQueue; }
