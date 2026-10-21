import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) =>
  readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8');
const motionCss = read('motion.css');
const fontsCss = read('fonts.css');
const globalCss = read('global.css');

// The two reviewed exceptions repaint one small element without moving the layout.
const ANIMATABLE = new Set(['transform', 'opacity', 'stroke-dashoffset', '--n']);

const keyframeProperties = (css: string): string[] =>
  [...css.matchAll(/@keyframes\s+[\w-]+\s*{((?:[^{}]*{[^{}]*})*)[^{}]*}/g)].flatMap(([, body]) =>
    [...(body ?? '').matchAll(/([\w-]+)\s*:/g)].map(([, property]) => property ?? ''),
  );

describe('motion grammar', () => {
  it('animates only transform and opacity, plus the arc and the score counter', () => {
    const properties = keyframeProperties(motionCss);

    expect(properties.length).toBeGreaterThan(0);
    expect(properties.filter((property) => !ANIMATABLE.has(property))).toEqual([]);
  });

  it('is loaded by the global stylesheet, with the fonts and on top of the tokens', () => {
    expect(globalCss).toMatch(
      /@import '.\/tokens.css';\s*@import '.\/fonts.css';\s*@import '.\/motion.css';/,
    );
  });

  it('declares no keyframes outside motion.css', () => {
    expect(globalCss).not.toMatch(/@keyframes/);
  });

  it('honours prefers-reduced-motion with a crafted fallback, not a blanket cut', () => {
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*)}\s*$/.exec(motionCss)?.[1] ?? '';

    expect(reduced).toContain('animation-name: fade');
    expect(reduced).toMatch(/--dur-long:\s*0ms/);
    expect(reduced).not.toMatch(/animation:\s*none/);
  });

  it('morphs page changes with CSS view transitions, without a client router', () => {
    expect(motionCss).toMatch(/@view-transition\s*{\s*navigation:\s*auto;/);
  });
});

describe('audit progress', () => {
  it('names the progress bar so it glides between two refreshes instead of jumping', () => {
    expect(globalCss).toMatch(/\.progress-bar\s*{[^}]*view-transition-name:\s*audit-progress/);
  });
});

describe('fonts', () => {
  it('loads only self-hosted woff2 files with font-display: swap', () => {
    const urls = [...fontsCss.matchAll(/url\('([^']+)'\)/g)].map(([, url]) => url);

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url?.startsWith('/fonts/') && url.endsWith('.woff2'))).toBe(true);
    expect(fontsCss).not.toMatch(/https?:/);
    expect(fontsCss.match(/font-display: swap/g)?.length).toBe(2);
  });

  it('ships every font file with its licence', () => {
    const files = readdirSync(new URL('../public/fonts', import.meta.url));

    expect(files.filter((file) => file.endsWith('.woff2')).length).toBe(2);
    expect(files.filter((file) => file.startsWith('OFL-')).length).toBe(2);
  });
});
