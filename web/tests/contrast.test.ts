import { expect, it } from 'vitest';
import { contrastRatio } from '../src/styles/contrast';

it('gives 21 for black on white', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
});

it('gives 1 for identical colors', () => {
  expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
});

it('gives the known WCAG ratio for #767676 on white (4.54)', () => {
  expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
});

it('is symmetric', () => {
  expect(contrastRatio('#ffffff', '#767676')).toBeCloseTo(contrastRatio('#767676', '#ffffff'), 10);
});
