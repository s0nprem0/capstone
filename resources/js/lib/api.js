let csrfToken = null

// The map payload is ~1.1 MB of JSON and five pages load it on mount. Cache the
// in-flight promise per path so switching between those pages fetches it once
// per session. Any successful mutation drops the cache, so approving a
// reservation is reflected the next time the map is opened.
const getCache = new Map()
const CACHEABLE = new Set(['/api/map'])

export async function getCsrf() {
  if (!csrfToken) {
    const res = await fetch('/api/csrf-token', { credentials: 'same-origin' })
    if (res.ok) {
      const data = await res.json()
      csrfToken = data.csrf_token
    }
  }
  return csrfToken
}

async function request(path, options = {}) {
  const { method = 'GET', body } = options
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData

  if (method !== 'GET') {
    const token = await getCsrf()
    if (token) {
      options.headers = { ...(options.headers || {}), 'X-CSRF-Token': token }
    }
  }

  return fetch(path, {
    method,
    headers: options.headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    credentials: 'same-origin',
  })
}

async function perform(path, options) {
  // The token lives in the PHP session, which is rebuilt on login/logout or
  // after a server restart. When the cached token no longer matches (419),
  // drop it and retry once with a freshly issued one. The router rejects the
  // request before any controller runs, so the retry is side-effect free.
  let res = await request(path, options)
  if (res.status === 419) {
    csrfToken = null
    res = await request(path, options)
  }

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
  }

  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

export async function api(path, options = {}) {
  const method = options.method || 'GET'
  const cacheable = method === 'GET' && CACHEABLE.has(path)

  if (cacheable && getCache.has(path)) {
    return getCache.get(path)
  }

  const pending = perform(path, options)

  if (cacheable) {
    getCache.set(path, pending)
    pending.then((r) => {
      if (!r.ok) getCache.delete(path)
    })
  }

  const result = await pending
  if (method !== 'GET' && result.ok) {
    getCache.clear()
  }
  return result
}
