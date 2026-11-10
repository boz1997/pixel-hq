// The mirror's one endpoint, on Vercel: the local app POSTs the office's state here, the page GETs it.
// Both need the password (PIXEL_HQ_PASSWORD); the state lives in the project's Redis (Upstash) store.

const KEY = 'pixel-hq:state'
const MAX_BYTES = 2_000_000

function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return async command => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command),
    })
    if (!res.ok) throw new Error(`redis answered ${res.status}`)
    return (await res.json()).result
  }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  const password = process.env.PIXEL_HQ_PASSWORD
  if (!password) return res.status(500).json({ error: 'PIXEL_HQ_PASSWORD is not set on this deployment' })
  if (req.headers['x-pixel-hq-password'] !== password) return res.status(401).json({ error: 'wrong password' })
  const store = redis()
  if (!store) return res.status(500).json({ error: 'no Redis store: connect an Upstash (KV) store to this project' })

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
    if (body.length > MAX_BYTES) return res.status(413).json({ error: 'too large' })
    await store(['SET', KEY, body])
    return res.status(200).json({ ok: true, bytes: body.length })
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' })
  const value = await store(['GET', KEY])
  res.setHeader('content-type', 'application/json; charset=utf-8')
  return res.status(200).send(value ?? JSON.stringify({ at: 0, roster: null, lives: {}, sources: 0 }))
}
