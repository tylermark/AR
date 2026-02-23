# ARFab Phase 1 — SaaS Auth + Multi-Tenant + Billing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add company accounts, email/password auth, and Stripe subscription billing to ARFab so it operates as a multi-tenant SaaS product.

**Architecture:** Supabase Auth handles authentication. A `companies` table and `profiles` table provide multi-tenancy — all models are scoped to a company via RLS. Stripe Checkout handles plan selection and billing, with webhooks updating the company's plan in Supabase.

**Tech Stack:** Next.js 14 App Router, Supabase Auth, Supabase RLS, Stripe, @supabase/ssr (for server-side auth), TypeScript, Tailwind CSS.

---

## Context

### Existing files to know about
- `src/lib/supabase.ts` — anon + service role Supabase clients (no auth yet)
- `src/app/api/upload/route.ts` — upload API (needs company_id scoping)
- `src/app/api/models/route.ts` — models list API (needs company_id scoping)
- `src/app/dashboard/page.tsx` — dashboard (needs auth guard)
- `src/app/page.tsx` — upload page (needs auth guard)
- `src/types/model.ts` — Model type (needs company_id)
- Supabase project ID: `kzjewwdhynwknlqymsxv`

### Environment variables needed
```
NEXT_PUBLIC_SUPABASE_URL=https://kzjewwdhynwknlqymsxv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
STRIPE_SECRET_KEY=sk_live_... (from Stripe dashboard)
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe webhook settings)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRO_PRICE_ID=price_... (create in Stripe dashboard)
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install packages**
```bash
cd C:\Users\tyler\desktop\arfab\arfab
npm install @supabase/ssr stripe @stripe/stripe-js
```

**Step 2: Verify**
```bash
node -e "require('@supabase/ssr'); require('stripe'); console.log('ok')"
```
Expected: `ok`

**Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "feat: install @supabase/ssr, stripe, @stripe/stripe-js"
```

---

## Task 2: Database migrations — companies, profiles, RLS

**Files:**
- No code files — apply migrations via Supabase MCP

Apply this migration to project `kzjewwdhynwknlqymsxv`:

```sql
-- Companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add company_id to models
ALTER TABLE public.models ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Companies: users can read/update their own company
CREATE POLICY "users can read own company" ON public.companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "users can update own company" ON public.companies
  FOR UPDATE USING (
    id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Profiles: users can read/update their own profile
CREATE POLICY "users can read own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Models: scoped to company
DROP POLICY IF EXISTS "Allow public read" ON public.models;
DROP POLICY IF EXISTS "Allow public insert" ON public.models;

CREATE POLICY "company members can read models" ON public.models
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "company members can insert models" ON public.models
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Service role bypass (for API routes using service role key)
CREATE POLICY "service role full access companies" ON public.companies
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role full access profiles" ON public.profiles
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service role full access models" ON public.models
  FOR ALL USING (auth.role() = 'service_role');
```

**Step 1: Apply migration via Supabase MCP tool**
Name: `add_companies_profiles_rls`

**Step 2: Verify tables exist**
Run SQL: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
Expected: `companies`, `profiles`, `models` all listed

**Step 3: Commit note**
```bash
git commit --allow-empty -m "feat: add companies/profiles tables and RLS policies (migration applied)"
```

---

## Task 3: Update Supabase client helpers for SSR auth

**Files:**
- Modify: `src/lib/supabase.ts`
- Create: `src/lib/supabase-server.ts`
- Create: `src/middleware.ts`

**Step 1: Update `src/lib/supabase.ts`**

Replace entire file with:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Keep service role client for API routes
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServerSupabaseClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

**Step 2: Create `src/lib/supabase-server.ts`**
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Can be called from Server Component — ignore
          }
        },
      },
    }
  )
}
```

**Step 3: Create `src/middleware.ts`**
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect dashboard and upload pages
  const protectedPaths = ['/dashboard', '/']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname === p)

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect logged-in users away from login/signup
  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|model).*)'],
}
```

**Step 4: TypeScript check**
```bash
cd C:\Users\tyler\desktop\arfab\arfab && npx tsc --noEmit 2>&1
```
Fix any errors in the new files.

**Step 5: Commit**
```bash
git add src/lib/supabase.ts src/lib/supabase-server.ts src/middleware.ts
git commit -m "feat: add SSR Supabase clients and auth middleware"
```

