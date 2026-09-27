let csrfToken = null

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

export async function api(path, options = {}) {
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