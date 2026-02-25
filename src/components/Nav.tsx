'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function Nav() {
  const pathname = usePathname()
  const [user, setUser] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(!!data.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const isActive = (path: string) => pathname === path

  const linkClass = (path: string) =>
    `font-mono text-xs uppercase tracking-widest px-3 py-2 transition-colors ${
      isActive(path)
        ? 'text-teal-400'
        : 'text-steel-400 hover:text-teal-400'
    }`

  // Don't show nav on the model viewer page
  if (pathname?.startsWith('/model/')) return null

  return (
    <nav className="border-b border-steel-800 bg-arfab-black/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-teal-500 flex items-center justify-center">
            <span className="text-arfab-black font-mono font-black text-xs leading-none">AR</span>
          </div>
          <span className="text-teal-400 font-mono font-bold tracking-widest uppercase text-sm group-hover:text-teal-300 transition-colors">
            ARFab
          </span>
        </Link>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden text-steel-400 hover:text-teal-400 transition-colors p-2"
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            {menuOpen ? (
              <path d="M4 4l12 12M16 4L4 16" />
            ) : (
              <path d="M3 5h14M3 10h14M3 15h14" />
            )}
          </svg>
        </button>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-1">
          {user === null ? (
            <span className="text-steel-600 font-mono text-xs">...</span>
          ) : user ? (
            <>
              <Link href="/upload" className={linkClass('/upload')}>Upload</Link>
              <Link href="/dashboard" className={linkClass('/dashboard')}>Dashboard</Link>
              <button
                onClick={handleLogout}
                className="text-steel-400 hover:text-red-400 font-mono text-xs uppercase tracking-widest px-3 py-2 transition-colors"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link href="/pricing" className={linkClass('/pricing')}>Pricing</Link>
              <Link href="/login" className={linkClass('/login')}>Log In</Link>
              <Link
                href="/signup"
                className="ml-2 bg-teal-500 hover:bg-teal-400 text-arfab-black font-mono font-bold uppercase tracking-widest text-xs px-4 py-2 rounded-sm transition-colors"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-steel-800 px-4 py-3 space-y-1">
          {user === null ? null : user ? (
            <>
              <Link href="/upload" className={`block ${linkClass('/upload')}`} onClick={() => setMenuOpen(false)}>Upload</Link>
              <Link href="/dashboard" className={`block ${linkClass('/dashboard')}`} onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <button onClick={handleLogout} className="block w-full text-left text-steel-400 hover:text-red-400 font-mono text-xs uppercase tracking-widest px-3 py-2 transition-colors">
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link href="/pricing" className={`block ${linkClass('/pricing')}`} onClick={() => setMenuOpen(false)}>Pricing</Link>
              <Link href="/login" className={`block ${linkClass('/login')}`} onClick={() => setMenuOpen(false)}>Log In</Link>
              <Link href="/signup" className={`block ${linkClass('/signup')}`} onClick={() => setMenuOpen(false)}>Sign Up</Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
