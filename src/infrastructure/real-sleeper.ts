import { setTimeout } from 'node:timers/promises';
import type { Sleeper } from '../application/ports/sleeper.js';

export class RealSleeper implements Sleeper {
  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    try {
      await setTimeout(ms, undefined, { signal });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
    }
  }
}
