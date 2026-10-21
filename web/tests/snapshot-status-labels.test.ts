import { expect, it } from 'vitest';
import { SNAPSHOT_STATUS_LABELS } from '../src/lib/labels';

it('labels a queued snapshot as "en file"', () => {
  expect(SNAPSHOT_STATUS_LABELS['queued']).toBe('en file');
});
