const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://localhost:44300'

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

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value))
      })
    }
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    })
    return handleResponse<T>(res)
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(res)
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(res)
  },

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    return handleResponse<T>(res)
  },

  async uploadFile<T>(path: string, file: File): Promise<T> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      body: formData,
      // Do NOT set Content-Type — browser sets it with boundary
    })
    return handleResponse<T>(res)
  },
}
