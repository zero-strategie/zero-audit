import type { APIRoute } from 'astro';

export const prerender = false;

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;

export const GET: APIRoute = async ({ locals }) => {
  const healthy = await locals.apiClient.checkHealth();
  const status = healthy ? 'ok' : 'unavailable';
  return new Response(JSON.stringify({ status }), {
    status: healthy ? HTTP_OK : HTTP_SERVICE_UNAVAILABLE,
    headers: { 'content-type': 'application/json' },
  });
};
