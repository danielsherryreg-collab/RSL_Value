import type { AuctionListing, StoreOffer } from '../shared/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REJECTED_RETENTION_MS = 3 * DAY_MS;
export const ACCEPTED_RETENTION_MS = 14 * DAY_MS;

// Missing decision dates on old records start their grace period at migration.
export function retainOffers(items: StoreOffer[], now = Date.now()): StoreOffer[] {
  return items.filter(item => {
    // Published accounts power the Buy section: preserve the whole record indefinitely.
    if (item.status === 'active') { delete item.retentionStartedAt; return true; }
    const processed = item.status === 'sold' || item.status === 'cancelled' || ['accepted', 'rejected'].includes(item.priceProposalStatus || '');
    if (!processed) { delete item.retentionStartedAt; return true; }
    item.retentionStartedAt ||= new Date(now).toISOString();
    const started = Date.parse(item.retentionStartedAt);
    if (!Number.isFinite(started)) { item.retentionStartedAt = new Date(now).toISOString(); return true; }
    const rejected = item.status === 'cancelled' || (item.status === 'pending' && item.priceProposalStatus === 'rejected');
    return now - started < (rejected ? REJECTED_RETENTION_MS : ACCEPTED_RETENTION_MS);
  });
}

export function retainAuctions(items: AuctionListing[], now = Date.now()): AuctionListing[] {
  return items.filter(item => {
    if (item.status === 'active') { delete item.retentionStartedAt; return true; }
    item.retentionStartedAt ||= new Date(now).toISOString();
    const started = Date.parse(item.retentionStartedAt);
    if (!Number.isFinite(started)) { item.retentionStartedAt = new Date(now).toISOString(); return true; }
    return now - started < (item.status === 'closed' ? REJECTED_RETENTION_MS : ACCEPTED_RETENTION_MS);
  });
}
