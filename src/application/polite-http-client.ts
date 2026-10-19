import type { HttpClient, HttpResponse, NetworkFailure } from './ports/http-client.js';
import type { Sleeper } from './ports/sleeper.js';

/**
 * Spaces out requests: waits the delay before every request except the first.
 * The wait is separate from the request (`waitTurn` then `send`) so callers can time the request alone.
 */
export class PoliteHttpClient implements HttpClient {
  private hasRequested = false;

  constructor(
    private readonly inner: HttpClient,
    private readonly sleeper: Sleeper,
    private delayMs: number,
  ) {}

  raiseDelayTo(ms: number): void {
    this.delayMs = Math.max(this.delayMs, ms);
  }

  async waitTurn(): Promise<void> {
    if (this.hasRequested) await this.sleeper.sleep(this.delayMs);
    this.hasRequested = true;
  }

  send(url: string): Promise<HttpResponse | NetworkFailure> {
    return this.inner.get(url);
  }

  async get(url: string): Promise<HttpResponse | NetworkFailure> {
    await this.waitTurn();
    return this.send(url);
  }
}
