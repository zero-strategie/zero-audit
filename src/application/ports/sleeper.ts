export interface Sleeper {
  /** Resolves after `ms`, or as soon as `signal` fires. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
