import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()

  const { data: model, error } = await supabase
    .from('models')
    .select('file_url')
    .eq('id', params.id)
    .single()

  if (error || !model) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 })
  }

  // Fetch the GLB file
  const glbResponse = await fetch(model.file_url)
  if (!glbResponse.ok) {
    return NextResponse.json({ error: 'Failed to fetch GLB' }, { status: 502 })
  }

  const glbBuffer = await glbResponse.arrayBuffer()

  // Convert GLB to USDZ using Three.js (server-side)
  // Three.js requires some globals for server-side usage
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')

  const loader = new GLTFLoader()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gltf: any = await new Promise((resolve, reject) => {
    loader.parse(glbBuffer, '', resolve, reject)
  })

  const exporter = new USDZExporter()
  const usdzData = await exporter.parseAsync(gltf.scene)

  return new NextResponse(usdzData as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'model/vnd.usdz+zip',
      'Content-Disposition': 'inline; filename="model.usdz"',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
