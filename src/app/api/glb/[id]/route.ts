import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const supabase = createServerSupabaseClient()

  const { data: model, error } = await supabase
    .from('models')
    .select('file_url')
    .eq('id', params.id)
    .single()

  if (error || !model) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 })
  }

  const glbResponse = await fetch(model.file_url)
  if (!glbResponse.ok) {
    return NextResponse.json({ error: 'Failed to fetch GLB' }, { status: 502 })
  }

  const glbBuffer = await glbResponse.arrayBuffer()

  return new NextResponse(glbBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Content-Disposition': 'inline; filename="model.glb"',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
