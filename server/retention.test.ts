import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retainOffers, retainAuctions, REJECTED_RETENTION_MS, ACCEPTED_RETENTION_MS } from './retention.js';
const now = Date.parse('2026-11-05T12:00:00Z');
const stamp = (age: number) => new Date(now - age).toISOString();
test('rejected offers expire after 3 days and accepted offers after 14 days', () => {
  for (const [state, duration] of [
    [{status:'cancelled'}, REJECTED_RETENTION_MS],
    [{status:'pending',priceProposalStatus:'rejected'}, REJECTED_RETENTION_MS],
    [{status:'sold'}, ACCEPTED_RETENTION_MS],
    [{status:'pending',priceProposalStatus:'accepted'}, ACCEPTED_RETENTION_MS]
  ] as const) {
    const item = {...state, retentionStartedAt:stamp(duration), images:['large screenshot']} as any;
    assert.equal(retainOffers([item], now-1).length,1);
    assert.equal(retainOffers([item], now).length,0);
  }
});
test('Buy records keep all screenshots and data regardless of age or price decision', () => {
  for (const priceProposalStatus of ['accepted','rejected',undefined]) {
    const item = {status:'active',priceProposalStatus,acceptedAt:stamp(365*86400000),retentionStartedAt:stamp(365*86400000),images:['keep'],accountData:{level:100}} as any;
    assert.deepEqual(retainOffers([item],now),[item]);
    assert.deepEqual(item.images,['keep']);
    assert.equal(item.accountData.level,100);
    assert.equal(item.retentionStartedAt,undefined);
  }
});
test('unprocessed offers survive and reset the decision clock', () => {
  const item = {status:'pending',priceProposalStatus:'pending',retentionStartedAt:stamp(REJECTED_RETENTION_MS*2)} as any;
  assert.equal(retainOffers([item],now).length,1);
  assert.equal(item.retentionStartedAt,undefined);
});
test('legacy records get a persistent grace period', () => {
  const item = {status:'pending',priceProposalStatus:'rejected'} as any;
  retainOffers([item],now);
  const restarted = JSON.parse(JSON.stringify(item));
  assert.equal(retainOffers([restarted],now+REJECTED_RETENTION_MS-1).length,1);
  assert.equal(retainOffers([restarted],now+REJECTED_RETENTION_MS).length,0);
});
test('closed auctions expire with their bids; active auctions remain', () => {
  assert.equal(retainAuctions([{status:'deal',retentionStartedAt:stamp(ACCEPTED_RETENTION_MS),bids:[{status:'accepted'},{status:'rejected'}]} as any],now).length,0);
  assert.equal(retainAuctions([{status:'active'} as any],now).length,1);
});
test('invalid old timestamps receive a grace period', () => {
  const item = {status:'cancelled',retentionStartedAt:'invalid'} as any;
  assert.equal(retainOffers([item],now).length,1);
  assert.equal(item.retentionStartedAt,stamp(0));
});

import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';

import path from 'node:path';

test('storage cleanup persists removal and rejects expired stale snapshots', async () => {
  const dir = await mkdtemp(path.join(process.cwd(), 'data', 'retention-test-'));
  process.env.DATA_DIR = dir;
  try {
    const store = await import('./store.js');
    const expired = {id:'old',status:'cancelled',retentionStartedAt:new Date(Date.now()-REJECTED_RETENTION_MS-1000).toISOString(),images:['screenshot']} as any;
    const fresh = {id:'new',status:'pending',images:['keep']} as any;
    await writeFile(path.join(dir,'offers.json'),JSON.stringify([expired,fresh]));
    await store.cleanupProcessedData();
    assert.deepEqual(JSON.parse(await readFile(path.join(dir,'offers.json'),'utf8')).map((x:any)=>x.id),['new']);
    await store.saveOffers([expired,fresh]);
    assert.deepEqual((await store.getOffers()).map(x=>x.id),['new']);
    await writeFile(path.join(dir,'offers.json'),'{broken');
    await assert.rejects(store.getOffers());
    assert.equal(await readFile(path.join(dir,'offers.json'),'utf8'),'{broken');
    await writeFile(path.join(dir,'offers.json'),'[]');
    assert.deepEqual(await store.getOffers(),[]);
  } finally {
    delete process.env.DATA_DIR;
    await rm(dir,{recursive:true,force:true});
  }
});

