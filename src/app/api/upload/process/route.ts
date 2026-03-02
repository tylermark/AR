import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { parseIfcBuffer } from '@/lib/ifc-parser'
import { optimizeGlbForAR } from '@/lib/glb-optimize'
import { v4 as uuidv4 } from 'uuid'
import type { Annotation } from '@/types/model'

export const runtime = 'nodejs'
export const maxDuration = 60

const GLB_MAGIC = 0x46546C67     // "glTF"
const JSON_CHUNK_TYPE = 0x4E4F534A // "JSON"

function parseGlbAnnotations(buffer: Buffer): Annotation[] {
  if (buffer.length < 20) {
    throw new Error('Buffer too small to be a valid GLB file')
  }

  const magic = buffer.readUInt32LE(0)
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB magic: 0x${magic.toString(16).toUpperCase()} (expected 0x46546C67)`)
  }

  const chunk0Length = buffer.readUInt32LE(12)
  const chunk0Type   = buffer.readUInt32LE(16)

  if (chunk0Type !== JSON_CHUNK_TYPE) {
    throw new Error(`First chunk is not JSON (type: 0x${chunk0Type.toString(16).toUpperCase()})`)
  }

  const jsonStart = 20
  const jsonEnd   = jsonStart + chunk0Length

  if (jsonEnd > buffer.length) {
    throw new Error(`JSON chunk length ${chunk0Length} exceeds buffer size ${buffer.length}`)
  }

  const jsonStr = buffer.slice(jsonStart, jsonEnd).toString('utf8').replace(/\0+$/, '')
  const gltf = JSON.parse(jsonStr)

  const nodes: Array<Record<string, unknown>> = gltf.nodes || []
  const annotations: Annotation[] = []

  nodes.forEach((node, index) => {
    const name = node.name
    if (typeof name !== 'string' || name.trim() === '') {
      return
    }

    let position = { x: 0, y: 0, z: 0 }
    if (Array.isArray(node.translation) && (node.translation as number[]).length >= 3) {
      const t = node.translation as number[]
      position = { x: t[0], y: t[1], z: t[2] }
    } else if (Array.isArray(node.matrix) && (node.matrix as number[]).length === 16) {
      const m = node.matrix as number[]
      position = { x: m[12], y: m[13], z: m[14] }
    }

    let metadata: Record<string, string>
    const extras = node.extras
    const hasExtras =
      extras !== null &&
      extras !== undefined &&
      typeof extras === 'object' &&
      !Array.isArray(extras) &&
      Object.keys(extras as object).length > 0

    if (hasExtras) {
      const rawExtras = extras as Record<string, unknown>
      metadata = {}
      for (const key of Object.keys(rawExtras)) {
        metadata[key] = String(rawExtras[key])
      }
    } else {
      metadata = {}
      const bracketMatch = name.match(/\[(\d+)\]/)
      if (bracketMatch) {
        metadata.revit_element_id = bracketMatch[1]
        const familyType = name.substring(0, name.lastIndexOf(' [')).trim()
        if (familyType) {
          metadata.family_type = familyType
        }
      }
    }

    annotations.push({
      id: `ann_${index}`,
      label: name,
      position,
      metadata,
    })
  })

  return annotations
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createSupabaseServerClient()
    let user = (await authClient.auth.getUser()).data.user

    // Fallback to Bearer token auth (for desktop plugin)
    if (!user) {
      const authHeader = request.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        const { data } = await supabase.auth.getUser(token)
        user = data.user
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceClient = createServerSupabaseClient()
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    const companyId = profile?.company_id
    if (!companyId) {
      return NextResponse.json({ error: 'Company profile not found' }, { status: 403 })
    }

    // Parse JSON body
    const body = await request.json()
    const {
      storagePath,
      name,
      sheetNumber,
      revision = 'A',
      ifcStoragePath,
      colorMapJson,
    } = body as {
      storagePath: string
      name: string
      sheetNumber?: string
      revision?: string
      ifcStoragePath?: string
      colorMapJson?: Record<string, number[]>
    }

    if (!storagePath) {
      return NextResponse.json({ error: 'storagePath is required' }, { status: 400 })
    }

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 })
    }

    // Security: verify storagePath belongs to the authenticated user
    if (!storagePath.startsWith(user.id + '/')) {
      return NextResponse.json({ error: 'Access denied to the specified storage path' }, { status: 403 })
    }

    if (ifcStoragePath && !ifcStoragePath.startsWith(user.id + '/')) {
      return NextResponse.json({ error: 'Access denied to the specified IFC storage path' }, { status: 403 })
    }

    // Validate file extension
    if (!storagePath.toLowerCase().endsWith('.glb')) {
      return NextResponse.json(
        { error: 'Only .glb files are supported. Convert GLTF or FBX to GLB before uploading.' },
        { status: 400 }
      )
    }

    // Fetch raw GLB from raw-uploads bucket
    const { data: glbData, error: glbFetchError } = await serviceClient.storage
      .from('raw-uploads')
      .download(storagePath)

    if (glbFetchError || !glbData) {
      console.error('Failed to fetch GLB from raw-uploads:', glbFetchError)
      return NextResponse.json(
        { error: 'Failed to fetch uploaded file', details: glbFetchError?.message },
        { status: 500 }
      )
    }

    let buffer = Buffer.from(await glbData.arrayBuffer())

    // Optimize GLB for iOS AR compatibility
    const colorMap = colorMapJson ?? undefined
    try {
      const optimized = await optimizeGlbForAR(new Uint8Array(buffer), colorMap)
      buffer = Buffer.from(optimized)
    } catch (err) {
      console.error('GLB optimization failed, using original file:', err)
    }

    // Optionally parse IFC file for richer property data
    let ifcElements: ReturnType<typeof parseIfcBuffer> = []
    if (ifcStoragePath) {
      try {
        const { data: ifcData, error: ifcFetchError } = await serviceClient.storage
          .from('raw-uploads')
          .download(ifcStoragePath)

        if (ifcFetchError || !ifcData) {
          console.error('Failed to fetch IFC from raw-uploads:', ifcFetchError)
        } else {
          const ifcBuffer = Buffer.from(await ifcData.arrayBuffer())
          ifcElements = parseIfcBuffer(ifcBuffer)
        }
      } catch (err) {
        console.error('IFC parsing failed, continuing with GLB-only annotations:', err)
      }
    }

    // Parse annotations from GLB binary
    let annotations: Annotation[] = []
    try {
      annotations = parseGlbAnnotations(buffer)
    } catch (err) {
      console.error('GLB annotation parsing failed, continuing with empty annotations:', err)
    }

    // Merge IFC properties into GLB annotations
    let ifcEnriched = 0
    if (ifcElements.length > 0) {
      const ifcByElementId = new Map<string, Record<string, string>>()
      for (const el of ifcElements) {
        const match = el.name.match(/:(\d+)$/)
        if (match) {
          ifcByElementId.set(match[1], el.properties)
        }
      }

      annotations = annotations.map(ann => {
        const bracketMatch = ann.label.match(/\[(\d+)\]/)
        if (!bracketMatch) return ann
        const elementId = bracketMatch[1]
        const ifcProps = ifcByElementId.get(elementId)
        if (!ifcProps) return ann
        ifcEnriched++
        return { ...ann, metadata: ifcProps }
      })
    }

    const glbOnly = annotations.length - ifcEnriched

    // Upload optimized GLB to models bucket
    const uniqueFileName = `${uuidv4()}.glb`

    const { error: storageError } = await serviceClient.storage
      .from('models')
      .upload(uniqueFileName, buffer, {
        contentType: 'model/gltf-binary',
        upsert: false,
      })

    if (storageError) {
      console.error('Storage upload error:', storageError)
      return NextResponse.json(
        { error: 'Failed to upload file to storage', details: storageError.message },
        { status: 500 }
      )
    }

    const { data: publicUrlData } = serviceClient.storage
      .from('models')
      .getPublicUrl(uniqueFileName)

    const fileUrl = publicUrlData.publicUrl

    const trimmedSheet = sheetNumber?.trim() || null
    let parentId: string | null = null
    if (trimmedSheet) {
      const { data: existing } = await serviceClient
        .from('models')
        .select('id, parent_id')
        .eq('company_id', companyId)
        .eq('sheet_number', trimmedSheet)
        .order('created_at', { ascending: true })
        .limit(1)
      if (existing && existing.length > 0) {
        parentId = existing[0].parent_id || existing[0].id
      }
    }

    const { data: modelData, error: dbError } = await serviceClient
      .from('models')
      .insert({
        name: name.trim(),
        file_url: fileUrl,
        annotations,
        company_id: companyId,
        sheet_number: trimmedSheet,
        revision: revision?.trim() || 'A',
        parent_id: parentId,
      })
      .select()
      .single()

    if (modelData && trimmedSheet && !parentId) {
      await serviceClient
        .from('models')
        .update({ parent_id: modelData.id })
        .eq('id', modelData.id)
      modelData.parent_id = modelData.id
    }

    if (dbError) {
      console.error('Database insert error:', dbError)
      await serviceClient.storage.from('models').remove([uniqueFileName])
      return NextResponse.json(
        { error: 'Failed to save model metadata', details: dbError.message },
        { status: 500 }
      )
    }

    // Cleanup raw files
    const pathsToCleanup = [storagePath]
    if (ifcStoragePath) {
      pathsToCleanup.push(ifcStoragePath)
    }
    try {
      await serviceClient.storage.from('raw-uploads').remove(pathsToCleanup)
    } catch (err) {
      console.error('Failed to cleanup raw-uploads, files will remain:', err)
    }

    return NextResponse.json({
      id: modelData.id,
      name: modelData.name,
      file_url: modelData.file_url,
      created_at: modelData.created_at,
      annotations: modelData.annotations ?? [],
      ifcEnriched,
      glbOnly,
      sheet_number: modelData.sheet_number,
      revision: modelData.revision,
      parent_id: modelData.parent_id,
    })
  } catch (error) {
    console.error('Upload process route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
