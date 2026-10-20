export interface StorageHealth {
  /** Resolves when the storage answers; rejects otherwise. */
  ping(): Promise<void>;
}
