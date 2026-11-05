import type { AuctionListing, StoreOffer } from '../shared/types.js';

export const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

// Missing decision dates on old records start their grace period at migration.
export function retainOffers(items: StoreOffer[], now = Date.now()): StoreOffer[] {
  return items.filter(item => {
    const processed = item.status !== 'pending' || ['accepted', 'rejected'].includes(item.priceProposalStatus || '');
    if (!processed) { delete item.retentionStartedAt; return true; }
    item.retentionStartedAt ||= item.acceptedAt || new Date(now).toISOString();
    const started = Date.parse(item.retentionStartedAt);
    if (!Number.isFinite(started)) { item.retentionStartedAt = new Date(now).toISOString(); return true; }
    return now - started < RETENTION_MS;
  });
}

export function retainAuctions(items: AuctionListing[], now = Date.now()): AuctionListing[] {
  return items.filter(item => {
    if (item.status === 'active') { delete item.retentionStartedAt; return true; }
    item.retentionStartedAt ||= new Date(now).toISOString();
    const started = Date.parse(item.retentionStartedAt);
    if (!Number.isFinite(started)) { item.retentionStartedAt = new Date(now).toISOString(); return true; }
    return now - started < RETENTION_MS;
  });
}
