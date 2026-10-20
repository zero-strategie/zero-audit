import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPublicAddress, normalizeIpLiteral } from '../../src/domain/network-address.js';
import { PrivateAddressRejected } from '../../src/domain/errors.js';

const PRIVATE_IPV4 = [
  '127.0.0.1',
  '127.255.255.254',
  '10.0.0.0',
  '10.255.255.255',
  '172.16.0.0',
  '172.31.255.255',
  '192.168.0.0',
  '192.168.255.255',
  '169.254.0.0',
  '169.254.169.254',
  '100.64.0.0',
  '100.127.255.255',
  '0.0.0.0',
  '0.255.255.255',
  '224.0.0.1',
  '239.255.255.255',
  '240.0.0.0',
  '255.255.255.254',
  '255.255.255.255',
];
const JUST_OUTSIDE = ['172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0'];
const PRIVATE_IPV6 = ['::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', 'febf::1'];
const MAPPED = ['::ffff:127.0.0.1', '::ffff:8.8.8.8', '::ffff:7f00:1'];
const PUBLIC = ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888'];
const NOT_AN_IP = ['example.com', '999.1.1.1', '', '1.2.3', '0x7f.1', '2130706433', '1::2::3'];

describe('isPublicAddress', () => {
  it.each(PRIVATE_IPV4)('rejects IPv4 %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(JUST_OUTSIDE)('accepts %s just outside a private range', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it.each(PRIVATE_IPV6)('rejects IPv6 %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(MAPPED)('rejects IPv4-mapped %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it('strips brackets before analysis', () => {
    expect(isPublicAddress('[::1]')).toBe(false);
    expect(isPublicAddress('[2001:4860:4860::8888]')).toBe(true);
  });
  it.each(PUBLIC)('accepts public %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it.each(NOT_AN_IP)('rejects non-IP %j', (value) => {
    expect(isPublicAddress(value)).toBe(false);
  });
  it('does not import any node: module', () => {
    const source = readFileSync(
      new URL('../../src/domain/network-address.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"]node:/);
  });
});

describe('normalizeIpLiteral', () => {
  it('removes surrounding brackets', () => {
    expect(normalizeIpLiteral('[::1]')).toBe('::1');
    expect(normalizeIpLiteral('1.2.3.4')).toBe('1.2.3.4');
  });
});

describe('PrivateAddressRejected', () => {
  it('carries the host and the rejected address', () => {
    const error = new PrivateAddressRejected('intranet.example', '10.0.0.1');
    expect(error.host).toBe('intranet.example');
    expect(error.address).toBe('10.0.0.1');
    expect(error.name).toBe('PrivateAddressRejected');
  });
});
