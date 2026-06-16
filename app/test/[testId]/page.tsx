'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { Test, Section, QuestionForStudent } from '@/lib/types'
import { formatSeconds, formatDuration } from '@/lib/utils'
import Timer from '@/components/Timer'

type TestState = 'loading' | 'instructions' | 'resume-prompt' | 'in-progress' | 'submitting'

interface AnswerMap {
  [questionId: string]: {
    selectedOptions: string[]
    timeSpent: number
  }
}

interface SavedSession {
  submissionId: string
  answers: AnswerMap
  startedAt: number   // unix ms — used to compute remaining time on resume
}

function sessionKey(testId: string, userId: string) {
  return `exam_${testId}_${userId}`
}
function loadSession(key: string): SavedSession | null {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null } catch { return null }
}
function saveSession(key: string, data: SavedSession) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}
function clearSavedSession(key: string) {
  try { localStorage.removeItem(key) } catch {}
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

  // examEndTime is an absolute unix ms timestamp — the single source of truth for the timer
  const [examEndTime, setExamEndTime] = useState<number | null>(null)

  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [activeQIdx, setActiveQIdx] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const questionStartTime = useRef<number>(Date.now())
  const [totalElapsed, setTotalElapsed] = useState(0)
  const elapsedInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const sKey = user ? sessionKey(testId, user.uid) : null

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading])

  useEffect(() => {
    if (!user || !sKey) return
    const key = sKey  // narrowed to string for use inside async closure
    async function load() {
      const testSnap = await getDoc(doc(db, 'tests', testId))
      if (!testSnap.exists() || !testSnap.data().isPublished) {
        router.replace('/dashboard')
        return
      }
      const testData = { id: testSnap.id, ...testSnap.data() } as Test
      setTest(testData)

      const sectionsSnap = await getDocs(query(collection(db, 'sections'), where('testId', '==', testId)))
      setSections(sectionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Section)).sort((a, b) => a.order - b.order))

      const idToken = await firebaseUser!.getIdToken()
      const res = await fetch(`/api/test/${testId}/questions`, { headers: { Authorization: `Bearer ${idToken}` } })
      const data = await res.json()
      const qs: QuestionForStudent[] = (data.questions || []).sort((a: any, b: any) => a.order - b.order)
      setQuestions(qs)

      // Check localStorage for an in-progress session
      const saved = loadSession(key)
      if (saved) {
        const endTime = saved.startedAt + testData.duration * 60 * 1000
        // Merge saved answers with current question list to handle new questions added by admin
        const mergedAnswers: AnswerMap = {}
        qs.forEach(q => {
          mergedAnswers[q.id] = saved.answers[q.id] || { selectedOptions: [], timeSpent: 0 }
        })
        setAnswers(mergedAnswers)
        setSubmissionId(saved.submissionId)
        setExamEndTime(endTime)
        setTotalElapsed(Math.floor((Date.now() - saved.startedAt) / 1000))
        submissionCreating.current = true
        setState('resume-prompt')
        return
      }

      // Fresh start
      const initAnswers: AnswerMap = {}
      qs.forEach(q => { initAnswers[q.id] = { selectedOptions: [], timeSpent: 0 } })
      setAnswers(initAnswers)
      setState('instructions')
    }
    load()
  }, [user, testId])

  // Auto-save answers to localStorage whenever they change (also saves on every elapsed tick)
  useEffect(() => {
    if (!sKey || !submissionId || !examEndTime || !test) return
    if (state !== 'in-progress' && state !== 'resume-prompt') return
    const startedAt = examEndTime - test.duration * 60 * 1000
    saveSession(sKey, { submissionId, answers, startedAt })
  }, [answers, submissionId, examEndTime, state])

  function startTest() {
    if (!test) return
    const startedAt = Date.now()
    const endTime = startedAt + test.duration * 60 * 1000
    setExamEndTime(endTime)
    questionStartTime.current = startedAt
    setTotalElapsed(0)
    setState('in-progress')
    elapsedInterval.current = setInterval(() => setTotalElapsed(e => e + 1), 1000)
  }

  function resumeTest() {
    questionStartTime.current = Date.now()
    setState('in-progress')
    elapsedInterval.current = setInterval(() => setTotalElapsed(e => e + 1), 1000)
  }

  // Create submission doc when exam first starts (not on resume — already has one)
  useEffect(() => {
    if (state === 'in-progress' && !submissionId && !submissionCreating.current && user && sKey && examEndTime && test) {
      submissionCreating.current = true
      const startedAt = examEndTime - test.duration * 60 * 1000
      const k = sKey  // capture for .then() closure
      addDoc(collection(db, 'submissions'), {
        testId,
        studentId: user.uid,
        studentUsername: user.username,
        startedAt: serverTimestamp(),
        submittedAt: null,
        status: 'in-progress',
        answers: {},
        timeOverflow: 0,
      }).then(ref => {
        setSubmissionId(ref.id)
        saveSession(k, { submissionId: ref.id, answers, startedAt })
      })
    }
  }, [state, user])

  const activeSection = sections[activeSectionIdx]
  const currentSectionQuestions = questions.filter(q => q.sectionId === activeSection?.id)
  const currentQ = currentSectionQuestions[activeQIdx]

  const saveCurrentQuestionTime = useCallback(() => {
    const cq = currentSectionQuestions[activeQIdx]
    if (!cq) return
    const spent = Math.floor((Date.now() - questionStartTime.current) / 1000)
    setAnswers(prev => ({
      ...prev,
      [cq.id]: { ...prev[cq.id], timeSpent: (prev[cq.id]?.timeSpent || 0) + spent },
    }))
    questionStartTime.current = Date.now()
  }, [activeQIdx, activeSectionIdx, currentSectionQuestions])

  function navigateToQuestion(secIdx: number, qIdx: number) {
    saveCurrentQuestionTime()
    setActiveSectionIdx(secIdx)
    setActiveQIdx(qIdx)
    questionStartTime.current = Date.now()
    setSidebarOpen(false)
  }

  function handleOptionToggle(optId: string) {
    if (!currentQ) return
    setAnswers(prev => {
      const cur = prev[currentQ.id]?.selectedOptions || []
      const next = currentQ.type === 'single' || currentQ.type === 'true-false'
        ? (cur.includes(optId) ? [] : [optId])
        : (cur.includes(optId) ? cur.filter(x => x !== optId) : [...cur, optId])
      return { ...prev, [currentQ.id]: { ...prev[currentQ.id], selectedOptions: next } }
    })
  }

  function clearAnswer() {
    if (!currentQ) return
    setAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], selectedOptions: [] } }))
  }

  function nextQuestion() {
    if (activeQIdx < currentSectionQuestions.length - 1) navigateToQuestion(activeSectionIdx, activeQIdx + 1)
    else if (activeSectionIdx < sections.length - 1) navigateToQuestion(activeSectionIdx + 1, 0)
  }

  function prevQuestion() {
    if (activeQIdx > 0) navigateToQuestion(activeSectionIdx, activeQIdx - 1)
    else if (activeSectionIdx > 0) {
      const prevSec = sections[activeSectionIdx - 1]
      const prevSecQs = questions.filter(q => q.sectionId === prevSec.id)
      navigateToQuestion(activeSectionIdx - 1, prevSecQs.length - 1)
    }
  }

  async function submitTest(autoSubmit = false) {
    saveCurrentQuestionTime()
    setState('submitting')
    if (elapsedInterval.current) clearInterval(elapsedInterval.current)
    if (sKey) clearSavedSession(sKey)
    setSubmitError('')
    try {
      let subId = submissionId
      if (!subId) {
        const subRef = await addDoc(collection(db, 'submissions'), {
          testId, studentId: user!.uid, studentUsername: user!.username,
          startedAt: serverTimestamp(), submittedAt: null,
          status: 'in-progress', answers: {}, timeOverflow: 0,
        })
        subId = subRef.id
      }
      const answersPayload: Record<string, { selectedOptions: string[]; timeSpent: number }> = {}
      for (const [qId, ans] of Object.entries(answers)) {
        answersPayload[qId] = { selectedOptions: ans.selectedOptions, timeSpent: ans.timeSpent }
      }
      const idToken = await firebaseUser!.getIdToken()
      const res = await fetch('/api/submit-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ submissionId: subId, testId, answers: answersPayload, totalTimeSpent: totalElapsed, autoSubmit }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/results/${subId}`)
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed')
      setState('in-progress')
    }
  }

  // ─── Render states ─────────────────────────────────────────────────────────

  if (authLoading || state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'instructions' && test) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full card p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{test.title}</h1>
            <p className="text-gray-500 mt-2">{test.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[
              { label: 'Duration', value: test.duration > 0 ? `${test.duration} minutes` : 'No time limit' },
              { label: 'Total Questions', value: questions.length },
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
              Your answers are saved automatically. Once submitted, you cannot change your answers.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="btn-secondary flex-1">Go Back</button>
            <button onClick={startTest} className="btn-primary flex-1 py-3 text-base">Start Test</button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'resume-prompt' && test && examEndTime) {
    const remainingSecs = Math.max(0, Math.round((examEndTime - Date.now()) / 1000))
    const answeredCount = Object.values(answers).filter(a => a.selectedOptions.length > 0).length
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full card p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Exam In Progress</h1>
          <p className="text-gray-600 mb-2">
            You have an active session for <strong>{test.title}</strong>.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Your answers are saved. You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
            {test.duration > 0 && (
              <> Time remaining: <strong className="text-blue-600">{formatSeconds(remainingSecs)}</strong></>
            )}
          </p>
          <div className="space-y-3">
            <button onClick={resumeTest} className="btn-primary w-full py-3">
              Continue Exam
            </button>
            <button
              onClick={() => { setConfirmSubmit(true); resumeTest() }}
              className="btn-secondary w-full text-sm text-gray-500"
            >
              Submit Current Answers & End
            </button>
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
  const globalQIdx = sections.slice(0, activeSectionIdx).reduce(
    (acc, sec) => acc + questions.filter(q => q.sectionId === sec.id).length, 0
  ) + activeQIdx + 1

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile: sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
            title="Question navigator"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900 text-sm truncate">{test.title}</h1>
            <p className="text-xs text-gray-400">Q{globalQIdx} of {totalQCount} · {totalAnswered} answered</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {test.duration > 0 && examEndTime && (
            <Timer
              endTime={examEndTime}
              endingMode={test.endingMode}
              onTimeUp={() => submitTest(true)}
            />
          )}
          {test.duration === 0 && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-mono text-gray-600 text-sm font-medium">No limit</span>
            </div>
          )}
          <button onClick={() => setConfirmSubmit(true)} className="btn-primary text-sm py-2 px-3">
            Submit
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar: Navigator — overlay on mobile, inline on desktop */}
        <div className={`
          absolute inset-y-0 left-0 z-20
          md:relative md:inset-auto md:z-auto
          w-72 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="p-4">
            {/* Mobile close button */}
            <div className="flex items-center justify-between mb-3 md:block">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sections</p>
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {sections.map((sec, si) => {
              const secQs = questions.filter(q => q.sectionId === sec.id)
              const secAnswered = secQs.filter(q => answers[q.id]?.selectedOptions.length > 0).length
              const overLimit = sec.attemptLimit != null && secAnswered > sec.attemptLimit
              return (
                <div key={sec.id} className="mb-4">
                  <button
                    onClick={() => navigateToQuestion(si, 0)}
                    className={`w-full text-left text-sm font-medium px-3 py-2 rounded-lg mb-2 transition-colors
                      ${activeSectionIdx === si ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{sec.title}</span>
                      <span className={`text-xs ml-2 ${activeSectionIdx === si ? 'text-blue-200' : overLimit ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                        {sec.attemptLimit != null
                          ? `${secAnswered}/${sec.attemptLimit} (limit)`
                          : `${secAnswered}/${secQs.length}`}
                      </span>
                    </div>
                    {sec.attemptLimit != null && overLimit && (
                      <p className={`text-xs mt-0.5 ${activeSectionIdx === si ? 'text-red-200' : 'text-red-500'}`}>
                        Exceeds limit — best {sec.attemptLimit} will be scored
                      </p>
                    )}
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
              <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-500 rounded" /> Answered</div>
              <div className="flex items-center gap-2"><span className="w-4 h-4 bg-gray-100 border border-gray-300 rounded" /> Not answered</div>
              <div className="flex items-center gap-2"><span className="w-4 h-4 bg-gray-100 border-2 border-blue-500 rounded" /> Current</div>
            </div>
          </div>
        </div>

        {/* Main: Question */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6">
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
                        ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
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
                <button
                  onClick={prevQuestion}
                  disabled={activeSectionIdx === 0 && activeQIdx === 0}
                  className="btn-secondary gap-2"
                >
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
