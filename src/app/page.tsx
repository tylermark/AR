import Link from 'next/link'

const steps = [
  {
    num: '01',
    title: 'Export & Upload',
    desc: 'Export your Revit model as GLB and upload it to ARFab — or use our Revit plugin for one-click export.',
  },
  {
    num: '02',
    title: 'Generate QR Code',
    desc: 'ARFab instantly generates a unique QR code linked to your 3D model with full BIM metadata.',
  },
  {
    num: '03',
    title: 'View in AR On-Site',
    desc: 'Scan the QR code on any mobile device. No app to install — AR runs directly in the browser.',
  },
]

const features = [
  {
    title: 'No App Required',
    desc: 'Works in Safari and Chrome. Your team scans a QR code and sees the model in AR instantly.',
  },
  {
    title: 'BIM Metadata in AR',
    desc: 'Component IDs, materials, and properties stay attached to the model — tap to inspect on-site.',
  },
  {
    title: 'Revit Plugin',
    desc: 'Export, upload, and place QR codes on sheets without leaving Revit. Supports 2024, 2025, and 2026.',
  },
  {
    title: 'QR Codes on Sheets',
    desc: 'Generate printable QR codes and place them directly on your Revit sheets for shop drawings.',
  },
  {
    title: 'Secure & Fast',
    desc: 'Models are stored securely in the cloud. GLB files are optimized for fast mobile AR loading.',
  },
  {
    title: 'Works Everywhere',
    desc: 'Android ARCore and iOS ARKit supported. If the device has a camera, it works.',
  },
]

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-teal-500/5 via-transparent to-transparent" />
        <div className="max-w-5xl mx-auto px-4 py-24 sm:py-32 relative">
          <div className="max-w-3xl">
            <p className="text-teal-400 font-mono text-xs uppercase tracking-[0.25em] mb-4">
              AR for Fabrication & Construction
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-mono tracking-tight text-steel-100 leading-[1.1]">
              Put your Revit models{' '}
              <span className="text-teal-400">on the shop floor</span>
            </h1>
            <p className="mt-6 text-steel-400 font-mono text-sm sm:text-base leading-relaxed max-w-2xl">
              ARFab turns your 3D models into instant AR experiences. Upload a GLB, get a QR code,
              and let your team view full-scale models on-site — no app install, no training.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/signup"
                className="bg-teal-500 hover:bg-teal-400 text-arfab-black font-mono font-bold
                           uppercase tracking-widest text-sm px-8 py-4 rounded-sm transition-colors text-center"
              >
                Get Started Free
              </Link>
              <Link
                href="/pricing"
                className="border border-steel-600 hover:border-teal-500 text-steel-300 hover:text-teal-400
                           font-mono uppercase tracking-widest text-sm px-8 py-4 rounded-sm transition-colors text-center"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-steel-800">
        <div className="max-w-5xl mx-auto px-4 py-20 sm:py-24">
          <p className="text-teal-400 font-mono text-xs uppercase tracking-[0.25em] mb-3">
            How It Works
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold font-mono text-steel-100 mb-12">
            Three steps. Zero friction.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.num} className="group">
                <div className="text-teal-500/30 font-mono font-bold text-5xl mb-4 group-hover:text-teal-500/60 transition-colors">
                  {step.num}
                </div>
                <h3 className="text-steel-100 font-mono font-bold text-lg mb-2">
                  {step.title}
                </h3>
                <p className="text-steel-400 font-mono text-sm leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-steel-800 bg-steel-900/50">
        <div className="max-w-5xl mx-auto px-4 py-20 sm:py-24">
          <p className="text-teal-400 font-mono text-xs uppercase tracking-[0.25em] mb-3">
            Features
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold font-mono text-steel-100 mb-12">
            Built for AEC teams
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="border border-steel-700 bg-arfab-black rounded-sm p-6 hover:border-teal-600 transition-colors"
              >
                <h3 className="text-teal-400 font-mono font-bold text-sm mb-2">
                  {feature.title}
                </h3>
                <p className="text-steel-400 font-mono text-xs leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-steel-800">
        <div className="max-w-5xl mx-auto px-4 py-20 sm:py-24 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold font-mono text-steel-100 mb-4">
            Ready to bring AR to your workflow?
          </h2>
          <p className="text-steel-400 font-mono text-sm mb-10 max-w-xl mx-auto">
            Free plan includes 5 models. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-teal-500 hover:bg-teal-400 text-arfab-black font-mono font-bold
                       uppercase tracking-widest text-sm px-10 py-4 rounded-sm transition-colors"
          >
            Create Free Account
          </Link>
        </div>
      </section>
    </main>
  )
}
