import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase before importing the route
// ---------------------------------------------------------------------------
const mockDbSelect = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        order: mockDbSelect,
      }),
    }),
  }),
}))

import { GET } from '@/app/api/models/route'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_MODELS = [
  {
    id: 'uuid-aaa',
    name: 'Facade Panel',
    file_url: 'https://supabase.example.com/models/aaa.glb',
    created_at: '2026-02-22T10:00:00Z',
  },
  {
    id: 'uuid-bbb',
    name: 'Roof Truss',
    file_url: 'https://supabase.example.com/models/bbb.glb',
    created_at: '2026-02-21T09:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an array of models ordered by created_at desc', async () => {
    mockDbSelect.mockResolvedValue({ data: MOCK_MODELS, error: null })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    expect(body[0]).toMatchObject({ id: 'uuid-aaa', name: 'Facade Panel' })
    expect(body[1]).toMatchObject({ id: 'uuid-bbb', name: 'Roof Truss' })
  })

  it('returns an empty array when no models exist', async () => {
    mockDbSelect.mockResolvedValue({ data: [], error: null })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([])
  })

  it('returns an empty array when Supabase returns null data', async () => {
    mockDbSelect.mockResolvedValue({ data: null, error: null })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([])
  })

  it('returns 500 when Supabase query fails', async () => {
    mockDbSelect.mockResolvedValue({ data: null, error: { message: 'connection error' } })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/failed to fetch models/i)
  })

  it('each model record contains the expected fields', async () => {
    mockDbSelect.mockResolvedValue({ data: MOCK_MODELS, error: null })

    const res = await GET()
    const body = await res.json()

    for (const model of body) {
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('name')
      expect(model).toHaveProperty('file_url')
      expect(model).toHaveProperty('created_at')
    }
  })
})
