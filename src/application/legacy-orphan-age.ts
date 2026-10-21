/**
 * A `running` audit that never sent a heartbeat (`--direct`, rows older than the queue) older than
 * this is the orphan of a killed process; the 2-minute heartbeat threshold would kill a live one.
 */
export const LEGACY_ORPHAN_AGE_MS = 6 * 60 * 60 * 1000;
