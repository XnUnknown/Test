import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin'

export async function GET(req: NextRequest, { params }: { params: { testId: string } }) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await getAdminAuth().verifyIdToken(authHeader.slice(7))

    const { testId } = params
    const questionsSnap = await getAdminDb()
      .collection('questions')
      .where('testId', '==', testId)
      .get()

    const questions = questionsSnap.docs.map(d => {
      const { correctAnswers, explanation, ...safeData } = d.data()
      return { id: d.id, ...safeData }
    })

    return NextResponse.json({ questions })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
