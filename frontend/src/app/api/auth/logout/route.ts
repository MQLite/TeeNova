import { NextResponse } from 'next/server'

const COOKIE_NAME = 'admin_token'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  // Clear cookie using identical attribute set as login to ensure browsers remove it
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
