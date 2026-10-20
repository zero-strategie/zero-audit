import type { StorageHealth } from './ports/storage-health.js';

export type HealthStatus = 'ok' | 'unavailable';

export class CheckHealth {
  constructor(private readonly storage: StorageHealth) {}

  async execute(): Promise<HealthStatus> {
    try {
      await this.storage.ping();
      return 'ok';
    } catch {
      return 'unavailable';
    }
  }
}
