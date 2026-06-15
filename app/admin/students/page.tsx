'use client'

import { useEffect, useState, FormEvent } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { User } from '@/lib/types'

interface CreateStudentForm {
  username: string
  displayName: string
  password: string
}

export default function StudentsPage() {
  const [students, setStudents] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateStudentForm>({ username: '', displayName: '', password: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { loadStudents() }, [])

  async function loadStudents() {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), orderBy('createdAt', 'desc')))
    setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() } as User)))
    setLoading(false)
  }

  const set = (k: keyof CreateStudentForm, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.username || !form.password || !form.displayName) return
    setError('')
    setSuccess('')
    setCreating(true)
    try {
      const res = await fetch('/api/admin/create-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`Student created! Username: ${form.username} | Password: ${form.password}`)
      setForm({ username: '', displayName: '', password: '' })
      loadStudents()
    } catch (err: any) {
      setError(err.message || 'Failed to create student')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(uid: string, username: string) {
    if (!confirm(`Delete student "${username}"?`)) return
    try {
      await fetch('/api/admin/delete-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      })
      setStudents(prev => prev.filter(s => s.uid !== uid))
    } catch {
      alert('Failed to delete student')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage student accounts</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Student
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6 max-w-xl">
          <h2 className="font-semibold text-gray-800 mb-4">Create Student Account</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" required value={form.displayName} onChange={e => set('displayName', e.target.value)} placeholder="e.g. John Doe" />
            </div>
            <div>
              <label className="label">Username</label>
              <input className="input" required value={form.username} onChange={e => set('username', e.target.value.toLowerCase().replace(/\s+/g, '_'))} placeholder="e.g. student1" />
              <p className="text-xs text-gray-400 mt-1">Student will log in with this username</p>
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" required value={form.password} onChange={e => set('password', e.target.value)} placeholder="e.g. student1@123" />
              <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            {success && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                <p className="font-medium mb-1">✓ Account Created</p>
                <p>{success}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create Account'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : students.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">👨‍🎓</div>
          <h3 className="font-semibold text-gray-700 mb-2">No students yet</h3>
          <p className="text-gray-400 text-sm">Add student accounts to get started</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Username</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Email (internal)</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Created</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {students.map(s => (
                <tr key={s.uid} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{s.displayName}</td>
                  <td className="px-5 py-3 text-gray-600">@{s.username}</td>
                  <td className="px-5 py-3 text-gray-400 font-mono text-xs">{s.email}</td>
                  <td className="px-5 py-3 text-gray-400">
                    {s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(s.uid, s.username)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
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
