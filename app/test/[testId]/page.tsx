'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { Test, Section, QuestionForStudent } from '@/lib/types'
import { formatSeconds, formatDuration } from '@/lib/utils'
import Timer from '@/components/Timer'

type TestState = 'loading' | 'instructions' | 'in-progress' | 'submitting' | 'submitted'

interface AnswerMap {
  [questionId: string]: {
    selectedOptions: string[]
    timeSpent: number
    lastVisitedAt: number
  }
}

export default function TestPage() {
  const { testId } = useParams<{ testId: string }>()
  const router = useRouter()
  const { user, firebaseUser, loading: authLoading } = useAuth()

  const [state, setState] = useState<TestState>('loading')
  const [test, setTest] = useState<Test | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [questions, setQuestions] = useState<QuestionForStudent[]>([])
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const submissionCreating = useRef(false)

  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [activeQIdx, setActiveQIdx] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const questionStartTime = useRef<number>(Date.now())
  const [totalElapsed, setTotalElapsed] = useState(0)
  const elapsedInterval = useRef<NodeJS.Timeout | null>(null)

  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    async function load() {
      const testSnap = await getDoc(doc(db, 'tests', testId))
      if (!testSnap.exists() || !testSnap.data().isPublished) {
        router.replace('/dashboard')
        return
      }
      setTest({ id: testSnap.id, ...testSnap.data() } as Test)

      const sectionsSnap = await getDocs(query(collection(db, 'sections'), where('testId', '==', testId)))
      const sortedSections = sectionsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Section))
        .sort((a, b) => a.order - b.order)
      setSections(sortedSections)

      // Fetch questions without correct answers via API
      const idToken = await firebaseUser!.getIdToken()
      const res = await fetch(`/api/test/${testId}/questions`, {
        headers: { Authorization: `Bearer ${idToken}` }
      })
      const data = await res.json()
      const qs: QuestionForStudent[] = (data.questions || []).sort((a: any, b: any) => a.order - b.order)
      setQuestions(qs)

      // Init answer map
      const initAnswers: AnswerMap = {}
      qs.forEach(q => { initAnswers[q.id] = { selectedOptions: [], timeSpent: 0, lastVisitedAt: Date.now() } })
      setAnswers(initAnswers)
      setState('instructions')
    }
    load()
  }, [user, testId])

  function startTest() {
    setState('in-progress')
    questionStartTime.current = Date.now()
    elapsedInterval.current = setInterval(() => setTotalElapsed(e => e + 1), 1000)
  }

  const saveCurrentQuestionTime = useCallback(() => {
    const currentQ = currentSectionQuestions[activeQIdx]
    if (!currentQ) return
    const spent = Math.floor((Date.now() - questionStartTime.current) / 1000)
    setAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        ...prev[currentQ.id],
        timeSpent: (prev[currentQ.id]?.timeSpent || 0) + spent,
        lastVisitedAt: Date.now(),
      }
    }))
    questionStartTime.current = Date.now()
  }, [activeQIdx, activeSectionIdx])

  const activeSection = sections[activeSectionIdx]
  const currentSectionQuestions = questions.filter(q => q.sectionId === activeSection?.id)
  const currentQ = currentSectionQuestions[activeQIdx]

  function navigateToQuestion(secIdx: number, qIdx: number) {
    saveCurrentQuestionTime()
    setActiveSectionIdx(secIdx)
    setActiveQIdx(qIdx)
    questionStartTime.current = Date.now()
  }

  function handleOptionToggle(optId: string) {
    if (!currentQ) return
    setAnswers(prev => {
      const current = prev[currentQ.id]?.selectedOptions || []
      let next: string[]
      if (currentQ.type === 'single' || currentQ.type === 'true-false') {
        next = current.includes(optId) ? [] : [optId]
      } else {
        next = current.includes(optId) ? current.filter(x => x !== optId) : [...current, optId]
      }
      return { ...prev, [currentQ.id]: { ...prev[currentQ.id], selectedOptions: next } }
    })
  }

  function clearAnswer() {
    if (!currentQ) return
    setAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], selectedOptions: [] } }))
  }

  function nextQuestion() {
    if (activeQIdx < currentSectionQuestions.length - 1) {
      navigateToQuestion(activeSectionIdx, activeQIdx + 1)
    } else if (activeSectionIdx < sections.length - 1) {
      navigateToQuestion(activeSectionIdx + 1, 0)
    }
  }

  function prevQuestion() {
    if (activeQIdx > 0) {
      navigateToQuestion(activeSectionIdx, activeQIdx - 1)
    } else if (activeSectionIdx > 0) {
      const prevSec = sections[activeSectionIdx - 1]
      const prevSecQs = questions.filter(q => q.sectionId === prevSec.id)
      navigateToQuestion(activeSectionIdx - 1, prevSecQs.length - 1)
    }
  }

  async function submitTest(autoSubmit = false) {
    saveCurrentQuestionTime()
    setState('submitting')
    if (elapsedInterval.current) clearInterval(elapsedInterval.current)
    setSubmitError('')
    try {
      // Wait for submission doc to be created (created in useEffect when test starts)
      let subId = submissionId
      if (!subId) {
        // Fallback: create inline if useEffect hasn't run yet
        const subRef = await addDoc(collection(db, 'submissions'), {
          testId, studentId: user!.uid, studentUsername: user!.username,
          startedAt: serverTimestamp(), submittedAt: null,
          status: 'in-progress', answers: {}, timeOverflow: 0,
        })
        subId = subRef.id
      }

      // Prepare answers payload (convert Timestamp refs)
      const answersPayload: Record<string, { selectedOptions: string[]; timeSpent: number }> = {}
      for (const [qId, ans] of Object.entries(answers)) {
        answersPayload[qId] = { selectedOptions: ans.selectedOptions, timeSpent: ans.timeSpent }
      }

      const idToken = await firebaseUser!.getIdToken()
      const res = await fetch('/api/submit-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          submissionId: subId,
          testId,
          answers: answersPayload,
          totalTimeSpent: totalElapsed,
          autoSubmit,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/results/${subId}`)
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed')
      setState('in-progress')
    }
  }

  function handleTimeUp() {
    submitTest(true)
  }

  // Create submission when test starts to track in-progress
  useEffect(() => {
    if (state === 'in-progress' && !submissionId && !submissionCreating.current && user) {
      submissionCreating.current = true
      addDoc(collection(db, 'submissions'), {
        testId,
        studentId: user.uid,
        studentUsername: user.username,
        startedAt: serverTimestamp(),
        submittedAt: null,
        status: 'in-progress',
        answers: {},
        timeOverflow: 0,
      }).then(ref => setSubmissionId(ref.id))
    }
  }, [state, user])

  if (authLoading || state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'instructions' && test) {
    const totalQs = questions.length
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="card p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{test.title}</h1>
              <p className="text-gray-500 mt-2">{test.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: 'Duration', value: test.duration > 0 ? `${test.duration} minutes` : 'No time limit' },
                { label: 'Total Questions', value: totalQs },
                { label: 'Total Marks', value: test.totalMarks },
                { label: 'Passing Marks', value: test.passingMarks },
                { label: 'Sections', value: sections.length },
                { label: 'On Time Up', value: test.endingMode === 'immediate' ? 'Auto Submit' : 'Overtime allowed' },
              ].map(i => (
                <div key={i.label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{i.label}</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{i.value}</p>
                </div>
              ))}
            </div>

            {test.instructions && (
              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-blue-900 mb-2">Instructions</h3>
                <p className="text-sm text-blue-800 whitespace-pre-line">{test.instructions}</p>
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Do not refresh or close the browser during the test.
                Your answers are tracked automatically. Once submitted, you cannot change your answers.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="btn-secondary flex-1">Go Back</button>
              <button onClick={startTest} className="btn-primary flex-1 py-3 text-base">
                Start Test
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'submitting') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Submitting your answers...</p>
          <p className="text-gray-400 text-sm mt-1">Please wait, calculating your score</p>
        </div>
      </div>
    )
  }

  if (state !== 'in-progress' || !test) return null

  const totalAnswered = Object.values(answers).filter(a => a.selectedOptions.length > 0).length
  const totalQCount = questions.length
  const globalQIdx = sections.slice(0, activeSectionIdx).reduce((acc, sec) => acc + questions.filter(q => q.sectionId === sec.id).length, 0) + activeQIdx + 1

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="font-bold text-gray-900 text-sm">{test.title}</h1>
          <p className="text-xs text-gray-400">Q{globalQIdx} of {totalQCount} · {totalAnswered} answered</p>
        </div>
        <div className="flex items-center gap-4">
          {test.duration > 0 && (
            <Timer
              durationSeconds={test.duration * 60}
              endingMode={test.endingMode}
              onTimeUp={handleTimeUp}
            />
          )}
          <button
            onClick={() => setConfirmSubmit(true)}
            className="btn-primary text-sm py-2"
          >
            Submit Test
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Navigator */}
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Sections</p>
            {sections.map((sec, si) => {
              const secQs = questions.filter(q => q.sectionId === sec.id)
              const secAnswered = secQs.filter(q => answers[q.id]?.selectedOptions.length > 0).length
              return (
                <div key={sec.id} className="mb-4">
                  <button
                    onClick={() => navigateToQuestion(si, 0)}
                    className={`w-full text-left text-sm font-medium px-3 py-2 rounded-lg mb-2 transition-colors
                      ${activeSectionIdx === si ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    {sec.title}
                    <span className={`ml-2 text-xs ${activeSectionIdx === si ? 'text-blue-200' : 'text-gray-400'}`}>
                      {secAnswered}/{secQs.length}
                    </span>
                  </button>
                  {activeSectionIdx === si && (
                    <div className="grid grid-cols-5 gap-1.5 px-2">
                      {secQs.map((q, qi) => {
                        const isAnswered = answers[q.id]?.selectedOptions.length > 0
                        const isCurrent = qi === activeQIdx
                        return (
                          <button
                            key={q.id}
                            onClick={() => navigateToQuestion(si, qi)}
                            className={`w-full aspect-square text-xs font-medium rounded-lg transition-colors
                              ${isCurrent ? 'ring-2 ring-blue-600 ring-offset-1' : ''}
                              ${isAnswered ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            {qi + 1}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-green-500 rounded" /> Answered
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-gray-100 border border-gray-300 rounded" /> Not answered
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-gray-100 border-2 border-blue-500 rounded" /> Current
              </div>
            </div>
          </div>
        </div>

        {/* Main: Question */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentQ ? (
            <div className="max-w-3xl mx-auto">
              <div className="card p-6 mb-4">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <span className="text-xs font-medium text-gray-400 uppercase">
                      {activeSection?.title} · Question {activeQIdx + 1}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        currentQ.type === 'multiple' ? 'bg-purple-100 text-purple-700' :
                        currentQ.type === 'true-false' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {currentQ.type === 'multiple' ? 'Multiple correct' :
                         currentQ.type === 'true-false' ? 'True / False' : 'Single correct'}
                      </span>
                      <span className="text-xs text-gray-400">{currentQ.marks} marks</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    <p>Time on this Q</p>
                    <p className="font-mono font-medium text-gray-600">{formatSeconds(answers[currentQ.id]?.timeSpent || 0)}</p>
                  </div>
                </div>

                <p className="text-gray-900 font-medium mb-5 leading-relaxed">{currentQ.text}</p>

                <div className="space-y-3">
                  {currentQ.options.map((opt) => {
                    const isSelected = answers[currentQ.id]?.selectedOptions.includes(opt.id)
                    return (
                      <label key={opt.id} className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                        ${isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                        <div className={`w-5 h-5 rounded-${currentQ.type === 'multiple' ? 'md' : 'full'} border-2 flex items-center justify-center flex-shrink-0
                          ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <input
                          type={currentQ.type === 'multiple' ? 'checkbox' : 'radio'}
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => handleOptionToggle(opt.id)}
                        />
                        <span className="text-gray-800">{opt.text}</span>
                      </label>
                    )
                  })}
                </div>

                {answers[currentQ.id]?.selectedOptions.length > 0 && (
                  <button onClick={clearAnswer} className="mt-3 text-sm text-gray-400 hover:text-gray-600 underline">
                    Clear answer
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button onClick={prevQuestion} disabled={activeSectionIdx === 0 && activeQIdx === 0} className="btn-secondary gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
                {activeSectionIdx === sections.length - 1 && activeQIdx === currentSectionQuestions.length - 1 ? (
                  <button onClick={() => setConfirmSubmit(true)} className="btn-primary gap-2">
                    Review & Submit
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                ) : (
                  <button onClick={nextQuestion} className="btn-primary gap-2">
                    Next
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 mt-20">No questions in this section.</div>
          )}
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Submit Test?</h2>
            <div className="space-y-2 text-sm text-gray-600 mb-6">
              <p>Total Questions: <strong>{totalQCount}</strong></p>
              <p>Answered: <strong className="text-green-600">{totalAnswered}</strong></p>
              <p>Unanswered: <strong className="text-red-600">{totalQCount - totalAnswered}</strong></p>
              <p>Time Spent: <strong>{formatDuration(totalElapsed)}</strong></p>
            </div>
            {submitError && <p className="text-red-600 text-sm mb-4">{submitError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setConfirmSubmit(false)} className="btn-secondary flex-1">Go Back</button>
              <button onClick={() => { setConfirmSubmit(false); submitTest(false) }} className="btn-primary flex-1">
                Submit Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
