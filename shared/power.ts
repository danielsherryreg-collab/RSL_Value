/** Canonical account power is stored in millions. Bare values >= 1000 are game units. */
export function parsePower(value: string | number): number | undefined {
  const text = String(value).trim().toLowerCase().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!text) return 0;
  const match = text.match(/^(\d+(?:\.\d*)?|\.\d+)(млн\.?|м|m|million)?$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  return match[2] || amount < 1000 ? amount : amount / 1_000_000;
}
export const normalizePower = (value: string | number): number => parsePower(value) ?? 0;
