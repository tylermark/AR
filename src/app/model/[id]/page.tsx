'use client'

import { useState, useEffect } from 'react'
import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import type { Model, Annotation } from '@/types/model'
import dynamic from 'next/dynamic'
const ARViewer = dynamic(() => import('@/components/ARViewer'), { ssr: false })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ModelPage() {
  const params = useParams()
  const id = params?.id as string

  const [model, setModel] = useState<Model | null>(null)
  const [notFoundState, setNotFoundState] = useState(false)

  // Load model-viewer as a bundled module so it registers reliably on iOS Safari
  useEffect(() => {
    import('@google/model-viewer')
  }, [])

  useEffect(() => {
    if (!id) return
    supabase
      .from('models')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFoundState(true)
        } else {
          setModel(data as Model)
        }
      })
  }, [id])

  if (notFoundState) {
    notFound()
  }

  if (!model) {
    return (
      <main className="min-h-screen bg-arfab-black flex items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="inline-block w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-steel-400 font-mono text-sm uppercase tracking-widest">Loading model...</span>
        </div>
      </main>
    )
  }

  const annotations: Annotation[] = Array.isArray(model.annotations) ? model.annotations : []

  // Build a minimal label for the AR hotspot — just the element ID or index.
  function getShortLabel(ann: Annotation): string {
    if (ann.metadata?.revit_element_id) return `#${ann.metadata.revit_element_id}`
    // Extract element ID from bracket notation e.g. "FamilyName [424461]"
    const match = ann.label.match(/\[(\d+)\]/)
    if (match) return `#${match[1]}`
    return ann.label
  }

  return (
    <>
      <main className="min-h-screen bg-arfab-black flex flex-col">
        <div className="border-b border-steel-800 px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-steel-500 uppercase tracking-widest mb-1">
              AR Model Viewer
            </p>
            <h1 className="text-xl font-bold text-amber-400 font-mono tracking-wide">
              {model.name}
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="text-steel-400 hover:text-amber-400 font-mono text-xs uppercase tracking-widest transition-colors"
          >
            &larr; Dashboard
          </Link>
        </div>

        <div className="flex-1 relative bg-arfab-black">
          {/* @ts-expect-error model-viewer is a custom element */}
          <model-viewer
            src={model.file_url}
            alt={`3D model of ${model.name}`}
            ar
            ar-modes="webxr scene-viewer quick-look"
            camera-controls
            shadow-intensity="1"
            style={{
              width: '100%',
              height: '100%',
              minHeight: '70vh',
              backgroundColor: '#0a0a0a',
              '--progress-bar-color': '#f59e0b',
              '--progress-mask': '#0a0a0a',
            }}
          >
            <div slot="progress-bar" className="hidden" />

            {annotations.map((ann) => (
              <button
                key={ann.id}
                className="hotspot-btn"
                slot={`hotspot-${ann.id}`}
                data-position={`${ann.position.x}m ${ann.position.y}m ${ann.position.z}m`}
                data-normal="0m 1m 0m"
              >
                {getShortLabel(ann)}
              </button>
            ))}

          {/* @ts-expect-error model-viewer is a custom element */}
          </model-viewer>
          <ARViewer modelUrl={model.file_url} annotations={annotations} />
        </div>

        <div className="border-t border-steel-800 px-4 py-2">
          <p className="text-steel-600 font-mono text-xs text-center">
            Point your camera at a flat surface, then tap &ldquo;View in AR&rdquo;
          </p>
        </div>

        {annotations.length > 0 && (
          <div className="border-t border-steel-800 px-4 py-6 space-y-4">
            <p className="text-xs font-mono text-steel-500 uppercase tracking-widest">
              Component Metadata — {annotations.length} part{annotations.length !== 1 ? 's' : ''}
            </p>
            {annotations.map((ann) => (
              <div key={ann.id} className="border border-steel-800 rounded-sm bg-steel-900">
                {/* Part header */}
                <div className="px-4 py-3 border-b border-steel-800 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-amber-400 font-mono text-sm font-semibold truncate">
                    {getShortLabel(ann)}
                  </span>
                </div>
                {/* Key-value metadata */}
                {Object.keys(ann.metadata).length > 0 ? (
                  <div className="divide-y divide-steel-800">
                    {Object.entries(ann.metadata).map(([key, value]) => (
                      <div key={key} className="px-4 py-2 flex justify-between gap-4">
                        <span className="text-steel-500 font-mono text-xs uppercase tracking-wide flex-shrink-0">
                          {key.replace(/_/g, ' ')}
                        </span>
                        <span className="text-steel-100 font-mono text-xs text-right break-all">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-2 text-steel-600 font-mono text-xs">No properties</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

    </>
  )
}
