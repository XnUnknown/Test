'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { Result, Section, Question, Test } from '@/lib/types'
import { formatDuration } from '@/lib/utils'
import Link from 'next/link'

export default function ResultsPage() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const router = useRouter()
  const { user, firebaseUser, loading: authLoading } = useAuth()
  const [result, setResult] = useState<Result | null>(null)
  const [test, setTest] = useState<Test | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'questions'>('overview')

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading])

  useEffect(() => {
    if (!user || !firebaseUser) return
    async function load() {
      const idToken = await firebaseUser!.getIdToken()
      const res = await fetch(`/api/results/${submissionId}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      })
      if (!res.ok) { router.replace('/dashboard'); return }
      const data = await res.json()
      setResult(data.result as Result)
      setQuestions((data.questions as Question[]).sort((a, b) => a.order - b.order))
      setSections((data.sections as Section[]).sort((a, b) => a.order - b.order))

      const testSnap = await getDoc(doc(db, 'tests', data.result.testId))
      if (testSnap.exists()) setTest({ id: testSnap.id, ...testSnap.data() } as Test)
      setLoading(false)
    }
    load()
  }, [user, firebaseUser, submissionId])

  if (loading || authLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!result) return null

  const passed = test ? result.obtainedMarks >= test.passingMarks : false

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900">ExamPortal</span>
        </div>
        <Link href={user?.role === 'admin' ? '/admin/submissions' : '/dashboard'} className="btn-secondary text-sm">
          {user?.role === 'admin' ? 'Back to Submissions' : 'Dashboard'}
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Score Card */}
        <div className={`card p-8 mb-6 text-center border-2 ${passed ? 'border-green-400 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className={`text-5xl mb-3 font-black ${passed ? 'text-green-600' : 'text-red-600'}`}>
            {result.percentage.toFixed(1)}%
          </div>
          <div className={`text-2xl font-bold mb-1 ${passed ? 'text-green-800' : 'text-red-800'}`}>
            {passed ? '🎉 Passed!' : '❌ Not Passed'}
          </div>
          <p className="text-gray-600 mb-4">{result.testTitle}</p>
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-500">Score</p>
              <p className="text-lg font-bold text-gray-900">{result.obtainedMarks}/{result.totalMarks}</p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-500">Time Taken</p>
              <p className="text-lg font-bold text-gray-900">{formatDuration(result.totalTimeSpent)}</p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-500">Submitted</p>
              <p className="text-lg font-bold text-gray-900">{result.submittedAt?.toDate ? result.submittedAt.toDate().toLocaleDateString() : '—'}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(['overview', 'questions'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize
                ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'overview' ? 'Section Overview' : 'Question Analysis'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(result.sectionResults).map(([secId, sr]) => (
              <div key={secId} className="card p-5">
                <h3 className="font-semibold text-gray-800 mb-3">{sr.sectionTitle}</h3>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-3xl font-black text-gray-900">{sr.obtainedMarks}</span>
                  <span className="text-gray-400">/ {sr.totalMarks}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div
                    className={`h-2 rounded-full transition-all ${(sr.obtainedMarks / sr.totalMarks) >= 0.5 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${sr.totalMarks > 0 ? Math.max(0, (sr.obtainedMarks / sr.totalMarks) * 100) : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{sr.questionsAttempted}/{sr.totalQuestions} attempted</span>
                  <span>{sr.totalMarks > 0 ? ((sr.obtainedMarks / sr.totalMarks) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-6">
            {sections.map(sec => {
              const secQs = questions.filter(q => q.sectionId === sec.id).sort((a, b) => a.order - b.order)
              return (
                <div key={sec.id}>
                  <h3 className="font-semibold text-gray-700 mb-3 uppercase text-xs tracking-wide">{sec.title}</h3>
                  <div className="space-y-3">
                    {secQs.map((q, qi) => {
                      const qResult = result.questionResults[q.id]
                      const selected = qResult?.selectedOptions || []
                      const correct = qResult?.correctOptions || []
                      const timeSpent = qResult?.timeSpent || 0
                      return (
                        <div key={q.id} className={`card p-4 border-l-4 ${
                          !qResult || selected.length === 0 ? 'border-gray-300' :
                          qResult.isCorrect ? 'border-green-500' :
                          qResult.isPartiallyCorrect ? 'border-yellow-500' : 'border-red-500'
                        }`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-800 mb-3">
                                <span className="text-gray-400 mr-2">Q{qi + 1}.</span>{q.text}
                              </p>
                              <div className="space-y-1.5">
                                {q.options.map(opt => {
                                  const isSelected = selected.includes(opt.id)
                                  const isCorrect = correct.includes(opt.id)
                                  return (
                                    <div key={opt.id} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                                      isCorrect && isSelected ? 'bg-green-100 text-green-800' :
                                      isCorrect ? 'bg-green-50 text-green-700 border border-green-200' :
                                      isSelected ? 'bg-red-100 text-red-800' :
                                      'text-gray-500'
                                    }`}>
                                      <span>{isCorrect ? '✓' : isSelected ? '✗' : '○'}</span>
                                      <span>{opt.text}</span>
                                    </div>
                                  )
                                })}
                              </div>
                              {q.explanation && qResult && (
                                <p className="text-xs text-gray-500 mt-3 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">
                                  <strong>Explanation:</strong> {q.explanation}
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {qResult ? (
                                <p className={`text-base font-bold ${qResult.marksObtained > 0 ? 'text-green-600' : qResult.marksObtained < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {qResult.marksObtained > 0 ? '+' : ''}{qResult.marksObtained}
                                </p>
                              ) : null}
                              <p className="text-xs text-gray-400 mt-1">{formatDuration(timeSpent)}</p>
                              {selected.length === 0 && <span className="badge-red text-xs mt-1">Skipped</span>}
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
        )}
      </main>
    </div>
  )
}
