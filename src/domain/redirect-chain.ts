export const MAX_REDIRECT_HOPS = 10;

export const computeRedirectChain = (
  startUrl: string,
  redirectTargets: ReadonlyMap<string, string>,
): string[] => {
  const chain: string[] = [];
  const visited = new Set([startUrl]);
  let next = redirectTargets.get(startUrl);
  while (next !== undefined && !visited.has(next) && chain.length < MAX_REDIRECT_HOPS) {
    chain.push(next);
    visited.add(next);
    next = redirectTargets.get(next);
  }
  return chain;
};
