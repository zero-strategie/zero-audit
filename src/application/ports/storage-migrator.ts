/** Brings the storage schema up to date; applying it twice changes nothing. */
export interface StorageMigrator {
  migrate(): Promise<void>;
}
