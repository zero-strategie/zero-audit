import { computeHealth, roundScore } from '../domain/scoring.js';
import type { Snapshot } from '../domain/snapshot.js';
import type { SnapshotRepository } from './ports/snapshot-repository.js';

/** Rounded health of a finished snapshot; null for any other status or when not computable. */
export const healthOf = async (
  repository: SnapshotRepository,
  snapshot: Snapshot,
): Promise<number | null> => {
  if (snapshot.status !== 'finished') return null;
  const details = await repository.getById(snapshot.id);
  return details ? roundScore(computeHealth(details.checkResults)) : null;
};
