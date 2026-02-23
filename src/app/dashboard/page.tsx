'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import type { Model } from '@/types/model'

interface ModelWithQR extends Model {
  qrDataUrl: string | null
}

export default function DashboardPage() {
  const [models, setModels] = useState<ModelWithQR[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`)
        const data: Model[] = await res.json()

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin

        const modelsWithQR = await Promise.all(
          data.map(async (model) => {
            try {
              const qrDataUrl = await QRCode.toDataURL(
                `${baseUrl}/model/${model.id}`,
                { width: 200, margin: 2, color: { dark: '#f59e0b', light: '#0a0a0a' } }
              )
              return { ...model, qrDataUrl }
            } catch {
              return { ...model, qrDataUrl: null }
            }
          })
        )

        setModels(modelsWithQR)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load models.')
      } finally {
        setLoading(false)
      }
    }

    fetchModels()
  }, [])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const handleDownloadQR = (model: ModelWithQR) => {
    if (!model.qrDataUrl) return
    const link = document.createElement('a')
    link.href = model.qrDataUrl
    link.download = `${model.name.replace(/\s+/g, '-')}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <main className="min-h-screen bg-arfab-black py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-amber-400 tracking-widest uppercase font-mono">
              Dashboard
            </h1>
            <p className="text-steel-400 mt-1 text-sm font-mono">
              {loading ? 'Loading...' : `${models.length} model${models.length !== 1 ? 's' : ''} uploaded`}
            </p>
          </div>
          <Link
            href="/"
            className="bg-amber-500 hover:bg-amber-400 text-arfab-black font-mono font-bold
                       uppercase tracking-widest text-xs px-5 py-3 rounded-sm transition-colors"
          >
            + Upload Model
          </Link>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-steel-400 font-mono text-sm">Loading models...</span>
          </div>
        )}

        {error && (
          <div className="border border-red-800 bg-red-950 rounded-sm px-4 py-3">
            <p className="text-red-400 font-mono text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && models.length === 0 && (
          <div className="text-center py-24 border border-dashed border-steel-800 rounded-sm">
            <p className="text-steel-500 font-mono text-sm mb-4">No models uploaded yet.</p>
            <Link
              href="/"
              className="text-amber-400 hover:text-amber-300 font-mono text-sm underline underline-offset-4"
            >
              Upload your first model
            </Link>
          </div>
        )}

        {!loading && !error && models.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((model) => (
              <div
                key={model.id}
                className="bg-steel-900 border border-steel-700 rounded-sm p-5 flex flex-col gap-4
                           hover:border-steel-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-amber-400 font-mono font-bold text-sm truncate">
                      {model.name}
                    </p>
                    <p className="text-steel-500 font-mono text-xs mt-1">
                      {formatDate(model.created_at)}
                    </p>
                  </div>
                  <Link
                    href={`/model/${model.id}`}
                    className="flex-shrink-0 text-steel-400 hover:text-amber-400 font-mono text-xs
                               uppercase tracking-widest transition-colors border border-steel-700
                               hover:border-amber-500 px-2 py-1 rounded-sm"
                  >
                    View AR
                  </Link>
                </div>

                {model.qrDataUrl ? (
                  <div className="flex justify-center">
                    <div className="border border-steel-700 p-2 bg-arfab-black inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={model.qrDataUrl}
                        alt={`QR code for ${model.name}`}
                        className="w-32 h-32"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <div className="border border-steel-700 w-36 h-36 flex items-center justify-center bg-arfab-black">
                      <span className="text-steel-600 font-mono text-xs">QR unavailable</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => handleDownloadQR(model)}
                  disabled={!model.qrDataUrl}
                  className="w-full bg-steel-800 border border-steel-600 hover:border-amber-500
                             disabled:opacity-40 disabled:cursor-not-allowed text-steel-100
                             font-mono text-xs uppercase tracking-widest py-2 rounded-sm
                             transition-colors"
                >
                  Download QR
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
