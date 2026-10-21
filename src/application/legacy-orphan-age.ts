/**
 * Until audits are recovered through the worker heartbeat, a `running` audit older than this is
 * the orphan of a killed process. To be replaced by `HEARTBEAT_STALE_MS` once heartbeats exist.
 */
export const LEGACY_ORPHAN_AGE_MS = 6 * 60 * 60 * 1000;
