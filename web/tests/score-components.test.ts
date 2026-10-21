import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, it } from 'vitest';
import HealthGauge from '../src/components/HealthGauge.astro';
import SeverityBadge from '../src/components/SeverityBadge.astro';
import ThemeCard from '../src/components/ThemeCard.astro';

const render = async (
  component: Parameters<AstroContainer['renderToString']>[0],
  props: Record<string, unknown>,
) => (await AstroContainer.create()).renderToString(component, { props });

it('HealthGauge shows "77 (0)" and an arc of 77 percent', async () => {
  const html = await render(HealthGauge, { score: 77, variation: 0 });

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*77 \(0\)\s*</);
  expect(html).toContain('stroke-dasharray="77 100"');
});

it('HealthGauge shows "77 (−2)" with U+2212 and a negative variation class', async () => {
  const html = await render(HealthGauge, { score: 77, variation: -2 });

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*77 \(−2\)\s*</);
  expect(html).toContain('variation-negative');
});

it('HealthGauge shows the bare score when the variation is null', async () => {
  const html = await render(HealthGauge, { score: 77, variation: null });

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*77\s*</);
});

it('HealthGauge shows the not-computed state when the score is null', async () => {
  const html = await render(HealthGauge, { score: null, variation: null });

  expect(html).toMatch(/data-testid="health-score"[^>]*>\s*Non calculable\s*</);
  expect(html).toContain('stroke-dasharray="0 100"');
});

it('HealthGauge exposes its score as an accessible image', async () => {
  const html = await render(HealthGauge, { score: 77, variation: 3 });

  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Santé du site : 77 (+3)"');
});

it('HealthGauge is a single accessible image: the drawing and the counter are hidden from AT', async () => {
  const html = await render(HealthGauge, { score: 77, variation: 3 });

  expect(html).toMatch(
    /<div[^>]*class="health-gauge"[^>]*role="img"[^>]*aria-label="Santé du site : 77 \(\+3\)"/,
  );
  expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  expect(html).toMatch(/class="gauge-readout"[^>]*aria-hidden="true"/);
});

it('HealthGauge sets the score as a custom property for the needle, the arc and the counter', async () => {
  const html = await render(HealthGauge, { score: 77, variation: 0 });

  expect(html).toMatch(/class="health-gauge"[^>]*style="--score: ?77"/);
  expect(html).toMatch(/class="gauge-value"[^>]*style="--n: ?77"/);
  expect(html).toMatch(/class="gauge-needle"/);
});

it('HealthGauge without a score parks the needle and shows a dash instead of a count', async () => {
  const html = await render(HealthGauge, { score: null, variation: null });

  expect(html).toMatch(/class="health-gauge"[^>]*data-state="na"/);
  expect(html).toMatch(/class="gauge-value gauge-value-na"[^>]*>\s*—\s*</);
});

it('ThemeCard draws a meter scaled to the score and staggers by its index', async () => {
  const html = await render(ThemeCard, { theme: 'linking', score: 90, variation: 3, index: 2 });

  expect(html).toMatch(
    /class="theme-card"[^>]*style="--i: 2; view-transition-name: theme-linking"/,
  );
  expect(html).toMatch(/class="theme-meter"[^>]*aria-hidden="true"[^>]*>\s*<i style="--v: 0.9"/);
});

it('ThemeCard without a score shows a hatched, empty meter', async () => {
  const html = await render(ThemeCard, { theme: 'https', score: null, variation: null });

  expect(html).toContain('Non calculable');
  expect(html).toMatch(/class="theme-meter theme-meter-na"/);
});

it('ThemeCard shows the theme name and its score with variation', async () => {
  const html = await render(ThemeCard, { theme: 'linking', score: 90, variation: 3 });

  expect(html).toContain('data-testid="theme-linking"');
  expect(html).toContain('Maillage');
  expect(html).toContain('90 (+3)');
});

it.each([
  ['error', 'Erreur', 'severity-error'],
  ['warning', 'Avertissement', 'severity-warning'],
  ['notice', 'Notice', 'severity-notice'],
])('SeverityBadge renders %s with its own class and label', async (severity, label, cssClass) => {
  const html = await render(SeverityBadge, { severity });

  expect(html).toContain(cssClass);
  expect(html).toMatch(new RegExp(`>\\s*${label}\\s*<`));
});

it('SeverityBadge falls back to a neutral style for an unknown severity', async () => {
  const html = await render(SeverityBadge, { severity: 'autre' });

  expect(html).toContain('severity-unknown');
  expect(html).toMatch(/>\s*autre\s*</);
});

it('SeverityBadge treats an inherited object key as an unknown severity', async () => {
  const html = await render(SeverityBadge, { severity: 'toString' });

  expect(html).toContain('severity-unknown');
  expect(html).not.toContain('severity-toString');
});
