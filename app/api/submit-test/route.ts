import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7))
    const uid = decoded.uid

    const body = await req.json()
    const { submissionId, testId, answers, totalTimeSpent, timeOverflow } = body

    if (!submissionId || !testId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = getAdminDb()
    const subRef = db.collection('submissions').doc(submissionId)
    const subSnap = await subRef.get()
    if (!subSnap.exists || subSnap.data()?.studentId !== uid) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    if (subSnap.data()?.status !== 'in-progress') {
      return NextResponse.json({ error: 'Submission already submitted' }, { status: 409 })
    }

    const [questionsSnap, sectionsSnap, testSnap, userSnap] = await Promise.all([
      db.collection('questions').where('testId', '==', testId).get(),
      db.collection('sections').where('testId', '==', testId).get(),
      db.collection('tests').doc(testId).get(),
      db.collection('users').doc(uid).get(),
    ])

    const testData = testSnap.data()
    const sectionMap = new Map(sectionsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]))

    let totalMarks = 0
    let obtainedMarks = 0
    const questionResults: Record<string, any> = {}
    const sectionResults: Record<string, any> = {}
    // Track per-question result for optional-section recompute
    const sectionQuestionResults: Record<string, { qId: string; marks: number; marksObtained: number }[]> = {}

    for (const qDoc of questionsSnap.docs) {
      const q = qDoc.data()
      const qId = qDoc.id
      const answer = answers[qId] || { selectedOptions: [], timeSpent: 0 }
      const selected: string[] = answer.selectedOptions || []
      const correct: string[] = q.correctAnswers || []

      totalMarks += q.marks

      let marksObtained = 0
      let isCorrect = false
      let isPartiallyCorrect = false

      if (selected.length > 0) {
        if (q.type === 'single' || q.type === 'true-false') {
          isCorrect = selected.length === 1 && correct.includes(selected[0])
          marksObtained = isCorrect ? q.marks : -(q.negativeMarks || 0)
        } else {
          const correctSelected = selected.filter((s: string) => correct.includes(s))
          const wrongSelected = selected.filter((s: string) => !correct.includes(s))
          if (wrongSelected.length === 0 && correctSelected.length === correct.length) {
            isCorrect = true
            marksObtained = q.marks
          } else if (correctSelected.length > 0 && wrongSelected.length === 0) {
            isPartiallyCorrect = true
            marksObtained = (q.marks / correct.length) * correctSelected.length
          } else {
            marksObtained = -(q.negativeMarks || 0)
          }
        }
      }

      obtainedMarks += marksObtained

      questionResults[qId] = {
        isCorrect, isPartiallyCorrect,
        marksObtained: Math.round(marksObtained * 100) / 100,
        timeSpent: answer.timeSpent || 0,
        selectedOptions: selected,
        correctOptions: correct,
      }

      const sectionId = q.sectionId
      const section = sectionMap.get(sectionId) as any
      if (!sectionResults[sectionId]) {
        sectionResults[sectionId] = {
          totalMarks: 0, obtainedMarks: 0,
          questionsAttempted: 0, totalQuestions: 0,
          sectionTitle: section?.title || sectionId,
        }
      }
      sectionResults[sectionId].totalMarks += q.marks
      sectionResults[sectionId].obtainedMarks += Math.round(marksObtained * 100) / 100
      sectionResults[sectionId].totalQuestions += 1
      if (selected.length > 0) sectionResults[sectionId].questionsAttempted += 1

      if (!sectionQuestionResults[sectionId]) sectionQuestionResults[sectionId] = []
      sectionQuestionResults[sectionId].push({ qId, marks: q.marks, marksObtained })
    }

    // For sections with attemptLimit: keep only the best N attempted answers
    for (const [sectionId, section] of sectionMap.entries()) {
      const s = section as any
      if (!s.attemptLimit) continue
      const limit: number = s.attemptLimit
      const qResults = sectionQuestionResults[sectionId] || []
      const attempted = qResults.filter(r => (answers[r.qId]?.selectedOptions?.length || 0) > 0)
      if (attempted.length <= limit) continue

      // Sort by marks obtained descending; drop lowest extras
      attempted.sort((a, b) => b.marksObtained - a.marksObtained)
      const dropped = attempted.slice(limit) // beyond the best N

      for (const d of dropped) {
        const old = d.marksObtained
        obtainedMarks -= old
        sectionResults[sectionId].obtainedMarks -= Math.round(old * 100) / 100
        sectionResults[sectionId].questionsAttempted -= 1
        // Mark this question as excluded in results
        questionResults[d.qId].marksObtained = 0
        questionResults[d.qId].excludedByLimit = true
      }
    }

    const finalMarks = Math.max(0, Math.round(obtainedMarks * 100) / 100)
    const percentage = totalMarks > 0 ? (finalMarks / totalMarks) * 100 : 0

    const batch = db.batch()
    batch.update(subRef, {
      status: body.autoSubmit ? 'auto-submitted' : 'submitted',
      submittedAt: FieldValue.serverTimestamp(),
      answers,
      timeOverflow: timeOverflow || 0,
    })
    batch.set(db.collection('results').doc(submissionId), {
      testId,
      testTitle: testData?.title || '',
      studentId: uid,
      studentUsername: userSnap.data()?.username || '',
      totalMarks,
      obtainedMarks: finalMarks,
      percentage: Math.round(percentage * 100) / 100,
      questionResults,
      sectionResults,
      totalTimeSpent: totalTimeSpent || 0,
      calculatedAt: FieldValue.serverTimestamp(),
      submittedAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()

    return NextResponse.json({ submissionId, totalMarks, obtainedMarks: finalMarks, percentage: Math.round(percentage * 100) / 100 })
  } catch (err: any) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: err.message || 'Submission failed' }, { status: 500 })
  }
}
