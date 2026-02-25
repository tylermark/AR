'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
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
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-teal-400 font-mono uppercase tracking-widest mb-8 text-center">
          Log In
        </h1>
        <form onSubmit={handleSubmit} className="bg-steel-900 border border-steel-700 rounded-sm p-6 space-y-4">
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-arfab-black border border-steel-700 text-steel-100 font-mono text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-teal-500 transition-colors" />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-arfab-black border border-steel-700 text-steel-100 font-mono text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-teal-500 transition-colors" />
          </div>
          {error && <p className="text-red-400 font-mono text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-black font-mono font-bold uppercase tracking-widest text-sm py-3 rounded-sm transition-colors">
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <p className="text-steel-500 font-mono text-xs text-center mt-6">
          No account?{' '}
          <Link href="/signup" className="text-teal-400 hover:text-teal-300">Sign up</Link>
        </p>
      </div>
    </main>
  )
}
