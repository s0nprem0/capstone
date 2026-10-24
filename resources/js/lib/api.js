let csrfToken = null

// The map payload is ~1.1 MB of JSON and five pages load it on mount. Cache the
// in-flight promise per path so switching between those pages fetches it once
// per session. Any successful mutation drops the cache, so approving a
// reservation is reflected the next time the map is opened.
const getCache = new Map()
const CACHEABLE = new Set(['/api/map'])

// A request that never settles leaves the page on its spinner forever. Thirty
// seconds is generous for the map on a slow connection, and short enough that
// a dead connection surfaces as an error the user can act on.
const TIMEOUT_MS = 30000
const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'
const TIMEOUT_ERROR = 'The server took too long to respond. Try again.'
const CANCELLED_ERROR = 'Request cancelled.'

function requestError(message, name) {
  const error = new Error(message)
  error.name = name
  return error
}

async function fetchWithTimeout(input, init = {}, timeout = TIMEOUT_MS) {
  const controller = new AbortController()
  const external = init.signal
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)

  const forwardAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', forwardAbort, { once: true })
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw requestError(TIMEOUT_ERROR, 'TimeoutError')
    if (external?.aborted) throw requestError(CANCELLED_ERROR, 'AbortError')
    throw requestError(NETWORK_ERROR, 'NetworkError')
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', forwardAbort)
  }
}

export async function getCsrf() {
  if (!csrfToken) {
    const res = await fetchWithTimeout('/api/csrf-token', { credentials: 'same-origin' })
    if (res.ok) {
      const data = await res.json()
      csrfToken = data.csrf_token
    }
  }
  return csrfToken
}

async function request(path, options = {}) {
  const { method = 'GET', body, signal, timeout = TIMEOUT_MS } = options
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData

  if (method !== 'GET') {
    const token = await getCsrf()
    if (token) {
      options.headers = { ...(options.headers || {}), 'X-CSRF-Token': token }
    }
  }

  return fetchWithTimeout(
    path,
    {
      method,
      headers: options.headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      credentials: 'same-origin',
      signal,
    },
    timeout
  )
}

async function perform(path, options) {
  try {
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
  } catch (error) {
    return {
      ok: false,
      status: 0,
      cancelled: error.name === 'AbortError',
      data: { error: error.message || NETWORK_ERROR },
    }
  }
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

// For a failed write that still proves the cache stale, such as a 422 because
// the plot was claimed by someone else after the map was loaded.
export function forget(path) {
  getCache.delete(path)
}
