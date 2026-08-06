// Client-side admin API client.
// All requests go through /api/proxy/* (same-origin Next.js route handler) which
// reads the HttpOnly admin_token cookie server-side and forwards the Bearer token.
// Never call this from a server component; use makeAdminApiClient() from auth.ts instead.

import { ApiError, type ReadRequestOptions } from './api-client'

const PROXY_BASE = '/api/proxy'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let details: unknown
    try { details = await res.json() } catch { /* ignore */ }
    const message =
      (details as { error?: { message?: string } })?.error?.message ??
      (details as { message?: string })?.message ??
      `HTTP ${res.status}`
    throw new ApiError(res.status, message, details)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  let url = `${PROXY_BASE}${path}`
  if (params) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) qs.set(key, String(value))
    })
    const q = qs.toString()
    if (q) url += `?${q}`
  }
  return url
}

export const adminApiClient = {
  /**
   * Admin reads share the public client's `ReadRequestOptions` shape so the two clients stay
   * interchangeable (several admin screens pass this client into `makeCatalogApi`). `revalidate` is
   * deliberately ignored here — admin data is always `no-store`; only `signal` is honoured.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: ReadRequestOptions,
  ): Promise<T> {
    const res = await fetch(buildUrl(path, params), {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
    })
    return handleResponse<T>(res)
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${PROXY_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(res)
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${PROXY_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(res)
  },

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${PROXY_BASE}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    return handleResponse<T>(res)
  },

  async uploadFile<T>(path: string, file: File): Promise<T> {
    const formData = new FormData()
    formData.append('file', file)
    // No Content-Type header; browser sets it with multipart boundary.
    const res = await fetch(`${PROXY_BASE}${path}`, {
      method: 'POST',
      body: formData,
    })
    return handleResponse<T>(res)
  },
}

export type AdminApiClient = typeof adminApiClient

// Helper for client components to handle 401 responses from admin API calls.
// Pass reason='session-expired' when redirecting after a token rejection.
export function redirectToLogin(reason?: string): void {
  if (typeof window !== 'undefined') {
    const url = new URL('/admin/login', window.location.origin)
    if (reason) url.searchParams.set('reason', reason)
    const currentPath = window.location.pathname
    if (currentPath.startsWith('/admin') && currentPath !== '/admin/login') {
      url.searchParams.set('returnUrl', currentPath)
    }
    window.location.href = url.toString()
  }
}
