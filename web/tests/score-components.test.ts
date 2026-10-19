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
