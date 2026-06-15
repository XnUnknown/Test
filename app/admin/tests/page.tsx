'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Test } from '@/lib/types'
import { generateTestLink } from '@/lib/utils'

export default function TestsPage() {
  const [tests, setTests] = useState<Test[]>([])
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState<string | null>(null)

  useEffect(() => {
    loadTests()
  }, [])

  async function loadTests() {
    const snap = await getDocs(collection(db, 'tests'))
    setTests(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Test))
        .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    )
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this test? This cannot be undone.')) return
    await deleteDoc(doc(db, 'tests', id))
    setTests(prev => prev.filter(t => t.id !== id))
  }

  async function copyLink(testId: string) {
    setCopying(testId)
    await navigator.clipboard.writeText(generateTestLink(testId))
    setTimeout(() => setCopying(null), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tests</h1>
          <p className="text-gray-500 text-sm mt-0.5">Create and manage your exam tests</p>
        </div>
        <Link href="/admin/tests/create" className="btn-primary gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Test
        </Link>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : tests.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">📝</div>
          <h3 className="font-semibold text-gray-700 mb-2">No tests yet</h3>
          <p className="text-gray-400 text-sm mb-6">Create your first test to get started</p>
          <Link href="/admin/tests/create" className="btn-primary">Create Test</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map((test) => (
            <div key={test.id} className="card p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-gray-900">{test.title}</h3>
                  <span className={test.isPublished ? 'badge-green' : 'badge-yellow'}>
                    {test.isPublished ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate">{test.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>⏱ {test.duration > 0 ? `${test.duration} min` : 'No limit'}</span>
                  <span>📊 {test.totalMarks || 0} marks</span>
                  <span>🏆 Pass: {test.passingMarks || 0}</span>
                  <span>{test.endingMode === 'immediate' ? '🔴 Auto-submit' : '🟡 Overtime allowed'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyLink(test.id)}
                  className={`btn-secondary text-xs gap-1.5 ${copying === test.id ? 'text-green-600 border-green-400' : ''}`}
                  title="Copy test link"
                >
                  {copying === test.id ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Link
                    </>
                  )}
                </button>
                <Link href={`/admin/tests/${test.id}`} className="btn-secondary text-xs">Manage</Link>
                <button onClick={() => handleDelete(test.id)} className="btn-danger text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
