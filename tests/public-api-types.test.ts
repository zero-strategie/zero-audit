import { expectTypeOf, it } from 'vitest';
import type {
  AuditQueue,
  HostResolver,
  Project,
  ProjectRepository,
  Reader,
  SnapshotRepository,
  Storage,
  StorageConnection,
} from '../src/index.js';

it('exposes the port and domain types of the public API', () => {
  expectTypeOf<Storage['connection']>().toEqualTypeOf<StorageConnection>();
  expectTypeOf<Storage['queue']>().toEqualTypeOf<AuditQueue>();
  expectTypeOf<Storage['snapshots']>().toEqualTypeOf<SnapshotRepository>();
  expectTypeOf<Storage['projects']>().toEqualTypeOf<ProjectRepository>();
  expectTypeOf<HostResolver>().toBeObject();
  expectTypeOf<Reader>().toBeObject();
  expectTypeOf<Project['ownerId']>().toEqualTypeOf<string | null>();
});
