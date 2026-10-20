export interface AllowedDomain {
  hostname?: string;
  protocol: 'https';
}

export const allowedDomainsFrom = (publicHosts: string | undefined): AllowedDomain[] => {
  const hostnames = (publicHosts ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host !== '');
  if (hostnames.length === 0) return [{ protocol: 'https' }];
  return hostnames.map((hostname) => ({ hostname, protocol: 'https' }));
};
