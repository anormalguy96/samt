/**
 * Pure deterministic hashing & collision-resistant ID utilities.
 * Compatible with both Node.js 22 and modern browsers (no Node-only imports).
 */

export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`).join(',')}}`;
}

/**
 * Computes a hex SHA-256 hash over canonical JSON representation using standard Web Crypto API
 * (globally available in both Node.js 22 and modern browsers).
 */
export async function canonicalPayloadHash(payload: unknown): Promise<string> {
  const canonical = canonicalizeJson(payload);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateId(prefix: string): string {
  const uuid = globalThis.crypto.randomUUID();
  return `${prefix}-${uuid}`;
}
