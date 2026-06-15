'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/contexts/AuthContext'
import { EndingMode } from '@/lib/types'
import Link from 'next/link'

export default function CreateTestPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    duration: 60,
    endingMode: 'immediate' as EndingMode,
    passingMarks: 0,
    instructions: '',
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const ref = await addDoc(collection(db, 'tests'), {
        ...form,
        duration: Number(form.duration),
        passingMarks: Number(form.passingMarks),
        totalMarks: 0,
        isPublished: false,
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      router.push(`/admin/tests/${ref.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/tests" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Test</h1>
          <p className="text-gray-500 text-sm">Set up your exam configuration</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-gray-800">Basic Information</h2>

          <div>
            <label className="label">Test Title *</label>
            <input className="input" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Mathematics Mid-Term 2024" />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of the test" />
          </div>

          <div>
            <label className="label">Instructions for Students</label>
            <textarea className="input" rows={4} value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="e.g. Read each question carefully. Do not refresh the page during the test..." />
          </div>
        </div>

        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-gray-800">Timing</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Duration (minutes)</label>
              <input
                type="number"
                className="input"
                min={0}
                value={form.duration}
                onChange={e => set('duration', e.target.value)}
                placeholder="0 = no limit"
              />
              <p className="text-xs text-gray-400 mt-1">Set to 0 for no time limit</p>
            </div>
            <div>
              <label className="label">Passing Marks</label>
              <input
                type="number"
                className="input"
                min={0}
                value={form.passingMarks}
                onChange={e => set('passingMarks', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">When Time Runs Out</label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${form.endingMode === 'immediate' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" className="mt-0.5" checked={form.endingMode === 'immediate'} onChange={() => set('endingMode', 'immediate')} />
                <div>
                  <p className="font-medium text-sm text-gray-900">Auto Submit</p>
                  <p className="text-xs text-gray-500 mt-0.5">Test ends immediately and is automatically submitted when time runs out.</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${form.endingMode === 'negative' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" className="mt-0.5" checked={form.endingMode === 'negative'} onChange={() => set('endingMode', 'negative')} />
                <div>
                  <p className="font-medium text-sm text-gray-900">Overtime</p>
                  <p className="text-xs text-gray-500 mt-0.5">Timer goes negative. Student can still answer and submit manually.</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 justify-end">
          <Link href="/admin/tests" className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Test & Add Sections'}
          </button>
        </div>
      </form>
    </div>
  )
}
