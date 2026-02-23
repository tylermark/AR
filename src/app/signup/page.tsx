'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) throw authError
      if (!authData.user) throw new Error('Signup failed')
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, companyName }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to create account')
      }
      router.push('/pricing')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-arfab-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-amber-400 font-mono uppercase tracking-widest mb-8 text-center">
          Create Account
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100 font-mono text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">Company Name</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100 font-mono text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100 font-mono text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              className="w-full bg-steel-900 border border-steel-700 text-steel-100 font-mono text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500" />
          </div>
          {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-mono font-bold uppercase tracking-widest text-sm py-3 rounded-sm transition-colors">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p className="text-steel-500 font-mono text-xs text-center mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-amber-400 hover:text-amber-300">Log in</Link>
        </p>
      </div>
    </main>
  )
}
