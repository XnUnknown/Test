'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Submission, Result, Test, Section, Question } from '@/lib/types'
import { formatDuration, formatSeconds } from '@/lib/utils'
import Link from 'next/link'

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [test, setTest] = useState<Test | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [subSnap, resSnap] = await Promise.all([
        getDoc(doc(db, 'submissions', id)),
        getDoc(doc(db, 'results', id)),
      ])
      if (!subSnap.exists()) { router.push('/admin/submissions'); return }
      const sub = { id: subSnap.id, ...subSnap.data() } as Submission
      setSubmission(sub)
      if (resSnap.exists()) setResult({ id: resSnap.id, ...resSnap.data() } as Result)
      const [testSnap, secSnap, qSnap] = await Promise.all([
        getDoc(doc(db, 'tests', sub.testId)),
        getDocs(query(collection(db, 'sections'), where('testId', '==', sub.testId))),
        getDocs(query(collection(db, 'questions'), where('testId', '==', sub.testId))),
      ])
      if (testSnap.exists()) setTest({ id: testSnap.id, ...testSnap.data() } as Test)
      setSections(secSnap.docs.map(d => ({ id: d.id, ...d.data() } as Section)))
      setQuestions(qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question)))
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!submission) return null

  const attemptedCount = Object.values(submission.answers).filter(a => a.selectedOptions.length > 0).length
  const totalQ = questions.length

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/submissions" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submission Detail</h1>
          <p className="text-gray-500 text-sm">@{submission.studentUsername} · {test?.title}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Score', value: result ? `${result.obtainedMarks}/${result.totalMarks}` : '—', sub: result ? `${result.percentage.toFixed(1)}%` : '' },
          { label: 'Questions Attempted', value: `${attemptedCount}/${totalQ}`, sub: '' },
          { label: 'Total Time', value: result ? formatDuration(result.totalTimeSpent) : '—', sub: '' },
          { label: 'Status', value: submission.status === 'auto-submitted' ? 'Auto-submitted' : 'Submitted', sub: '' },
        ].map(c => (
          <div key={c.label} className="card p-4">
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{c.value}</p>
            {c.sub && <p className="text-sm text-gray-400">{c.sub}</p>}
          </div>
        ))}
      </div>

      {result && (
        <div className="mb-6">
          <h2 className="font-semibold text-gray-800 mb-3">Section Performance</h2>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(result.sectionResults).map(([secId, sr]) => (
              <div key={secId} className="card p-4">
                <p className="font-medium text-gray-800 text-sm">{sr.sectionTitle}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{sr.obtainedMarks}/{sr.totalMarks}</p>
                <p className="text-xs text-gray-400 mt-1">{sr.questionsAttempted}/{sr.totalQuestions} attempted</p>
                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${sr.totalMarks > 0 ? (sr.obtainedMarks / sr.totalMarks) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="font-semibold text-gray-800 mb-3">Question-by-Question Analysis</h2>
      {sections.map(sec => {
        const secQs = questions.filter(q => q.sectionId === sec.id).sort((a, b) => a.order - b.order)
        return (
          <div key={sec.id} className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3 text-sm uppercase tracking-wide">{sec.title}</h3>
            <div className="space-y-3">
              {secQs.map((q, qi) => {
                const answer = submission.answers[q.id]
                const qResult = result?.questionResults[q.id]
                const selected = answer?.selectedOptions || []
                const timeSpent = answer?.timeSpent || 0
                return (
                  <div key={q.id} className={`card p-4 border-l-4 ${
                    !qResult ? 'border-gray-200' :
                    qResult.isCorrect ? 'border-green-500' :
                    qResult.isPartiallyCorrect ? 'border-yellow-500' :
                    selected.length === 0 ? 'border-gray-300' : 'border-red-500'
                  }`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800 mb-2">
                          <span className="text-gray-400 mr-2">Q{qi + 1}.</span>{q.text}
                        </p>
                        <div className="space-y-1">
                          {q.options.map(opt => {
                            const isSelected = selected.includes(opt.id)
                            const isCorrect = q.correctAnswers.includes(opt.id)
                            return (
                              <div key={opt.id} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${
                                isCorrect && isSelected ? 'bg-green-100 text-green-800' :
                                isCorrect ? 'bg-green-50 text-green-700' :
                                isSelected ? 'bg-red-100 text-red-800' :
                                'text-gray-600'
                              }`}>
                                <span className="text-xs">
                                  {isCorrect ? '✓' : isSelected ? '✗' : '○'}
                                </span>
                                {opt.text}
                                {isCorrect && !isSelected && <span className="text-xs ml-auto text-green-600">Correct answer</span>}
                                {isSelected && !isCorrect && <span className="text-xs ml-auto text-red-600">Wrong choice</span>}
                              </div>
                            )
                          })}
                        </div>
                        {q.explanation && qResult && (
                          <p className="text-xs text-gray-500 mt-2 bg-blue-50 px-3 py-2 rounded-lg">
                            <span className="font-medium">Explanation:</span> {q.explanation}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 space-y-1">
                        {qResult && (
                          <p className={`text-sm font-bold ${qResult.marksObtained > 0 ? 'text-green-600' : qResult.marksObtained < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {qResult.marksObtained > 0 ? '+' : ''}{qResult.marksObtained}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">{formatDuration(timeSpent)}</p>
                        {selected.length === 0 && <span className="badge-red text-xs">Skipped</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
