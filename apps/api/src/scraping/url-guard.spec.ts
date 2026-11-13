import { assertPublicUrl, isPrivateAddress, UnsafeUrlError } from './url-guard';

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.16.5.5', '169.254.169.254', '100.64.0.1', '0.0.0.0'])(
    'treats IP %s as private',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(true);
    },
  );

  it.each(['8.8.8.8', '93.184.216.34', '1.1.1.1'])('treats IP %s as public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it.each(['::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1'])('treats IPv6 %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
});

describe('assertPublicUrl', () => {
  it('rejects protocols other than http and https', async () => {
    await expect(assertPublicUrl('file:///etc/passwd', false)).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects malformed URLs', async () => {
    await expect(assertPublicUrl('not a url', false)).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects literal private IP addresses', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data', false)).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl('http://127.0.0.1:3000', false)).rejects.toThrow(UnsafeUrlError);
  });

  it('accepts any http host when ALLOW_PRIVATE_HOSTS is enabled', async () => {
    await expect(assertPublicUrl('http://127.0.0.1:4000/x', true)).resolves.toBeInstanceOf(URL);
  });
});
