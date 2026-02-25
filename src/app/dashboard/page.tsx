'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import type { Model } from '@/types/model'

interface ModelWithQR extends Model {
  qrDataUrl: string | null
}

interface SheetGroup {
  sheetNumber: string
  latest: ModelWithQR
  revisions: ModelWithQR[]
}

export default function DashboardPage() {
  const router = useRouter()
  const [models, setModels] = useState<ModelWithQR[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set())

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models')
        if (res.status === 401) {
          router.push('/login')
          return
        }
        if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`)
        const data: Model[] = await res.json()

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin

        const modelsWithQR = await Promise.all(
          data.map(async (model) => {
            try {
              const qrDataUrl = await QRCode.toDataURL(
                `${baseUrl}/model/${model.id}`,
                { width: 200, margin: 2, color: { dark: '#14b8a6', light: '#0a0a0a' } }
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
  }, [router])

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
    link.download = `${model.name.replace(/\s+/g, '-')}${model.sheet_number ? `-${model.sheet_number}` : ''}-qr.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const toggleSheet = (sheetNumber: string) => {
    setExpandedSheets(prev => {
      const next = new Set(prev)
      if (next.has(sheetNumber)) next.delete(sheetNumber)
      else next.add(sheetNumber)
      return next
    })
  }

  // Group models by sheet. Models without a sheet_number stay ungrouped.
  const { sheetGroups, ungrouped } = (() => {
    const groups = new Map<string, ModelWithQR[]>()
    const noSheet: ModelWithQR[] = []

    for (const m of models) {
      if (m.sheet_number && m.parent_id) {
        const key = m.parent_id
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(m)
      } else if (m.sheet_number) {
        // Has sheet but no parent_id — treat as standalone sheet group
        const key = m.id
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(m)
      } else {
        noSheet.push(m)
      }
    }

    const sheetGroups: SheetGroup[] = []
    for (const [, revisions] of Array.from(groups)) {
      // Sort newest first
      revisions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      sheetGroups.push({
        sheetNumber: revisions[0].sheet_number!,
        latest: revisions[0],
        revisions,
      })
    }
    // Sort sheet groups by sheet number
    sheetGroups.sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber))

    return { sheetGroups, ungrouped: noSheet }
  })()

  return (
    <main className="py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-teal-400 tracking-widest uppercase font-mono">
              Dashboard
            </h1>
            <p className="text-steel-400 mt-1 text-sm font-mono">
              {loading ? 'Loading...' : `${models.length} model${models.length !== 1 ? 's' : ''} uploaded`}
            </p>
          </div>
          <Link
            href="/upload"
            className="bg-teal-500 hover:bg-teal-400 text-arfab-black font-mono font-bold
                       uppercase tracking-widest text-xs px-5 py-3 rounded-sm transition-colors"
          >
            + Upload Model
          </Link>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
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
              href="/upload"
              className="text-teal-400 hover:text-teal-300 font-mono text-sm underline underline-offset-4"
            >
              Upload your first model
            </Link>
          </div>
        )}

        {!loading && !error && models.length > 0 && (
          <div className="space-y-8">
            {/* Sheet-grouped models */}
            {sheetGroups.length > 0 && (
              <div>
                <p className="text-xs font-mono text-steel-500 uppercase tracking-widest mb-4">
                  By Sheet
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sheetGroups.map((group) => {
                    const isExpanded = expandedSheets.has(group.sheetNumber)
                    return (
                      <div
                        key={group.latest.parent_id || group.latest.id}
                        className="bg-steel-900 border border-steel-700 rounded-sm flex flex-col
                                   hover:border-steel-600 transition-colors"
                      >
                        {/* Card header */}
                        <div className="p-5 flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-teal-400 font-mono font-bold text-sm">
                                  {group.sheetNumber}
                                </span>
                                <span className="text-steel-500 font-mono text-xs bg-steel-800 px-1.5 py-0.5 rounded-sm">
                                  Rev {group.latest.revision || 'A'}
                                </span>
                              </div>
                              <p className="text-steel-300 font-mono text-xs truncate">
                                {group.latest.name}
                              </p>
                              <p className="text-steel-500 font-mono text-xs mt-1">
                                {formatDate(group.latest.created_at)}
                              </p>
                            </div>
                            <Link
                              href={`/model/${group.latest.id}`}
                              className="flex-shrink-0 text-steel-400 hover:text-teal-400 font-mono text-xs
                                         uppercase tracking-widest transition-colors border border-steel-700
                                         hover:border-teal-500 px-2 py-1 rounded-sm"
                            >
                              View AR
                            </Link>
                          </div>

                          {group.latest.qrDataUrl ? (
                            <div className="flex justify-center">
                              <div className="border border-steel-700 p-2 bg-arfab-black inline-block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={group.latest.qrDataUrl}
                                  alt={`QR code for ${group.sheetNumber}`}
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
                            onClick={() => handleDownloadQR(group.latest)}
                            disabled={!group.latest.qrDataUrl}
                            className="w-full bg-steel-800 border border-steel-600 hover:border-teal-500
                                       disabled:opacity-40 disabled:cursor-not-allowed text-steel-100
                                       font-mono text-xs uppercase tracking-widest py-2 rounded-sm
                                       transition-colors"
                          >
                            Download QR
                          </button>
                        </div>

                        {/* Revision history toggle */}
                        {group.revisions.length > 1 && (
                          <div className="border-t border-steel-700">
                            <button
                              onClick={() => toggleSheet(group.sheetNumber)}
                              className="w-full px-5 py-2 flex items-center justify-between text-steel-500
                                         hover:text-steel-300 font-mono text-xs uppercase tracking-widest
                                         transition-colors"
                            >
                              <span>{group.revisions.length} revision{group.revisions.length !== 1 ? 's' : ''}</span>
                              <span>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                            </button>
                            {isExpanded && (
                              <div className="px-5 pb-4 space-y-2">
                                {group.revisions.map((rev) => (
                                  <div
                                    key={rev.id}
                                    className="flex items-center justify-between py-1.5 border-b border-steel-800 last:border-0"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-steel-400 font-mono text-xs">
                                        Rev {rev.revision || '?'}
                                      </span>
                                      <span className="text-steel-600 font-mono text-xs">
                                        {formatDate(rev.created_at)}
                                      </span>
                                    </div>
                                    <Link
                                      href={`/model/${rev.id}`}
                                      className="text-teal-400 hover:text-teal-300 font-mono text-xs transition-colors"
                                    >
                                      View
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Ungrouped models (no sheet number) */}
            {ungrouped.length > 0 && (
              <div>
                {sheetGroups.length > 0 && (
                  <p className="text-xs font-mono text-steel-500 uppercase tracking-widest mb-4">
                    Other Models
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ungrouped.map((model) => (
                    <div
                      key={model.id}
                      className="bg-steel-900 border border-steel-700 rounded-sm p-5 flex flex-col gap-4
                                 hover:border-steel-600 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-teal-400 font-mono font-bold text-sm truncate">
                            {model.name}
                          </p>
                          <p className="text-steel-500 font-mono text-xs mt-1">
                            {formatDate(model.created_at)}
                          </p>
                        </div>
                        <Link
                          href={`/model/${model.id}`}
                          className="flex-shrink-0 text-steel-400 hover:text-teal-400 font-mono text-xs
                                     uppercase tracking-widest transition-colors border border-steel-700
                                     hover:border-teal-500 px-2 py-1 rounded-sm"
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
                        className="w-full bg-steel-800 border border-steel-600 hover:border-teal-500
                                   disabled:opacity-40 disabled:cursor-not-allowed text-steel-100
                                   font-mono text-xs uppercase tracking-widest py-2 rounded-sm
                                   transition-colors"
                      >
                        Download QR
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
