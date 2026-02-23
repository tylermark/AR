/**
 * Tests confirming that QR code URLs are constructed in the correct format:
 * <baseUrl>/model/<uuid>
 *
 * These are pure unit tests — no Supabase, no network, no rendering.
 */
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Mirrors the URL construction logic from src/app/page.tsx
// ---------------------------------------------------------------------------
function buildModelUrl(baseUrl: string, modelId: string): string {
  return `${baseUrl}/model/${modelId}`
}

// ---------------------------------------------------------------------------
// UUID v4 regex — used to validate model IDs
// ---------------------------------------------------------------------------
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('QR code URL format', () => {
  const VALID_UUID = 'a1b2c3d4-e5f6-4789-ab12-cd34ef567890'

  it('produces a URL in the /model/[id] format', () => {
    const url = buildModelUrl('https://arfab.example.com', VALID_UUID)
    expect(url).toBe(`https://arfab.example.com/model/${VALID_UUID}`)
  })

  it('path segment is exactly /model/<uuid>', () => {
    const url = buildModelUrl('https://arfab.example.com', VALID_UUID)
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    expect(pathParts[0]).toBe('model')
    expect(pathParts[1]).toBe(VALID_UUID)
    expect(pathParts).toHaveLength(2)
  })

  it('UUID portion matches UUID v4 pattern', () => {
    const url = buildModelUrl('https://arfab.example.com', VALID_UUID)
    const id = url.split('/model/')[1]
    expect(id).toMatch(UUID_REGEX)
  })

  it('works with a localhost base URL for local development', () => {
    const url = buildModelUrl('http://localhost:3000', VALID_UUID)
    expect(url).toBe(`http://localhost:3000/model/${VALID_UUID}`)
    expect(url).toContain('/model/')
  })

  it('does not double-slash in the path when base URL has no trailing slash', () => {
    const url = buildModelUrl('https://arfab.vercel.app', VALID_UUID)
    // Only check the pathname — the scheme (https://) legitimately contains //
    const pathname = new URL(url).pathname
    expect(pathname).not.toContain('//')
    expect(pathname).toBe(`/model/${VALID_UUID}`)
  })

  it('correctly embeds distinct UUIDs for different models', () => {
    const id1 = 'aaaaaaaa-0000-4000-8000-000000000001'
    const id2 = 'bbbbbbbb-0000-4000-8000-000000000002'
    const url1 = buildModelUrl('https://arfab.example.com', id1)
    const url2 = buildModelUrl('https://arfab.example.com', id2)
    expect(url1).not.toBe(url2)
    expect(url1).toContain(id1)
    expect(url2).toContain(id2)
  })
})
