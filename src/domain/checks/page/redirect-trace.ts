import { MAX_REDIRECT_HOPS } from '../../redirect-chain.js';

export interface RedirectTrace {
  readonly chain: readonly string[];
  readonly loop: boolean;
  readonly truncated: boolean;
}

/** Unlike `computeRedirectChain`, says whether the trace ended on a loop or on the hop cap. */
export const traceRedirects = (
  startUrl: string,
  redirectTargets: ReadonlyMap<string, string>,
): RedirectTrace => {
  const chain: string[] = [];
  const visited = new Set([startUrl]);
  let next = redirectTargets.get(startUrl);
  while (next !== undefined) {
    if (chain.length === MAX_REDIRECT_HOPS) return { chain, loop: false, truncated: true };
    chain.push(next);
    if (visited.has(next)) return { chain, loop: true, truncated: false };
    visited.add(next);
    next = redirectTargets.get(next);
  }
  return { chain, loop: false, truncated: false };
};
