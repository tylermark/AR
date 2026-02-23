'use client'

import { useRef, useState, useEffect } from 'react'
import type { Annotation } from '@/types/model'

interface ARViewerProps {
  modelUrl: string
  annotations: Annotation[]
}

export default function ARViewer({ modelUrl, annotations }: ARViewerProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [active, setActive] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      setSupported(false)
      return
    }
    navigator.xr.isSessionSupported('immersive-ar').then(setSupported)
  }, [])

  if (supported === false) return null

  return (
    <div className="relative">
      <button
        onClick={() => setActive(true)}
        className="absolute bottom-6 right-6 bg-amber-500 hover:bg-amber-400
                   text-black font-mono font-bold uppercase tracking-widest
                   text-sm px-5 py-3 rounded-sm transition-colors shadow-lg z-10"
      >
        View in AR
      </button>
      {active && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 z-50 w-full h-full"
        />
      )}
    </div>
  )
}
