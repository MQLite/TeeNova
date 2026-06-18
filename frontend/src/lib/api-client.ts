// BACKEND_URL is server-only (no NEXT_PUBLIC_ prefix — never sent to the browser).
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
      `HTTP ${res.status}`
    throw new ApiError(res.status, message, details)
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

// Factory that creates an API client with optional default headers.
// Used by auth.ts to create authenticated server-side clients.
export function makeApiClient(
  baseUrl: string = DEFAULT_API_BASE,
  defaultHeaders: Record<string, string> = {},
) {
  return {
    async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
      const url = new URL(`${baseUrl}${path}`)
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) url.searchParams.set(key, String(value))
        })
      }
      const res = await fetch(url.toString(), {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...defaultHeaders },
      })
      return handleResponse<T>(res)
    },

    async post<T>(path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...defaultHeaders },
        body: body !== undefined ? JSON.stringify(body) : undefined,
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
        // Do NOT set Content-Type — browser sets it with boundary
        headers: { ...defaultHeaders },
      })
      return handleResponse<T>(res)
    },
  }
}

export type ApiClient = ReturnType<typeof makeApiClient>

export const apiClient = makeApiClient(DEFAULT_API_BASE)
