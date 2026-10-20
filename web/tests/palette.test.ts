import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { contrastRatio } from '../src/styles/contrast';

const read = (name: string) =>
  readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8');
const tokensCss = read('tokens.css');
const globalCss = read('global.css');

const MIN_RATIO = 4.5;
const declarations = (block: string): Map<string, string> =>
  new Map(
    [...block.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1] ?? '',
      (m[2] ?? '').trim(),
    ]),
  );

const rootBlock = /:root\s*{([^}]*)}/.exec(tokensCss)?.[1] ?? '';
const darkBlock =
  /@media \(prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/.exec(tokensCss)?.[1] ?? '';
const light = declarations(rootBlock);
const dark = declarations(darkBlock);

const TEXT_PAIRS = [
  ['--color-text', '--color-bg'],
  ['--color-text', '--color-surface'],
  ['--color-text-muted', '--color-bg'],
  ['--color-text-muted', '--color-surface'],
  ['--color-link', '--color-bg'],
  ['--color-link', '--color-surface'],
  ['--color-error-text', '--color-error-bg'],
  ['--color-warning-text', '--color-warning-bg'],
  ['--color-notice-text', '--color-notice-bg'],
  ['--color-error-text', '--color-bg'],
  ['--color-success-text', '--color-bg'],
  ['--color-input-text', '--color-input-bg'],
  ['--color-button-text', '--color-button-bg'],
] as const;

const ratioIn = (
  palette: Map<string, string>,
  [foreground, background]: readonly [string, string],
) => contrastRatio(palette.get(foreground) ?? '', palette.get(background) ?? '');

it.each(TEXT_PAIRS)(
  'light mode: %s on %s has a contrast of at least 4.5',
  (foreground, background) => {
    expect(ratioIn(light, [foreground, background])).toBeGreaterThanOrEqual(MIN_RATIO);
  },
);

it.each(TEXT_PAIRS)(
  'dark mode: %s on %s has a contrast of at least 4.5',
  (foreground, background) => {
    expect(ratioIn(dark, [foreground, background])).toBeGreaterThanOrEqual(MIN_RATIO);
  },
);

const MIN_GRAPHIC_RATIO = 3;

it.each([
  ['light', light],
  ['dark', dark],
])('%s mode: the progress bar stands out from its track by at least 3', (_, palette) => {
  expect(
    ratioIn(palette, ['--color-progress-fill', '--color-progress-track']),
  ).toBeGreaterThanOrEqual(MIN_GRAPHIC_RATIO);
});

it('redefines every light color token in dark mode', () => {
  expect(light.size).toBeGreaterThan(0);
  expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());
});

it('defines colors only through tokens: no hex or rgb literal outside :root and the dark block', () => {
  const withoutTokens = tokensCss.replace(rootBlock, '').replace(darkBlock, '');
  expect(withoutTokens).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  expect(globalCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

it('assigns colors in global.css only through tokens or neutral keywords', () => {
  const colorDeclaration =
    /(?:^|[\s;{])(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?)\s*:\s*([^;}]+)/g;
  const allowedWords = new Set([
    'inherit',
    'currentColor',
    'transparent',
    'none',
    'solid',
    'dashed',
  ]);
  const offendingWords = [...globalCss.matchAll(colorDeclaration)].flatMap(([, value]) =>
    (value ?? '')
      .replace(/var\([^)]*\)/g, '')
      .split(/\s+/)
      .filter((word) => /^[a-z]+$/i.test(word) && !allowedWords.has(word)),
  );

  expect(offendingWords).toEqual([]);
});
