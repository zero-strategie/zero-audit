interface RequestLike {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly ip: string;
}

const REAL_IP_HEADER = 'x-real-ip';

/**
 * The API is not routed publicly, so the web server in front of it is the only client that can set
 * `X-Real-IP`; Fastify is deliberately left without `trustProxy`.
 */
export const clientIpOf = ({ headers, ip }: RequestLike): string => {
  const forwarded = headers[REAL_IP_HEADER];
  const value = typeof forwarded === 'string' ? forwarded.trim() : '';
  return value === '' ? ip : value;
};
