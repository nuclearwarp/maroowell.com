const PAGES_ORIGIN = 'https://nuclearwarp.github.io/maroowell-android';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'maroowell-app-download', origin: PAGES_ORIGIN });
    }

    if (!url.pathname.startsWith('/downloads/')) {
      return new Response('Not Found', { status: 404 });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const filename = decodeURIComponent(url.pathname.slice('/downloads/'.length));
    if (!filename || filename.includes('/') || !filename.toLowerCase().endsWith('.apk')) {
      return new Response('Not Found', { status: 404 });
    }

    const upstreamUrl = `${PAGES_ORIGIN}/downloads/${encodeURIComponent(filename)}`;
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      redirect: 'follow',
      cf: { cacheEverything: true, cacheTtl: filename === 'maroowell-latest.apk' ? 300 : 31536000 },
    });

    if (!upstream.ok) {
      return new Response(`APK unavailable (${upstream.status})`, { status: upstream.status });
    }

    const headers = new Headers(upstream.headers);
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    headers.set('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', filename === 'maroowell-latest.apk' ? 'public, max-age=300' : 'public, max-age=31536000, immutable');

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: 200,
      headers,
    });
  },
};
