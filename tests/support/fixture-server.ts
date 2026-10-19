import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FixtureRoute {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  delayMs?: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
}

export interface FixtureServer {
  baseUrl: string;
  requests: readonly RecordedRequest[];
  close(): Promise<void>;
}

const LOOPBACK_HOST = '127.0.0.1';
const NOT_FOUND = 404;

export async function startFixtureServer(
  routes: Readonly<Record<string, FixtureRoute>>,
): Promise<FixtureServer> {
  const requests: RecordedRequest[] = [];

  const server = createServer((req, res) => {
    const target = req.url ?? '/';
    requests.push({ method: req.method ?? 'GET', path: target, headers: req.headers });

    const pathname = new URL(target, `http://${LOOPBACK_HOST}`).pathname;
    const route = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined;
    const respond = () => {
      res.writeHead(route?.status ?? NOT_FOUND, route?.headers);
      res.end(route?.body);
    };
    setTimeout(respond, route?.delayMs ?? 0);
  });

  await new Promise<void>((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://${LOOPBACK_HOST}:${String(port)}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
  };
}
