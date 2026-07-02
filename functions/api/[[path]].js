const BODYLESS_METHODS = new Set(['GET', 'HEAD']);
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
];

function json(data, status = 500) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function readBackendUrl(env) {
  const rawUrl = env.SMANGA_BACKEND_URL || env.SMANGA_API_URL;
  if (!rawUrl) return null;

  const backendUrl = new URL(rawUrl);
  if (!['http:', 'https:'].includes(backendUrl.protocol)) {
    throw new Error('SMANGA_BACKEND_URL must start with http:// or https://');
  }

  return backendUrl;
}

function joinPath(basePath, requestPath) {
  const base = basePath.replace(/\/+$/, '');
  const request = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  return `${base}${request}`.replace(/\/{2,}/g, '/') || '/';
}

function createTargetUrl(request, env) {
  const backendUrl = readBackendUrl(env);
  if (!backendUrl) return null;

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(backendUrl.toString());
  const basePath = targetUrl.pathname.replace(/\/+$/, '');
  let requestPath = incomingUrl.pathname;

  if (basePath.endsWith('/api') && (requestPath === '/api' || requestPath.startsWith('/api/'))) {
    requestPath = requestPath.slice('/api'.length) || '/';
  }

  targetUrl.pathname = joinPath(basePath, requestPath);
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

export async function onRequest(context) {
  try {
    const targetUrl = createTargetUrl(context.request, context.env);
    if (!targetUrl) {
      return json({
        code: 500,
        message: 'Missing SMANGA_BACKEND_URL',
        data: null,
      });
    }

    return fetch(targetUrl.toString(), {
      method: context.request.method,
      headers: createProxyHeaders(context.request),
      body: BODYLESS_METHODS.has(context.request.method) ? undefined : context.request.body,
      redirect: 'manual',
    });
  } catch (error) {
    return json({
      code: 500,
      message: error instanceof Error ? error.message : 'Cloudflare proxy error',
      data: null,
    });
  }
}
