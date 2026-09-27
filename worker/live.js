/**
 * wacl-live — serves the live-points file from Cloudflare's edge.
 *
 * GitHub's download servers cache the points branch for five minutes, which
 * is most of a red-zone drive. The live-points job also writes each update
 * into this Worker's KV store, and the site reads it here: KV at the edge
 * (cached 30 s) plus 15 s in the browser, so phones see a pass within about
 * a minute. Read-only and public, like the branch it mirrors.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
    const { pathname } = new URL(request.url)
    if (request.method !== 'GET' || pathname !== '/points.json') {
      return new Response('Not found', { status: 404, headers: CORS })
    }
    const body = await env.LIVE.get('points.json', { cacheTtl: 30 })
    if (!body) {
      return new Response('{}', { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    return new Response(body, {
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
    })
  },
}
