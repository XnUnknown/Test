'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { formatSeconds } from '@/lib/utils'

interface Stats {
  tests: number
  students: number
  submissions: number
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats>({ tests: 0, students: 0, submissions: 0 })
  const [recentTests, setRecentTests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [testsSnap, usersSnap, subsSnap] = await Promise.all([
          getDocs(collection(db, 'tests')),
          getDocs(query(collection(db, 'users'))),
          getDocs(collection(db, 'submissions')),
        ])
        const students = usersSnap.docs.filter(d => d.data().role === 'student').length
        setStats({
          tests: testsSnap.size,
          students,
          submissions: subsSnap.size,
        })
        const tests = testsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => b.createdAt?.toMillis() - a.createdAt?.toMillis())
          .slice(0, 5)
        setRecentTests(tests)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const cards = [
    { label: 'Total Tests', value: stats.tests, color: 'bg-blue-500', icon: '📝' },
    { label: 'Students', value: stats.students, color: 'bg-green-500', icon: '👨‍🎓' },
    { label: 'Submissions', value: stats.submissions, color: 'bg-purple-500', icon: '📊' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.displayName || 'Admin'}</h1>
        <p className="text-gray-500 mt-1">Here's what's happening on your exam portal.</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">{c.icon}</span>
              <span className={`w-3 h-3 rounded-full ${c.color}`} />
            </div>
            <p className="text-3xl font-bold text-gray-900">{loading ? '—' : c.value}</p>
            <p className="text-sm text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Tests</h2>
            <Link href="/admin/tests" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentTests.length === 0 ? (
            <p className="text-gray-400 text-sm">No tests yet.</p>
          ) : (
            <div className="space-y-3">
              {recentTests.map((t: any) => (
                <Link key={t.id} href={`/admin/tests/${t.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                  <div>
                    <p className="font-medium text-sm text-gray-900 group-hover:text-blue-600">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.duration > 0 ? `${t.duration} min` : 'No limit'} · {t.endingMode === 'immediate' ? 'Auto-submit' : 'Overtime allowed'}</p>
                  </div>
                  <span className={t.isPublished ? 'badge-green' : 'badge-yellow'}>
                    {t.isPublished ? 'Published' : 'Draft'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/admin/tests/create" className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">Create New Test</p>
                <p className="text-xs text-gray-500">Set up sections, import questions</p>
              </div>
            </Link>
            <Link href="/admin/students" className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors group">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">Add Students</p>
                <p className="text-xs text-gray-500">Create student accounts with credentials</p>
              </div>
            </Link>
            <Link href="/admin/submissions" className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-colors group">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">View Submissions</p>
                <p className="text-xs text-gray-500">See scores and time analysis</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
