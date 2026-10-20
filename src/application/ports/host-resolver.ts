export interface HostResolver {
  /** Resolves a host name to its IP addresses; rejects with `HostNotResolved` when it has none. */
  resolve(host: string): Promise<string[]>;
}
