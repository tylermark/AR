import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { parseIfcBuffer } from '@/lib/ifc-parser'
import { v4 as uuidv4 } from 'uuid'
import type { Annotation } from '@/types/model'

export const runtime = 'nodejs'
export const maxDuration = 60

// Next.js route segment config — allow large GLB uploads
export const fetchCache = 'default-no-store'

const GLB_MAGIC = 0x46546C67     // "glTF"
const JSON_CHUNK_TYPE = 0x4E4F534A // "JSON"

function parseGlbAnnotations(buffer: Buffer): Annotation[] {
  // Validate minimum size for GLB header
  if (buffer.length < 20) {
    throw new Error('Buffer too small to be a valid GLB file')
  }

  // Validate magic number
  const magic = buffer.readUInt32LE(0)
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB magic: 0x${magic.toString(16).toUpperCase()} (expected 0x46546C67)`)
  }

  // Read chunk 0 header
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

  // Extract and parse JSON, stripping null padding
  const jsonStr = buffer.slice(jsonStart, jsonEnd).toString('utf8').replace(/\0+$/, '')
  const gltf = JSON.parse(jsonStr)

  const nodes: Array<Record<string, unknown>> = gltf.nodes || []
  const annotations: Annotation[] = []

  nodes.forEach((node, index) => {
    const name = node.name
    if (typeof name !== 'string' || name.trim() === '') {
      return
    }

    // Determine position from translation or matrix
    let position = { x: 0, y: 0, z: 0 }
    if (Array.isArray(node.translation) && (node.translation as number[]).length >= 3) {
      const t = node.translation as number[]
      position = { x: t[0], y: t[1], z: t[2] }
    } else if (Array.isArray(node.matrix) && (node.matrix as number[]).length === 16) {
      const m = node.matrix as number[]
      position = { x: m[12], y: m[13], z: m[14] }
    }

    // Determine metadata
    let metadata: Record<string, string>
    const extras = node.extras
    const hasExtras =
      extras !== null &&
      extras !== undefined &&
      typeof extras === 'object' &&
      !Array.isArray(extras) &&
      Object.keys(extras as object).length > 0

    if (hasExtras) {
      // Convert all extras values to strings
      const rawExtras = extras as Record<string, unknown>
      metadata = {}
      for (const key of Object.keys(rawExtras)) {
        metadata[key] = String(rawExtras[key])
      }
    } else {
      // Parse name to extract Revit metadata
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

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null
    const ifcFile = formData.get('ifc') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 })
    }

    // Validate file extension
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.glb') && !fileName.endsWith('.gltf')) {
      return NextResponse.json(
        { error: 'Only .glb and .gltf files are supported' },
        { status: 400 }
      )
    }

    // Generate unique filename
    const fileExt = fileName.endsWith('.glb') ? 'glb' : 'gltf'
    const uniqueFileName = `${uuidv4()}.${fileExt}`

    // Convert file to ArrayBuffer then to Buffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Optionally parse IFC file for richer property data
    let ifcElements: ReturnType<typeof parseIfcBuffer> = []
    if (ifcFile) {
      try {
        const ifcBuffer = Buffer.from(await ifcFile.arrayBuffer())
        ifcElements = parseIfcBuffer(ifcBuffer)
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

    // Merge IFC properties into GLB annotations when a matching element ID is found
    let ifcEnriched = 0
    if (ifcElements.length > 0) {
      // Build lookup map: Revit element ID (numeric string) -> IFC properties
      // IFC element name format from Revit: "Some Name:TypeName:123456" — last segment after ":" that is all digits
      const ifcByElementId = new Map<string, Record<string, string>>()
      for (const el of ifcElements) {
        const match = el.name.match(/:(\d+)$/)
        if (match) {
          ifcByElementId.set(match[1], el.properties)
        }
      }

      annotations = annotations.map(ann => {
        // GLB annotation label format: "Family Type [123456]"
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

    // Upload file to Supabase Storage bucket 'models'
    const { error: storageError } = await serviceClient.storage
      .from('models')
      .upload(uniqueFileName, buffer, {
        contentType: file.type || 'model/gltf-binary',
        upsert: false,
      })

    if (storageError) {
      console.error('Storage upload error:', storageError)
      return NextResponse.json(
        { error: 'Failed to upload file to storage', details: storageError.message },
        { status: 500 }
      )
    }

    // Get public URL for the uploaded file
    const { data: publicUrlData } = serviceClient.storage
      .from('models')
      .getPublicUrl(uniqueFileName)

    const fileUrl = publicUrlData.publicUrl

    // Insert metadata into models table
    const { data: modelData, error: dbError } = await serviceClient
      .from('models')
      .insert({
        name: name.trim(),
        file_url: fileUrl,
        annotations,
        company_id: companyId,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      // Attempt to clean up uploaded file
      await serviceClient.storage.from('models').remove([uniqueFileName])
      return NextResponse.json(
        { error: 'Failed to save model metadata', details: dbError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      id: modelData.id,
      name: modelData.name,
      file_url: modelData.file_url,
      created_at: modelData.created_at,
      annotations: modelData.annotations ?? [],
      ifcEnriched,
      glbOnly,
    })
  } catch (error) {
    console.error('Upload route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
