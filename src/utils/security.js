import { timingSafeEqual, createHash } from 'node:crypto';

export const digest = (text) => createHash('sha256').update(text).digest('hex');
export function secureEqual(left, right) {
  return timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
