import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { toInternalEmail } from '@/lib/utils'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const { username, displayName, password, setupKey } = await req.json()

    if (setupKey !== process.env.SETUP_SECRET_KEY) {
      return NextResponse.json({ error: 'Invalid setup key' }, { status: 403 })
    }

    const adminCheck = await getAdminDb().collection('users').where('role', '==', 'admin').limit(1).get()
    if (!adminCheck.empty) {
      return NextResponse.json({ error: 'Admin already exists. Use the admin panel to manage users.' }, { status: 409 })
    }

    const email = toInternalEmail(username)
    const userRecord = await getAdminAuth().createUser({ email, password, displayName })

    await getAdminDb().collection('users').doc(userRecord.uid).set({
      username: username.toLowerCase(),
      displayName,
      email,
      role: 'admin',
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true, uid: userRecord.uid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
