const IPV4_OCTETS = 4;
const IPV6_GROUPS = 8;
const MAX_OCTET = 255;
const MAPPED_PREFIX_GROUP = 0xffff;

export function normalizeIpLiteral(host: string): string {
  return host.replace(/^\[(.*)\]$/, '$1');
}

type Ipv4 = readonly [number, number, number, number];

function parseOctet(part: string): number | undefined {
  if (!/^\d{1,3}$/.test(part)) return undefined;
  const value = Number(part);
  return value > MAX_OCTET ? undefined : value;
}

function parseIpv4(text: string): Ipv4 | undefined {
  const parts = text.split('.');
  if (parts.length !== IPV4_OCTETS) return undefined;
  const [a, b, c, d] = parts.map(parseOctet);
  if (a === undefined || b === undefined || c === undefined || d === undefined) return undefined;
  return [a, b, c, d];
}

function parseGroups(text: string): number[] | undefined {
  if (text === '') return [];
  const groups: number[] = [];
  const parts = text.split(':');
  for (const [index, part] of parts.entries()) {
    const isLast = index === parts.length - 1;
    const octets = isLast && part.includes('.') ? parseIpv4(part) : undefined;
    if (octets) {
      groups.push(octets[0] * 256 + octets[1], octets[2] * 256 + octets[3]);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return undefined;
    groups.push(parseInt(part, 16));
  }
  return groups;
}

function parseIpv6(text: string): number[] | undefined {
  const [headText = '', tailText, ...extra] = text.split('::');
  if (extra.length > 0) return undefined;
  const head = parseGroups(headText);
  if (!head) return undefined;
  if (tailText === undefined) return head.length === IPV6_GROUPS ? head : undefined;
  const tail = parseGroups(tailText);
  if (!tail || head.length + tail.length >= IPV6_GROUPS) return undefined;
  const zeros = new Array<number>(IPV6_GROUPS - head.length - tail.length).fill(0);
  return [...head, ...zeros, ...tail];
}

function isPublicIpv4([first, second]: Ipv4): boolean {
  if (first === 0 || first === 10 || first === 127) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  return first < 224;
}

function isPublicIpv6(groups: number[]): boolean {
  const [first = 0] = groups;
  const leadingZeros = groups.findIndex((group) => group !== 0);
  if (leadingZeros === -1) return false;
  if (leadingZeros === 7 && groups[7] === 1) return false;
  if (leadingZeros === 5 && groups[5] === MAPPED_PREFIX_GROUP) return false;
  if ((first & 0xfe00) === 0xfc00) return false;
  return (first & 0xffc0) !== 0xfe80;
}

export function isPublicAddress(ip: string): boolean {
  const literal = normalizeIpLiteral(ip);
  const ipv4 = parseIpv4(literal);
  if (ipv4) return isPublicIpv4(ipv4);
  const ipv6 = literal.includes(':') ? parseIpv6(literal) : undefined;
  return ipv6 ? isPublicIpv6(ipv6) : false;
}

export function isIpLiteral(host: string): boolean {
  const literal = normalizeIpLiteral(host);
  return (
    parseIpv4(literal) !== undefined || (literal.includes(':') && parseIpv6(literal) !== undefined)
  );
}
