const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const OIDC_AUDIENCE = 'maroowell-apk-upload';
const ALLOWED_REPOSITORY = 'nuclearwarp/maroowell-android';
const ALLOWED_REF = 'refs/heads/main';

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

async function verifyGithubOidc(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);

  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported JWT header');
  if (payload.iss !== OIDC_ISSUER) throw new Error('Invalid issuer');
  if (payload.aud !== OIDC_AUDIENCE) throw new Error('Invalid audience');
  if (payload.repository !== ALLOWED_REPOSITORY) throw new Error('Invalid repository');
  if (payload.ref !== ALLOWED_REF) throw new Error('Invalid ref');

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 30) throw new Error('Expired token');
  if (payload.nbf && payload.nbf > now + 30) throw new Error('Token not active');

  const config = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`).then(r => {
    if (!r.ok) throw new Error('OIDC configuration unavailable');
    return r.json();
  });
  const jwks = await fetch(config.jwks_uri).then(r => {
    if (!r.ok) throw new Error('OIDC keys unavailable');
    return r.json();
  });
  const jwk = (jwks.keys || []).find(key => key.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlToBytes(encodedSignature);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
  if (!valid) throw new Error('Invalid signature');

  return payload;
}

function apkHeaders(filename, size) {
  const headers = new Headers({
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'Cache-Control': filename === 'maroowell-latest.apk' ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (Number.isFinite(size)) headers.set('Content-Length', String(size));
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'maroowell-app-download' });
    }

    if (url.pathname.startsWith('/downloads/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const filename = decodeURIComponent(url.pathname.slice('/downloads/'.length));
      if (!filename || filename.includes('/') || !filename.toLowerCase().endsWith('.apk')) {
        return new Response('Not Found', { status: 404 });
      }
      const value = await env.APK_STORE.get(filename, { type: 'arrayBuffer' });
      if (!value) return new Response('Not Found', { status: 404 });
      const headers = apkHeaders(filename, value.byteLength);
      return new Response(request.method === 'HEAD' ? null : value, { status: 200, headers });
    }

    if (url.pathname.startsWith('/upload/')) {
      if (request.method !== 'PUT') return new Response('Method Not Allowed', { status: 405 });
      const filename = decodeURIComponent(url.pathname.slice('/upload/'.length));
      if (!filename || filename.includes('/') || !filename.toLowerCase().endsWith('.apk')) {
        return new Response('Bad filename', { status: 400 });
      }

      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });
      try {
        await verifyGithubOidc(auth.slice(7));
      } catch (error) {
        return new Response(`Unauthorized: ${error.message}`, { status: 401 });
      }

      const body = await request.arrayBuffer();
      if (body.byteLength < 100000 || body.byteLength > 25 * 1024 * 1024) {
        return new Response('Invalid APK size', { status: 413 });
      }
      await env.APK_STORE.put(filename, body, {
        metadata: {
          uploadedAt: new Date().toISOString(),
          repository: ALLOWED_REPOSITORY,
        },
      });
      return Response.json({ ok: true, filename, bytes: body.byteLength });
    }

    return new Response('Not Found', { status: 404 });
  },
};
