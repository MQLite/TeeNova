// BACKEND_URL is server-only (no NEXT_PUBLIC_ prefix; never sent to the browser).
// On the server it resolves to the direct backend address (e.g. http://localhost:5100).
// In the browser process.env.BACKEND_URL is always undefined, so client-side code
// falls back to NEXT_PUBLIC_API_BASE_URL (the public domain).
const DEFAULT_API_BASE =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://localhost:44300'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
    /** Parsed Retry-After delay in milliseconds when supplied by the server. */
    public readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let details: unknown
    try {
      details = await res.json()
    } catch {
      // ignore parse failure
    }
    const message =
      (details as { error?: { message?: string } })?.error?.message ??
      (details as { message?: string })?.message ??
      `HTTP ${res.status}`
    const retryAfter = res.headers.get('Retry-After')
    let retryAfterMs: number | undefined
    if (retryAfter) {
      const seconds = Number(retryAfter)
      if (Number.isFinite(seconds)) {
        retryAfterMs = Math.max(0, seconds * 1000)
      } else {
        const date = Date.parse(retryAfter)
        if (Number.isFinite(date)) retryAfterMs = Math.max(0, date - Date.now())
      }
    }
    throw new ApiError(res.status, message, details, retryAfterMs)
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

/**
 * Opt-in read-cache policy for a single GET (Jira 10304).
 *
 * The default for every request stays `cache: 'no-store'` — nothing becomes cacheable by accident,
 * and authoritative reads (pricing, checkout quotes, stock, cart validation, admin data) are never
 * affected. Only anonymous public catalogue reads pass this option; see `lib/catalog-cache.ts` for
 * the durations and the reasoning behind them.
 *
 * The revalidation window is honoured **server-side only**: `next.revalidate` addresses the Next.js
 * Data Cache, which exists in the Node process, not in the browser. Browser-side calls keep
 * `no-store` so a customer's own device never replays a stale catalogue response.
 */
export interface ReadRequestOptions {
  /** Seconds the Next.js server Data Cache may reuse this response before refetching. */
  revalidate?: number
  /** Cancels an in-flight read. */
  signal?: AbortSignal
}

/** Resolves the fetch cache init for a GET, defaulting to `no-store`. */
function readCacheInit(options?: ReadRequestOptions): RequestInit {
  const isServer = typeof window === 'undefined'
  if (options?.revalidate === undefined || !isServer) return { cache: 'no-store' }
  return { next: { revalidate: options.revalidate } } as RequestInit
}

// Factory that creates an API client with optional default headers.
// Used by auth.ts to create authenticated server-side clients.
export function makeApiClient(
  baseUrl: string = DEFAULT_API_BASE,
  defaultHeaders: Record<string, string> = {},
) {
  return {
    async get<T>(
      path: string,
      params?: Record<string, string | number | boolean | undefined>,
      options?: ReadRequestOptions,
    ): Promise<T> {
      const url = new URL(`${baseUrl}${path}`)
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) url.searchParams.set(key, String(value))
        })
      }
      const res = await fetch(url.toString(), {
        ...readCacheInit(options),
        headers: { 'Content-Type': 'application/json', ...defaultHeaders },
        signal: options?.signal,
      })
      return handleResponse<T>(res)
    },

    async post<T>(path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...defaultHeaders },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: options?.signal,
      })
      return handleResponse<T>(res)
    },

    async put<T>(path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...defaultHeaders },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      return handleResponse<T>(res)
    },

    async delete<T>(path: string): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...defaultHeaders },
      })
      return handleResponse<T>(res)
    },

    async uploadFile<T>(path: string, file: File): Promise<T> {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type; browser sets it with boundary.
        headers: { ...defaultHeaders },
      })
      return handleResponse<T>(res)
    },
  }
}

export type ApiClient = ReturnType<typeof makeApiClient>

export const apiClient = makeApiClient(DEFAULT_API_BASE)
