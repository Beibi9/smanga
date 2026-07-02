const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'host',
];

function readWebSocketUrl(request, env) {
  const rawUrl = env.SMANGA_WS_URL || env.SMANGA_BACKEND_URL || env.SMANGA_API_URL;
  if (!rawUrl) return null;

  const targetUrl = new URL(rawUrl);
  const incomingUrl = new URL(request.url);

  if (targetUrl.protocol === 'https:') targetUrl.protocol = 'wss:';
  if (targetUrl.protocol === 'http:') targetUrl.protocol = 'ws:';

  if (!env.SMANGA_WS_URL) {
    targetUrl.pathname = `${targetUrl.pathname.replace(/\/api\/?$/, '').replace(/\/+$/, '')}/websocket`;
  }

  targetUrl.search = incomingUrl.search;

  return targetUrl;
}

function createProxyHeaders(request) {
  const incomingUrl = new URL(request.url);
  const headers = new Headers(request.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  return headers;
}

export async function onRequest({request, env}) {
  const targetUrl = readWebSocketUrl(request, env);
  if (!targetUrl) {
    return new Response('Missing SMANGA_WS_URL or SMANGA_BACKEND_URL', {status: 500});
  }

  return fetch(targetUrl.toString(), {
    method: request.method,
    headers: createProxyHeaders(request),
    body: request.body,
    redirect: 'manual',
  });
}
