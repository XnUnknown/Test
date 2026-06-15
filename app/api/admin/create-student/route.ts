import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { toInternalEmail } from '@/lib/utils'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const { username, displayName, password } = await req.json()
    if (!username || !displayName || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const email = toInternalEmail(username)
    const userRecord = await getAdminAuth().createUser({ email, password, displayName })

    await getAdminDb().collection('users').doc(userRecord.uid).set({
      username: username.toLowerCase(),
      displayName,
      email,
      role: 'student',
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ uid: userRecord.uid, username })
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message || 'Failed to create student' }, { status: 500 })
  }
}
