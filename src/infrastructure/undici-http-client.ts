import { fetch } from 'undici';
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
}

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  if (typeof code === 'string') return code;
  return errorCode(cause);
};

const classify = (error: unknown): NetworkFailureKind => {
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  const code = errorCode(error);
  if (code !== undefined && DNS_ERROR_CODES.has(code)) return 'dns';
  if (code !== undefined && CONNECTION_ERROR_CODES.has(code)) return 'connection';
  return 'other';
};

export class UndiciHttpClient implements HttpClient {
  private readonly timeoutMs: number;
  private readonly maxBodyBytes: number;

  constructor(private readonly options: UndiciHttpClientOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  }

  async get(url: string): Promise<HttpResponse | NetworkFailure> {
    const startedAt = this.options.clock.now();
    try {
      const response = await fetch(url, {
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
        responseTimeMs: this.options.clock.now() - startedAt,
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
