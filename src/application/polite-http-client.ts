import type { HttpClient, HttpResponse, NetworkFailure } from './ports/http-client.js';
import type { Sleeper } from './ports/sleeper.js';

/** Spaces out requests: waits `delayMs` before every request except the first. */
export class PoliteHttpClient implements HttpClient {
  private hasRequested = false;

  constructor(
    private readonly inner: HttpClient,
    private readonly sleeper: Sleeper,
    public delayMs: number,
  ) {}

  async get(url: string): Promise<HttpResponse | NetworkFailure> {
    if (this.hasRequested) await this.sleeper.sleep(this.delayMs);
    this.hasRequested = true;
    return this.inner.get(url);
  }
}
