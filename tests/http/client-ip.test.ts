import { describe, expect, it } from 'vitest';
import { clientIpOf } from '../../src/http/client-ip.js';

describe('clientIpOf', () => {
  it('trusts X-Real-IP, which only the web server in front of the API can set', () => {
    expect(clientIpOf({ headers: { 'x-real-ip': '203.0.113.7' }, ip: '172.18.0.2' })).toBe(
      '203.0.113.7',
    );
  });

  it('falls back to the address of the connection without the header', () => {
    expect(clientIpOf({ headers: {}, ip: '172.18.0.2' })).toBe('172.18.0.2');
  });

  it('ignores an empty or repeated header', () => {
    expect(clientIpOf({ headers: { 'x-real-ip': '  ' }, ip: '172.18.0.2' })).toBe('172.18.0.2');
    expect(clientIpOf({ headers: { 'x-real-ip': ['1.1.1.1', '2.2.2.2'] }, ip: '172.18.0.2' })).toBe(
      '172.18.0.2',
    );
  });
});
