import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase before importing the route so the module uses the mock.
// ---------------------------------------------------------------------------
const mockStorageUpload = vi.fn()
const mockStorageGetPublicUrl = vi.fn()
const mockStorageRemove = vi.fn()
const mockDbInsert = vi.fn()

const { mockOptimizeGlbForAR } = vi.hoisted(() => ({
  mockOptimizeGlbForAR: vi.fn(),
}))
vi.mock('@/lib/glb-optimize', () => ({
  optimizeGlbForAR: mockOptimizeGlbForAR,
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'test-user-id' } },
      }),
    },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: () => ({
    storage: {
      from: () => ({
        upload: mockStorageUpload,
        getPublicUrl: mockStorageGetPublicUrl,
        remove: mockStorageRemove,
      }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { company_id: 'test-company-id' }, error: null }),
            }),
          }),
        }
      }
      // models table
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: mockDbInsert,
          }),
        }),
        update: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      }
    },
  }),
}))

vi.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }))

import { POST } from '@/app/api/upload/route'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * NextRequest in the jsdom environment loses the filename when it re-parses
 * FormData (the File ends up with name='blob'). We work around this by
 * stubbing `request.formData()` to return a controlled FormData with the
 * correct File objects.
 */
function makeRequest(fileOverride?: File | null, name?: string | null) {
  const req = new NextRequest('http://localhost/api/upload', { method: 'POST' })

  const fd = new FormData()
  if (fileOverride !== null) {
    if (fileOverride !== undefined) {
      fd.append('file', fileOverride)
    }
    // If fileOverride is undefined, no file field at all
  }
  if (name !== undefined && name !== null) {
    fd.append('name', name)
  }

  // Stub formData() to return our controlled FormData
  vi.spyOn(req, 'formData').mockResolvedValue(fd)
  return req
}

function glbFile(filename = 'model.glb') {
  return new File([new ArrayBuffer(8)], filename, { type: 'model/gltf-binary' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOptimizeGlbForAR.mockImplementation(async (buf: Uint8Array) => buf)

    // Default happy-path mock behaviour
    mockStorageUpload.mockResolvedValue({ data: { path: 'test-uuid-1234.glb' }, error: null })
    mockStorageGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://supabase.example.com/models/test-uuid-1234.glb' },
    })
    mockDbInsert.mockResolvedValue({
      data: {
        id: 'db-model-id-5678',
        name: 'My Model',
        file_url: 'https://supabase.example.com/models/test-uuid-1234.glb',
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })
  })

  // -------------------------------------------------------------------------
  // Successful upload
  // -------------------------------------------------------------------------
  it('returns 200 with model metadata on successful GLB upload', async () => {
    const res = await POST(makeRequest(glbFile('blueprint.glb'), 'My Model'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      id: 'db-model-id-5678',
      name: 'My Model',
      file_url: expect.stringContaining('test-uuid-1234.glb'),
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(mockStorageUpload).toHaveBeenCalledOnce()
    expect(mockDbInsert).toHaveBeenCalledOnce()
  })

  it('accepts .gltf files in addition to .glb', async () => {
    const res = await POST(makeRequest(glbFile('scene.gltf'), 'GLTF Model'))
    expect(res.status).toBe(200)
    expect(mockStorageUpload).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // Invalid file types
  // -------------------------------------------------------------------------
  it('returns 400 when an invalid file type (.txt) is uploaded', async () => {
    const txtFile = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const res = await POST(makeRequest(txtFile, 'Bad File'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/only .glb and .gltf/i)
    expect(mockStorageUpload).not.toHaveBeenCalled()
  })

  it('returns 400 when an image file (.jpg) is uploaded', async () => {
    const jpgFile = new File([new Uint8Array(8)], 'photo.jpg', { type: 'image/jpeg' })
    const res = await POST(makeRequest(jpgFile, 'Image Upload'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/only .glb and .gltf/i)
  })

  // -------------------------------------------------------------------------
  // Missing required fields
  // -------------------------------------------------------------------------
  it('returns 400 when no file is provided', async () => {
    // Build a FormData with only 'name', no 'file' key at all
    const req = new NextRequest('http://localhost/api/upload', { method: 'POST' })
    const fd = new FormData()
    fd.append('name', 'No File')
    vi.spyOn(req, 'formData').mockResolvedValue(fd)

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/no file provided/i)
  })

  it('returns 400 when no name is provided', async () => {
    // Build a FormData with only 'file', no 'name' key at all
    const req = new NextRequest('http://localhost/api/upload', { method: 'POST' })
    const fd = new FormData()
    fd.append('file', glbFile())
    vi.spyOn(req, 'formData').mockResolvedValue(fd)

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/model name is required/i)
  })

  it('returns 400 when name is whitespace only', async () => {
    const res = await POST(makeRequest(glbFile(), '   '))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/model name is required/i)
  })

  // -------------------------------------------------------------------------
  // Supabase storage error
  // -------------------------------------------------------------------------
  it('returns 500 when Supabase Storage upload fails', async () => {
    mockStorageUpload.mockResolvedValue({ data: null, error: { message: 'bucket not found' } })

    const res = await POST(makeRequest(glbFile(), 'Failing Model'))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/failed to upload/i)
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Supabase DB error — should clean up storage
  // -------------------------------------------------------------------------
  it('returns 500 and cleans up storage when DB insert fails', async () => {
    mockDbInsert.mockResolvedValue({ data: null, error: { message: 'duplicate key' } })

    const res = await POST(makeRequest(glbFile(), 'DB Fail Model'))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/failed to save model metadata/i)
    expect(mockStorageRemove).toHaveBeenCalledOnce()
  })

  it('passes parsed colormap to optimizeGlbForAR when colormap field is present', async () => {
    const colorJson = JSON.stringify({ Concrete: [0.5, 0.5, 0.5, 1.0] })
    const colorFile = new File([colorJson], 'colors.json', { type: 'application/json' })

    const req = new NextRequest('http://localhost/api/upload', { method: 'POST' })
    const fd = new FormData()
    fd.append('file', glbFile())
    fd.append('name', 'Model With Colors')
    fd.append('colormap', colorFile)
    vi.spyOn(req, 'formData').mockResolvedValue(fd)

    await POST(req)

    expect(mockOptimizeGlbForAR).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      { Concrete: [0.5, 0.5, 0.5, 1.0] }
    )
  })

  it('calls optimizeGlbForAR without colormap when field is absent', async () => {
    await POST(makeRequest(glbFile(), 'Model No Colors'))

    expect(mockOptimizeGlbForAR).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      undefined
    )
  })
})
