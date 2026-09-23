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

export async function api(path, options = {}) {
  const { method = 'GET', body } = options
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData

  if (method !== 'GET') {
    const token = await getCsrf()
    if (token) {
      options.headers = { ...(options.headers || {}), 'X-CSRF-Token': token }
    }
  }

  const res = await fetch(path, {
    method,
    headers: options.headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    credentials: 'same-origin',
  })

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'))
  }

  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}
