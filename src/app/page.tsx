'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import type { UploadResponse } from '@/types/model'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [ifcFile, setIfcFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ifcInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setError(null)
  }

  const handleIfcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    setIfcFile(selected)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a GLB or GLTF file.')
      return
    }
    if (!name.trim()) {
      setError('Please enter a model name.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setQrDataUrl(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name.trim())
      if (ifcFile) formData.append('ifc', ifcFile)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Upload failed (${res.status})`)
      }

      const data: UploadResponse = await res.json()
      setResult(data)

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
      const modelUrl = `${baseUrl}/model/${data.id}`
      const qr = await QRCode.toDataURL(modelUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#f59e0b', light: '#0a0a0a' },
      })
      setQrDataUrl(qr)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setIfcFile(null)
    setName('')
    setError(null)
    setResult(null)
    setQrDataUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (ifcInputRef.current) ifcInputRef.current.value = ''
  }

  return (
    <main className="min-h-screen bg-arfab-black py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-amber-400 tracking-widest uppercase font-mono">
            Upload Model
          </h1>
          <p className="text-steel-400 mt-2 text-sm font-mono">
            GLB / GLTF files only &mdash; AR-ready in seconds
          </p>
        </div>

        {!result ? (
          <form
            onSubmit={handleSubmit}
            className="bg-steel-900 border border-steel-700 rounded-sm p-6 space-y-5"
          >
            {/* Model Name */}
            <div>
              <label className="block text-xs font-mono text-steel-400 uppercase tracking-widest mb-2">
                Model Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Revit Facade Panel"
                className="w-full bg-arfab-black border border-steel-700 text-steel-100 placeholder-steel-600
                           font-mono text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-amber-500
                           transition-colors"
              />
            </div>

            {/* GLB File Input */}
            <div>
              <label className="block text-xs font-mono text-steel-400 uppercase tracking-widest mb-2">
                GLB / GLTF File
              </label>
              <div
                className="border border-dashed border-steel-700 rounded-sm p-6 text-center cursor-pointer
                           hover:border-amber-500 transition-colors bg-arfab-black"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <div>
                    <p className="text-amber-400 font-mono text-sm truncate">{file.name}</p>
                    <p className="text-steel-500 font-mono text-xs mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-steel-400 font-mono text-sm">Click to select file</p>
                    <p className="text-steel-600 font-mono text-xs mt-1">.glb or .gltf only</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb,.gltf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* IFC File Input */}
            <div>
              <label className="flex items-center gap-2 text-xs font-mono text-steel-400 uppercase tracking-widest mb-2">
                IFC File
                <span className="normal-case tracking-normal bg-steel-700 text-steel-400 px-2 py-0.5 rounded-sm text-xs">
                  optional
                </span>
              </label>
              <div
                className="border border-dashed border-steel-700 rounded-sm p-6 text-center cursor-pointer
                           hover:border-amber-500 transition-colors bg-arfab-black"
                onClick={() => ifcInputRef.current?.click()}
              >
                {ifcFile ? (
                  <div>
                    <p className="text-amber-400 font-mono text-sm truncate">{ifcFile.name}</p>
                    <p className="text-steel-500 font-mono text-xs mt-1">
                      {(ifcFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-steel-400 font-mono text-sm">Click to select file</p>
                    <p className="text-steel-600 font-mono text-xs mt-1">
                      Export from same Revit model &mdash; adds rich BIM metadata
                    </p>
                  </div>
                )}
                <input
                  ref={ifcInputRef}
                  type="file"
                  accept=".ifc"
                  onChange={handleIfcChange}
                  className="hidden"
                />
              </div>
            </div>

            {error && (
              <div className="border border-red-800 bg-red-950 rounded-sm px-4 py-3">
                <p className="text-red-400 font-mono text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-steel-700 disabled:text-steel-500
                         text-arfab-black font-mono font-bold uppercase tracking-widest text-sm
                         py-3 rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-arfab-black border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                'Upload & Generate QR'
              )}
            </button>
          </form>
        ) : (
          <div className="bg-steel-900 border border-steel-700 rounded-sm p-6 space-y-6">
            <div className="text-center">
              <div className="inline-block w-3 h-3 bg-amber-400 rounded-full mr-2" />
              <span className="text-amber-400 font-mono text-sm uppercase tracking-widest font-bold">
                Upload Successful
              </span>
            </div>

            <div>
              <p className="text-xs font-mono text-steel-400 uppercase tracking-widest mb-1">Model Name</p>
              <p className="text-steel-100 font-mono">{result.name}</p>
            </div>

            {/* Extraction Summary */}
            <div>
              <p className="text-xs font-mono text-steel-400 uppercase tracking-widest mb-2">
                Extracted Metadata
              </p>
              {result.annotations && result.annotations.length > 0 ? (
                <div>
                  <p className="text-steel-400 font-mono text-sm mb-2">
                    {(result.ifcEnriched ?? 0) > 0
                      ? `${result.annotations.length} annotation${result.annotations.length !== 1 ? 's' : ''} extracted — ${result.ifcEnriched} enriched with IFC metadata, ${result.glbOnly} from GLB only`
                      : `${result.annotations.length} annotation${result.annotations.length !== 1 ? 's' : ''} extracted from GLB`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.annotations.map((ann) => (
                      <span
                        key={ann.id}
                        className="text-steel-400 font-mono text-xs bg-arfab-black border border-steel-700 px-2 py-1 rounded-sm"
                      >
                        {ann.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-steel-400 font-mono text-sm">No metadata found in this model</p>
              )}
            </div>

            {qrDataUrl && (
              <div className="text-center">
                <p className="text-xs font-mono text-steel-400 uppercase tracking-widest mb-3">
                  AR QR Code
                </p>
                <div className="inline-block border-2 border-amber-500 p-2 bg-arfab-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code for AR model viewer" className="w-48 h-48" />
                </div>
                <p className="text-steel-500 font-mono text-xs mt-2">
                  Scan to view in AR
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {qrDataUrl && (
                <a
                  href={qrDataUrl}
                  download={`${result.name}-qr.png`}
                  className="w-full bg-steel-800 border border-steel-600 hover:border-amber-500 text-steel-100
                             font-mono text-sm uppercase tracking-widest py-3 rounded-sm transition-colors
                             text-center"
                >
                  Download QR Code
                </a>
              )}
              <Link
                href="/dashboard"
                className="w-full bg-amber-500 hover:bg-amber-400 text-arfab-black font-mono font-bold
                           uppercase tracking-widest text-sm py-3 rounded-sm transition-colors text-center"
              >
                View Dashboard
              </Link>
              <button
                onClick={handleReset}
                className="w-full bg-transparent border border-steel-700 hover:border-steel-500 text-steel-400
                           font-mono text-sm uppercase tracking-widest py-3 rounded-sm transition-colors"
              >
                Upload Another
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
