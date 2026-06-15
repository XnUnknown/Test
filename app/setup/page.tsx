'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ username: 'admin', displayName: 'Administrator', password: '', setupKey: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Created!</h1>
          <p className="text-gray-500 mb-2">Username: <strong>{form.username}</strong></p>
          <p className="text-gray-500 mb-6">You can now log in with your credentials.</p>
          <button onClick={() => router.push('/login')} className="btn-primary w-full">Go to Login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="card p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Initial Setup</h1>
          <p className="text-gray-500 mt-1 text-sm">Create your first admin account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Display Name</label>
            <input className="input" required value={form.displayName} onChange={e => set('displayName', e.target.value)} />
          </div>
          <div>
            <label className="label">Admin Username</label>
            <input className="input" required value={form.username} onChange={e => set('username', e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" required value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div>
            <label className="label">Setup Secret Key</label>
            <input type="password" className="input" required value={form.setupKey} onChange={e => set('setupKey', e.target.value)} placeholder="From your .env SETUP_SECRET_KEY" />
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? 'Creating...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
