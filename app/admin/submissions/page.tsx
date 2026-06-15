'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, query, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Submission, Result, Test } from '@/lib/types'
import Link from 'next/link'
import { formatDuration } from '@/lib/utils'

interface SubWithResult extends Submission {
  result?: Result
  testTitle?: string
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubWithResult[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTest, setFilterTest] = useState('')
  const [tests, setTests] = useState<Test[]>([])

  useEffect(() => {
    async function load() {
      const [subsSnap, testsSnap, resultsSnap] = await Promise.all([
        getDocs(collection(db, 'submissions')),
        getDocs(collection(db, 'tests')),
        getDocs(collection(db, 'results')),
      ])
      const testsMap = new Map(testsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Test]))
      const resultsMap = new Map(resultsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Result]))
      setTests(Array.from(testsMap.values()))
      const subs = subsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        result: resultsMap.get(d.id),
        testTitle: testsMap.get(d.data().testId)?.title,
      } as SubWithResult))
      setSubmissions(subs.sort((a, b) => {
        const aTime = (a.submittedAt as any)?.toMillis?.() || 0
        const bTime = (b.submittedAt as any)?.toMillis?.() || 0
        return bTime - aTime
      }))
      setLoading(false)
    }
    load()
  }, [])

  const filtered = filterTest ? submissions.filter(s => s.testId === filterTest) : submissions

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submissions</h1>
          <p className="text-gray-500 text-sm mt-0.5">View all student test submissions</p>
        </div>
        <select
          className="input w-56"
          value={filterTest}
          onChange={e => setFilterTest(e.target.value)}
        >
          <option value="">All Tests</option>
          {tests.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="font-semibold text-gray-700">No submissions yet</h3>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Student</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Test</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Score</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Time Spent</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Submitted</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(sub => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">@{sub.studentUsername}</td>
                  <td className="px-5 py-3 text-gray-600">{sub.testTitle || sub.testId}</td>
                  <td className="px-5 py-3">
                    <span className={
                      sub.status === 'submitted' ? 'badge-green' :
                      sub.status === 'auto-submitted' ? 'badge-yellow' : 'badge-blue'
                    }>
                      {sub.status === 'auto-submitted' ? 'Auto-submitted' :
                       sub.status === 'submitted' ? 'Submitted' : 'In Progress'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {sub.result ? (
                      <span className="font-medium">
                        {sub.result.obtainedMarks}/{sub.result.totalMarks}
                        <span className="text-gray-400 ml-1">({sub.result.percentage.toFixed(1)}%)</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {sub.result ? formatDuration(sub.result.totalTimeSpent) : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/submissions/${sub.id}`} className="text-blue-600 hover:underline text-xs font-medium">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