---

## Task 4: Update types

**Files:**
- Modify: `src/types/model.ts`

**Step 1: Add company_id to Model type**

Add `company_id?: string` to the Model interface:
```typescript
export interface Annotation {
  id: string
  label: string
  position: { x: number; y: number; z: number }
  metadata: Record<string, string>
}

export interface Model {
  id: string
  name: string
  file_url: string
  created_at: string
  annotations: Annotation[]
  company_id?: string
}

export interface UploadResponse {
  id: string
  name: string
  file_url: string
  created_at: string
  annotations: Annotation[]
  ifcEnriched?: number
  glbOnly?: number
}

export interface Company {
  id: string
  name: string
  plan: 'free' | 'pro' | 'enterprise'
  subscription_status: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  created_at: string
}

export interface Profile {
  id: string
  company_id: string
  full_name?: string
  created_at: string
}
```

**Step 2: Commit**
```bash
git add src/types/model.ts
git commit -m "feat: add Company and Profile types, company_id to Model"
```

---

## Task 5: Signup page

**Files:**
- Create: `src/app/signup/page.tsx`

**Step 1: Create the page**
```tsx
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

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (authError) throw authError
      if (!authData.user) throw new Error('Signup failed')

      // 2. Create company + profile via API route (uses service role)
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authData.user.id,
          fullName,
          companyName,
        }),
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
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100
                         font-mono text-sm px-3 py-2 rounded-sm focus:outline-none
                         focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100
                         font-mono text-sm px-3 py-2 rounded-sm focus:outline-none
                         focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100
                         font-mono text-sm px-3 py-2 rounded-sm focus:outline-none
                         focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-steel-900 border border-steel-700 text-steel-100
                         font-mono text-sm px-3 py-2 rounded-sm focus:outline-none
                         focus:border-amber-500"
            />
          </div>
          {error && (
            <p className="text-red-400 font-mono text-xs">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50
                       text-black font-mono font-bold uppercase tracking-widest
                       text-sm py-3 rounded-sm transition-colors"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p className="text-steel-500 font-mono text-xs text-center mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-amber-400 hover:text-amber-300">
            Log in
          </Link>
        </p>
      </div>
    </main>
  )
}
```

**Step 2: Create `src/app/api/auth/signup/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { userId, fullName, companyName } = await req.json()
    if (!userId || !companyName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyName })
      .select()
      .single()
    if (companyError) throw companyError

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: userId, company_id: company.id, full_name: fullName })
    if (profileError) throw profileError

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 3: TypeScript check**
```bash
npx tsc --noEmit 2>&1
```

**Step 4: Commit**
```bash
git add src/app/signup/page.tsx src/app/api/auth/signup/route.ts
git commit -m "feat: add signup page and API route"
```

---

## Task 6: Login page

**Files:**
- Create: `src/app/login/page.tsx`

**Step 1: Create the page**
```tsx
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
    <main className="min-h-screen bg-arfab-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-amber-400 font-mono uppercase tracking-widest mb-8 text-center">
          Log In
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100
                         font-mono text-sm px-3 py-2 rounded-sm focus:outline-none
                         focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-steel-400 font-mono text-xs uppercase tracking-widest mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-steel-900 border border-steel-700 text-steel-100
                         font-mono text-sm px-3 py-2 rounded-sm focus:outline-none
                         focus:border-amber-500"
            />
          </div>
          {error && (
            <p className="text-red-400 font-mono text-xs">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50
                       text-black font-mono font-bold uppercase tracking-widest
                       text-sm py-3 rounded-sm transition-colors"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <p className="text-steel-500 font-mono text-xs text-center mt-6">
          No account?{' '}
          <Link href="/signup" className="text-amber-400 hover:text-amber-300">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  )
}
```

**Step 2: Commit**
```bash
git add src/app/login/page.tsx
git commit -m "feat: add login page"
```

---

## Task 7: Update API routes to scope by company

**Files:**
- Modify: `src/app/api/upload/route.ts`
- Modify: `src/app/api/models/route.ts`

**Step 1: Update `src/app/api/models/route.ts`**

The models route must read the current user from the auth session and filter by their company_id. Replace with:

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    // Get current user
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's company_id
    const serviceClient = createServerSupabaseClient()
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    if (!profile?.company_id) {
      return NextResponse.json([], { status: 200 })
    }

    const { data, error } = await serviceClient
      .from('models')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 2: Update `src/app/api/upload/route.ts`**

Add company_id to the insert. Find the section where the model is inserted into the database (look for `.from('models').insert(`) and add `company_id`:

First, get the user's company_id at the top of the POST handler:
```typescript
// Add after: export async function POST(req: NextRequest) {
const authClient = await createSupabaseServerClient()
const { data: { user } } = await authClient.auth.getUser()
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const serviceClient = createServerSupabaseClient()
const { data: profile } = await serviceClient
  .from('profiles')
  .select('company_id')
  .eq('id', user.id)
  .single()
const companyId = profile?.company_id
```

Then add `company_id: companyId` to the models insert.

Also add this import at the top:
```typescript
import { createSupabaseServerClient } from '@/lib/supabase-server'
```

**Step 3: TypeScript check**
```bash
npx tsc --noEmit 2>&1
```

**Step 4: Commit**
```bash
git add src/app/api/models/route.ts src/app/api/upload/route.ts
git commit -m "feat: scope models API to authenticated company"
```

---

## Task 8: Add logout to dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Step 1: Add logout button**

Add this import at the top:
```tsx
import { createClient } from '@/lib/supabase'
```

Add a logout handler inside the component:
```tsx
async function handleLogout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
}
```

Add a logout button in the header next to the "+ Upload Model" link:
```tsx
<button
  onClick={handleLogout}
  className="text-steel-400 hover:text-red-400 font-mono text-xs uppercase
             tracking-widest transition-colors border border-steel-700
             hover:border-red-800 px-3 py-2 rounded-sm"
