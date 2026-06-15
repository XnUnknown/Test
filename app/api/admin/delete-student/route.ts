import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'

export async function POST(req: NextRequest) {
  try {
    const { uid } = await req.json()
    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 })
    await getAdminAuth().deleteUser(uid)
    await getAdminDb().collection('users').doc(uid).delete()
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
