import Link from 'next/link'

export default function BillingSuccessPage() {
  return (
    <main className="flex items-center justify-center px-4 py-20">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-teal-400 font-mono uppercase tracking-widest mb-4">
          You&apos;re on Pro!
        </h1>
        <p className="text-steel-400 font-mono text-sm mb-8">
          Your subscription is active. Start uploading models.
        </p>
        <Link
          href="/dashboard"
          className="bg-teal-500 hover:bg-teal-400 text-black font-mono font-bold
                     uppercase tracking-widest text-sm px-8 py-3 rounded-sm transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  )
}