>
  Log Out
</button>
```

**Step 2: Commit**
```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add logout to dashboard"
```

---

## Task 9: Pricing page

**Files:**
- Create: `src/app/pricing/page.tsx`

**Step 1: Create the page**
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['Up to 5 models', 'AR viewer', 'QR code generation', 'Web upload only'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$99',
    period: '/month',
    features: ['Unlimited models', 'AR viewer', 'QR code generation', 'Revit plugin access', 'IFC metadata extraction', 'Priority support'],
    cta: 'Subscribe — $99/mo',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    features: ['Everything in Pro', 'Custom limits', 'SSO / SAML', 'Dedicated support', 'SLA guarantee'],
    cta: 'Contact Us',
    highlight: false,
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function handlePlanSelect(planId: string) {
    if (planId === 'free') {
      router.push('/dashboard')
      return
    }
    if (planId === 'enterprise') {
      window.location.href = 'mailto:hello@arfab.io?subject=Enterprise Plan'
      return
    }
    setLoading(planId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start checkout')
    } finally {
      setLoading(null)
    }
  }

  return (
    <main className="min-h-screen bg-arfab-black py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-amber-400 font-mono uppercase tracking-widest mb-3">
            Choose a Plan
          </h1>
          <p className="text-steel-400 font-mono text-sm">
            Bring AR to your shop floor. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`border rounded-sm p-6 flex flex-col gap-4 ${
                plan.highlight
                  ? 'border-amber-500 bg-steel-900'
                  : 'border-steel-700 bg-arfab-black'
              }`}
            >
              {plan.highlight && (
                <span className="text-amber-500 font-mono text-xs uppercase tracking-widest">
                  Most Popular
                </span>
              )}
              <div>
                <h2 className="text-xl font-bold text-steel-100 font-mono">{plan.name}</h2>
                <div className="mt-1">
                  <span className="text-3xl font-bold text-amber-400 font-mono">{plan.price}</span>
                  <span className="text-steel-500 font-mono text-sm">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-2 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="text-steel-300 font-mono text-xs flex items-center gap-2">
                    <span className="text-amber-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePlanSelect(plan.id)}
                disabled={loading === plan.id}
                className={`w-full font-mono font-bold uppercase tracking-widest text-sm py-3
                           rounded-sm transition-colors disabled:opacity-50 ${
                  plan.highlight
                    ? 'bg-amber-500 hover:bg-amber-400 text-black'
                    : 'bg-steel-800 hover:bg-steel-700 text-steel-100 border border-steel-600'
                }`}
              >
                {loading === plan.id ? 'Loading...' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-steel-600 font-mono text-xs mt-8">
          Already have an account?{' '}
          <Link href="/login" className="text-amber-400 hover:text-amber-300">Log in</Link>
        </p>
      </div>
    </main>
  )
}
```

