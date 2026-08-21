const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const OIDC_AUDIENCE = 'maroowell-apk-upload';
const ALLOWED_REPOSITORY = 'nuclearwarp/maroowell-android';
const ALLOWED_REF = 'refs/heads/main';
const MAX_APK_BYTES = 25 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

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

  const configResponse = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`);
  if (!configResponse.ok) throw new Error('OIDC configuration unavailable');
  const config = await configResponse.json();

  const jwksResponse = await fetch(config.jwks_uri);
  if (!jwksResponse.ok) throw new Error('OIDC keys unavailable');
  const jwks = await jwksResponse.json();
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

export class ApkStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method === 'PUT') {
      const body = await request.arrayBuffer();
      if (body.byteLength < 100000 || body.byteLength > MAX_APK_BYTES) {
        return new Response('Invalid APK size', { status: 413 });
      }

      const bytes = new Uint8Array(body);
      const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
      await this.state.storage.deleteAll();

      for (let batchStart = 0; batchStart < chunks; batchStart += 64) {
        const values = {};
        const batchEnd = Math.min(chunks, batchStart + 64);
        for (let i = batchStart; i < batchEnd; i += 1) {
          const start = i * CHUNK_BYTES;
          const end = Math.min(bytes.byteLength, start + CHUNK_BYTES);
          values[`chunk:${String(i).padStart(6, '0')}`] = bytes.slice(start, end).buffer;
        }
        await this.state.storage.put(values);
      }

      await this.state.storage.put('meta', {
        size: bytes.byteLength,
        chunks,
        uploadedAt: new Date().toISOString(),
      });

      return Response.json({ ok: true, bytes: bytes.byteLength, chunks });
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      const meta = await this.state.storage.get('meta');
      if (!meta) return new Response('Not Found', { status: 404 });

      const headers = new Headers({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(meta.size),
      });
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

      const output = new Uint8Array(meta.size);
      let offset = 0;
      for (let batchStart = 0; batchStart < meta.chunks; batchStart += 64) {
        const keys = [];
        const batchEnd = Math.min(meta.chunks, batchStart + 64);
        for (let i = batchStart; i < batchEnd; i += 1) {
          keys.push(`chunk:${String(i).padStart(6, '0')}`);
        }
        const values = await this.state.storage.get(keys);
        for (const key of keys) {
          const chunk = values.get(key);
          if (!chunk) return new Response('Stored APK is incomplete', { status: 500 });
          const data = new Uint8Array(chunk);
          output.set(data, offset);
          offset += data.byteLength;
        }
      }

      return new Response(output, { status: 200, headers });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'maroowell-app-download', storage: 'durable-object' });
    }

    if (url.pathname.startsWith('/downloads/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const filename = decodeURIComponent(url.pathname.slice('/downloads/'.length));
      if (!filename || filename.includes('/') || !filename.toLowerCase().endsWith('.apk')) {
        return new Response('Not Found', { status: 404 });
      }

      const id = env.APK_STORE.idFromName(filename);
      const stored = await env.APK_STORE.get(id).fetch(new Request('https://store/file', { method: request.method }));
      if (!stored.ok) return stored;

      const size = Number(stored.headers.get('Content-Length'));
      return new Response(request.method === 'HEAD' ? null : stored.body, {
        status: 200,
        headers: apkHeaders(filename, size),
      });
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

      const id = env.APK_STORE.idFromName(filename);
      const stored = await env.APK_STORE.get(id).fetch(new Request('https://store/file', {
        method: 'PUT',
        body: request.body,
        headers: { 'Content-Type': 'application/octet-stream' },
      }));
      if (!stored.ok) return stored;
      const result = await stored.json();
      return Response.json({ ok: true, filename, ...result });
    }

    return new Response('Not Found', { status: 404 });
  },
};
