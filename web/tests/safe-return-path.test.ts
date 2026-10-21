import { expect, it } from 'vitest';
import { safeReturnPath } from '../src/lib/safe-return-path';

it.each([
  ['/compte', '/compte'],
  ['/audits/new?x=1', '/audits/new?x=1'],
  ['//evil.example', '/'],
  ['https://evil.example', '/'],
  ['/\\evil.example', '/'],
  ['/\t/evil.example', '/'],
  ['/\n/evil.example', '/'],
  ['/\\/evil.example', '/'],
  [' //evil.example', '/'],
  ['evil', '/'],
  ['', '/'],
  [null, '/'],
])('turns %s into %s', (input, expected) => {
  expect(safeReturnPath(input)).toBe(expected);
});
