import { lookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, fetch } from 'undici';
import { PrivateAddressRejected } from '../domain/errors.js';
import { isPublicAddress, normalizeIpLiteral } from '../domain/network-address.js';
import type { Clock } from '../application/ports/clock.js';
import type {
  HttpClient,
  HttpResponse,
  NetworkFailure,
  NetworkFailureKind,
} from '../application/ports/http-client.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;
const DNS_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

export interface UndiciHttpClientOptions {
  clock: Clock;
  userAgent: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  /** Refuse hosts that are, or resolve to, non-public addresses (SSRF guard). */
  blockPrivateAddresses?: boolean;
  /** Name resolution used by the guard; injected in tests to avoid the network. */
  resolver?: (hostname: string) => Promise<LookupAddress[]>;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

const systemResolver = (hostname: string): Promise<LookupAddress[]> =>
  new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses);
    });
  });

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  if (typeof code === 'string') return code;
  return errorCode(cause);
};

const isBlocked = (error: unknown): boolean => {
  if (error instanceof PrivateAddressRejected) return true;
  return error instanceof Error && error.cause !== undefined && isBlocked(error.cause);
};

const isNonPublicLiteral = (url: string): boolean => {
  const host = normalizeIpLiteral(new URL(url).hostname);
  return isIP(host) !== 0 && !isPublicAddress(host);
};

const classify = (error: unknown): NetworkFailureKind => {
  if (isBlocked(error)) return 'blocked';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  const code = errorCode(error);
  if (code !== undefined && DNS_ERROR_CODES.has(code)) return 'dns';
  if (code !== undefined && CONNECTION_ERROR_CODES.has(code)) return 'connection';
  return 'other';
};

export class UndiciHttpClient implements HttpClient {
  private readonly timeoutMs: number;
  private readonly maxBodyBytes: number;
  private readonly guardedAgent: Agent | undefined;

  constructor(private readonly options: UndiciHttpClientOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.guardedAgent = options.blockPrivateAddresses
      ? new Agent({ connect: { lookup: this.publicLookup.bind(this) } })
      : undefined;
  }

  /**
   * Node's connect() may ask for every address (`all: true`, autoSelectFamily) or for a
   * single one; both forms must return only public addresses.
   */
  private publicLookup(hostname: string, options: LookupOptions, callback: LookupCallback) {
    const resolve = this.options.resolver ?? systemResolver;
    resolve(hostname).then(
      (addresses) => {
        const publicAddresses = addresses.filter(({ address }) => isPublicAddress(address));
        const [first] = publicAddresses;
        if (first === undefined) {
          callback(new PrivateAddressRejected(hostname, addresses[0]?.address ?? 'none'), []);
        } else if (options.all === true) {
          callback(null, publicAddresses);
        } else {
          callback(null, first.address, first.family);
        }
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), []);
      },
    );
  }

  async get(url: string): Promise<HttpResponse | NetworkFailure> {
    const startedAt = this.options.clock.now();
    try {
      if (this.guardedAgent && isNonPublicLiteral(url)) {
        throw new PrivateAddressRejected(new URL(url).hostname, new URL(url).hostname);
      }
      const response = await fetch(url, {
        ...(this.guardedAgent && { dispatcher: this.guardedAgent }),
        redirect: 'manual',
        headers: { 'user-agent': this.options.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const { body, truncated } = await this.readBody(response.body);
      return {
        url,
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body,
        truncated,
        responseTimeMs: Math.round(this.options.clock.now() - startedAt),
      };
    } catch (error) {
      return {
        url,
        kind: classify(error),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readBody(
    stream: ReadableStream<Uint8Array> | null,
  ): Promise<{ body: string; truncated: boolean }> {
    if (stream === null) return { body: '', truncated: false };
    const chunks: Uint8Array[] = [];
    let received = 0;
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (received > this.maxBodyBytes) {
        await reader.cancel();
        break;
      }
    }
    const bytes = Buffer.concat(chunks);
    const truncated = bytes.byteLength > this.maxBodyBytes;
    const kept = truncated ? bytes.subarray(0, this.maxBodyBytes) : bytes;
    return { body: new TextDecoder().decode(kept), truncated };
  }
}
