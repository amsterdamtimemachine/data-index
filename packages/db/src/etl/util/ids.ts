/**
 * Deterministic feature ids. RFC 4122 name-based (v5) UUID derived from a
 * dataset id + the source's stable natural key.
 */
import { createHash } from 'crypto';

// Fixed namespace for deriving deterministic feature ids. Arbitrary constant —
// it only needs to stay the same across runs.
const FEATURE_ID_NAMESPACE = '9f1a7b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b';

/** RFC 4122 name-based (v5) UUID from a namespace UUID + a name string. */
function uuidv5(name: string, namespace: string): string {
  const nsBytes = Uint8Array.from(Buffer.from(namespace.replace(/-/g, ''), 'hex'));
  const bytes = createHash('sha1').update(nsBytes).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10x
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Deterministic feature UUID from a dataset id + the source's stable natural key.
 * The dataset id namespaces the key, so identical keys in different datasets
 * (e.g. a bare integer) don't collide.
 */
export function featureUuid(datasetId: string, key: string): string {
  return uuidv5(`${datasetId}:${key}`, FEATURE_ID_NAMESPACE);
}
