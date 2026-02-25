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
    <main className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-teal-400 font-mono uppercase tracking-widest mb-3">
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
                plan.highlight ? 'border-teal-500 bg-steel-900' : 'border-steel-700 bg-arfab-black'
              }`}
            >
              {plan.highlight && (
                <span className="text-teal-500 font-mono text-xs uppercase tracking-widest">Most Popular</span>
              )}
              <div>
                <h2 className="text-xl font-bold text-steel-100 font-mono">{plan.name}</h2>
                <div className="mt-1">
                  <span className="text-3xl font-bold text-teal-400 font-mono">{plan.price}</span>
                  <span className="text-steel-500 font-mono text-sm">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-2 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="text-steel-300 font-mono text-xs flex items-center gap-2">
                    <span className="text-teal-500">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePlanSelect(plan.id)}
                disabled={loading === plan.id}
                className={`w-full font-mono font-bold uppercase tracking-widest text-sm py-3 rounded-sm transition-colors disabled:opacity-50 ${
                  plan.highlight
                    ? 'bg-teal-500 hover:bg-teal-400 text-black'
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
          <Link href="/login" className="text-teal-400 hover:text-teal-300">Log in</Link>
        </p>
      </div>
    </main>
  )
}
