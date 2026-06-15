import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin'

export async function GET(req: NextRequest, { params }: { params: { submissionId: string } }) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7))
    const uid = decoded.uid

    const { submissionId } = params
    const [resDoc, userSnap] = await Promise.all([
      getAdminDb().collection('results').doc(submissionId).get(),
      getAdminDb().collection('users').doc(uid).get(),
    ])
    const userData = userSnap.data()

    if (!resDoc.exists) return NextResponse.json({ error: 'Result not found' }, { status: 404 })
    const resultData = resDoc.data() as Record<string, any>
    const result = { id: resDoc.id, ...resultData }

    if (resultData.studentId !== uid && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [qSnap, secSnap] = await Promise.all([
      getAdminDb().collection('questions').where('testId', '==', resultData.testId).get(),
      getAdminDb().collection('sections').where('testId', '==', resultData.testId).get(),
    ])
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const sections = secSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    return NextResponse.json({ result, questions, sections })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
