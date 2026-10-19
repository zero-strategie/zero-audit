export interface Sleeper {
  sleep(ms: number): Promise<void>;
}
