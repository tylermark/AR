'use client'

import { useState } from 'react'

interface IOSARButtonProps {
  modelUrl: string
}

export default function IOSARButton({ modelUrl }: IOSARButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleAR() {
    setLoading(true)
    try {
      await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')

      const loader = new GLTFLoader()
      const gltf = await new Promise<{ scene: import('three').Group }>((resolve, reject) => {
        loader.load(modelUrl, resolve, undefined, reject)
      })

      const exporter = new USDZExporter()
      const arraybuffer = await exporter.parseAsync(gltf.scene)
      const blob = new Blob([arraybuffer as BlobPart], { type: 'model/vnd.usdz+zip' })
      const url = URL.createObjectURL(blob)

      // Create an anchor with rel="ar" to trigger iOS Quick Look
      const a = document.createElement('a')
      a.href = url
      a.rel = 'ar'
      a.download = 'model.usdz'
      // Quick Look needs a child image to show the AR badge
      const img = document.createElement('img')
      a.appendChild(img)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      console.error('iOS AR export failed:', err)
      alert('Failed to open AR viewer. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleAR}
      disabled={loading}
      className="absolute bottom-6 right-6 bg-amber-500 hover:bg-amber-400
                 disabled:bg-amber-700 disabled:cursor-wait
                 text-black font-mono font-bold uppercase tracking-widest
                 text-sm px-5 py-3 rounded-sm transition-colors shadow-lg z-10"
    >
      {loading ? 'Preparing AR...' : 'View in AR'}
    </button>
  )
}
