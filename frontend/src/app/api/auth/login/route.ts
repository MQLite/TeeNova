import { type NextRequest, NextResponse } from 'next/server'

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://localhost:44300'
const COOKIE_NAME = 'admin_token'

export async function POST(req: NextRequest) {
  let body: { username?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 })
  }

  const { username, password } = body
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ message: 'Username and password are required.' }, { status: 400 })
  }

  // Forward the browser's real IP so backend rate limiting partitions by client,
  // not by this Next.js server's loopback address.
  const realIp =
    req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null

  let backendRes: Response
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(realIp ? { 'X-Forwarded-For': realIp } : {}),
      },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    return NextResponse.json({ message: 'Backend unreachable. Please try again.' }, { status: 503 })
  }

  if (!backendRes.ok) {
    return NextResponse.json({ message: 'Invalid username or password.' }, { status: 401 })
  }

  let data: { token: string; expiresAt: string; username: string }
  try {
    data = await backendRes.json()
  } catch {
    return NextResponse.json({ message: 'Unexpected response from server.' }, { status: 502 })
  }

  const expiresAt = new Date(data.expiresAt)
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))

  const response = NextResponse.json({ ok: true, username: data.username })
  response.cookies.set(COOKIE_NAME, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  })

  return response
}