**Step 2: Commit**
```bash
git add src/app/pricing/page.tsx
git commit -m "feat: add pricing page"
```

---

## Task 10: Stripe checkout API route

**Files:**
- Create: `src/app/api/stripe/checkout/route.ts`
- Create: `src/app/api/stripe/webhook/route.ts`
- Create: `src/app/billing/success/page.tsx`

**Step 1: Create `src/app/api/stripe/checkout/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createServerSupabaseClient } from '@/lib/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = createServerSupabaseClient()
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    if (!profile?.company_id) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const { data: company } = await serviceClient
      .from('companies')
      .select('stripe_customer_id, name')
      .eq('id', profile.company_id)
      .single()

    // Get or create Stripe customer
    let customerId = company?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: company?.name,
        metadata: { company_id: profile.company_id },
      })
      customerId = customer.id
      await serviceClient
        .from('companies')
        .update({ stripe_customer_id: customerId })
        .eq('id', profile.company_id)
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: { company_id: profile.company_id },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Step 2: Create `src/app/api/stripe/webhook/route.ts`**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const config = { api: { bodyParser: false } }

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.CheckoutSession
    const companyId = session.metadata?.company_id
    if (companyId) {
      await supabase
        .from('companies')
        .update({
          plan: 'pro',
          subscription_status: 'active',
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', companyId)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    await supabase
      .from('companies')
      .update({ plan: 'free', subscription_status: 'inactive' })
      .eq('stripe_subscription_id', subscription.id)
  }

  return NextResponse.json({ received: true })
}
```

**Step 3: Create `src/app/billing/success/page.tsx`**
```tsx
import Link from 'next/link'

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen bg-arfab-black flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-amber-400 font-mono uppercase tracking-widest mb-4">
          You&apos;re on Pro!
        </h1>
        <p className="text-steel-400 font-mono text-sm mb-8">
          Your subscription is active. Start uploading models.
        </p>
        <Link
          href="/dashboard"
          className="bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold
                     uppercase tracking-widest text-sm px-8 py-3 rounded-sm transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  )
}
```

**Step 4: TypeScript check**
```bash
npx tsc --noEmit 2>&1
```

**Step 5: Commit**
```bash
git add src/app/api/stripe/checkout/route.ts src/app/api/stripe/webhook/route.ts src/app/billing/success/page.tsx
git commit -m "feat: add Stripe checkout and webhook routes, billing success page"
```

---

## Task 11: Push and deploy

**Step 1: Final TypeScript check**
```bash
cd C:\Users\tyler\desktop\arfab\arfab && npx tsc --noEmit 2>&1
```

**Step 2: Push to GitHub**
```bash
git push
```

**Step 3: Add environment variables in Vercel**

Go to Vercel project → Settings → Environment Variables and add:
- `STRIPE_SECRET_KEY` — from Stripe dashboard → Developers → API keys
- `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard → Webhooks (add endpoint: `https://your-app.vercel.app/api/stripe/webhook`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — from Stripe dashboard
- `STRIPE_PRO_PRICE_ID` — create a product in Stripe ($99/month) and copy the Price ID

**Step 4: Redeploy on Vercel**

Trigger a redeploy after adding env vars.

**Step 5: Test signup flow**
1. Visit `/signup` — create account with company name
2. Visit `/pricing` — click Subscribe
3. Complete Stripe checkout (use test card `4242 4242 4242 4242`)
4. Confirm redirect to `/billing/success`
5. Visit `/dashboard` — confirm models load (empty for new account)
6. Upload a model — confirm it saves with company_id
7. Log out — confirm redirect to `/login`
8. Log back in — confirm dashboard shows same model

---

## Notes

- The `/model/[id]` route is intentionally NOT protected by middleware — anyone with the QR code link can view the model in AR (by design)
- Free plan limit (5 models) enforcement is NOT in this plan — add it in a follow-up task after billing is working
- Stripe test mode: use `4242 4242 4242 4242` as card number for all test checkouts
- After deploying, register the webhook endpoint in Stripe dashboard pointing to `https://your-app.vercel.app/api/stripe/webhook` with events: `checkout.session.completed`, `customer.subscription.deleted`
