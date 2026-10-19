import { setTimeout } from 'node:timers/promises';
import type { Sleeper } from '../application/ports/sleeper.js';

export class RealSleeper implements Sleeper {
  async sleep(ms: number): Promise<void> {
    await setTimeout(ms);
  }
}
