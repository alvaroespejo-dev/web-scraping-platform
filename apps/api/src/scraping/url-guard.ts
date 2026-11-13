import { lookup } from 'dns/promises';
import { isIP } from 'net';

/** Policy error: the URL cannot be visited for security reasons. */
export class UnsafeUrlError extends Error {}

const IPV4_PRIVATE: RegExp[] = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^22[4-9]\./,
  /^2[3-5]\d\./,
];

/** true if the IP points to a private, loopback, link-local or reserved network. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return IPV4_PRIVATE.some((re) => re.test(ip));
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return true; // an unrecognized address is treated as unsafe
}

/**
 * Validates that a URL uses http(s) and that its host only resolves to public addresses.
 * Prevents the scraper from reaching internal services (SSRF).
 */
export async function assertPublicUrl(rawUrl: string, allowPrivateHosts: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Protocol not allowed: ${url.protocol}`);
  }
  if (allowPrivateHosts) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError(`Host ${url.hostname} resolves to a private network`);
  }
  return url;
}
