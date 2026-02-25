import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { convertGlbToUsdz } from '@/lib/glb-to-usdz'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  try {
    const glbResponse = await fetch(model.file_url)
    if (!glbResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch GLB' }, { status: 502 })
    }

    const glbBuffer = new Uint8Array(await glbResponse.arrayBuffer())
    const usdzBuffer = await convertGlbToUsdz(glbBuffer)

    return new NextResponse(Buffer.from(usdzBuffer) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'model/vnd.usdz+zip',
        'Content-Length': String(usdzBuffer.byteLength),
        'Content-Disposition': `inline; filename="${params.id}.usdz"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('USDZ conversion error:', err)
    return NextResponse.json({ error: 'USDZ conversion failed' }, { status: 500 })
  }
}
