import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const role = request.cookies.get('user-role')?.value
  const uid = request.cookies.get('user-uid')?.value
  const isLoggedIn = !!uid

  if (pathname === '/login') {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(role === 'admin' ? '/admin' : '/dashboard', request.url))
    }
    return NextResponse.next()
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/login', '/admin/:path*', '/dashboard/:path*', '/test/:path*', '/results/:path*'],
}
