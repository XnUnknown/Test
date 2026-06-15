'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Test, Result } from '@/lib/types'
import Link from 'next/link'
import { formatDuration } from '@/lib/utils'

export default function StudentDashboard() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const [publishedTests, setPublishedTests] = useState<Test[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
    if (!authLoading && user?.role === 'admin') router.replace('/admin')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    async function load() {
      const [testsSnap, resultsSnap] = await Promise.all([
        getDocs(query(collection(db, 'tests'), where('isPublished', '==', true))),
        getDocs(query(collection(db, 'results'), where('studentId', '==', user!.uid))),
      ])
      setPublishedTests(testsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Test)))
      setResults(
        resultsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Result))
          .sort((a, b) => {
            const aTime = (a.submittedAt as any)?.toMillis?.() || 0
            const bTime = (b.submittedAt as any)?.toMillis?.() || 0
            return bTime - aTime
          })
      )
      setLoading(false)
    }
    load()
  }, [user])

  const attemptedTestIds = new Set(results.map(r => r.testId))

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

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
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Welcome, <span className="font-medium text-gray-700">{user?.displayName}</span></span>
          <button onClick={handleSignOut} className="btn-secondary text-sm">Sign Out</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Dashboard</h1>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Available Tests', value: publishedTests.length },
            { label: 'Tests Attempted', value: results.length },
            { label: 'Avg Score', value: results.length > 0 ? `${(results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(1)}%` : '—' },
          ].map(c => (
            <div key={c.label} className="card p-5">
              <p className="text-sm text-gray-500">{c.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{loading ? '—' : c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Available Tests</h2>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : publishedTests.length === 0 ? (
              <p className="text-gray-400 text-sm">No tests available right now.</p>
            ) : (
              <div className="space-y-3">
                {publishedTests.map(t => {
                  const attempted = attemptedTestIds.has(t.id)
                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                      <div>
                        <p className="font-medium text-sm text-gray-900">{t.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.duration > 0 ? `${t.duration} min` : 'No limit'} · {t.totalMarks} marks
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {attempted && <span className="badge-green text-xs">Done</span>}
                        <Link href={`/test/${t.id}`} className="btn-primary text-xs py-1.5 px-3">
                          {attempted ? 'Retake' : 'Start'}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">My Results</h2>
            {loading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : results.length === 0 ? (
              <p className="text-gray-400 text-sm">You haven't attempted any tests yet.</p>
            ) : (
              <div className="space-y-3">
                {results.map(r => (
                  <Link key={r.id} href={`/results/${r.id}`} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group">
                    <div>
                      <p className="font-medium text-sm text-gray-900 group-hover:text-blue-700">{r.testTitle}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleDateString() : ''} · {formatDuration(r.totalTimeSpent)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-gray-900">{r.obtainedMarks}/{r.totalMarks}</p>
                      <p className={`text-xs ${r.percentage >= 50 ? 'text-green-600' : 'text-red-600'}`}>{r.percentage.toFixed(1)}%</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
