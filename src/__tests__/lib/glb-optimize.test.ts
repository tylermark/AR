import { describe, it, expect } from 'vitest'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { optimizeGlbForAR } from '@/lib/glb-optimize'

/**
 * Creates a minimal valid GLB with one named material set to a given color.
 */
async function makeMinimalGlb(
  materialName: string,
  color: [number, number, number, number]
): Promise<Uint8Array> {
  const doc = new Document()
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const buf = doc.createBuffer()

  const mat = doc.createMaterial(materialName).setBaseColorFactor(color)

  const posData = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const posAccessor = doc.createAccessor().setType('VEC3').setArray(posData).setBuffer(buf)

  const prim = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', posAccessor)
  const mesh = doc.createMesh('mesh').addPrimitive(prim)
  const node = doc.createNode('node').setMesh(mesh)
  doc.createScene('scene').addChild(node)

  return io.writeBinary(doc)
}

/**
 * Reads back the first material's baseColorFactor from a GLB buffer.
 */
async function readFirstMaterialColor(
  glb: Uint8Array
): Promise<[number, number, number, number]> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.readBinary(glb)
  const mat = doc.getRoot().listMaterials()[0]
  return mat.getBaseColorFactor() as [number, number, number, number]
}

describe('optimizeGlbForAR color map', () => {
  it('applies color map to matching material by name', async () => {
    const input = await makeMinimalGlb('Concrete', [1, 1, 1, 1])
    const colorMap = { Concrete: [0.5, 0.4, 0.3, 1.0] }

    const output = await optimizeGlbForAR(input, colorMap)
    const [r, g, b, a] = await readFirstMaterialColor(output)

    expect(r).toBeCloseTo(0.5, 2)
    expect(g).toBeCloseTo(0.4, 2)
    expect(b).toBeCloseTo(0.3, 2)
    expect(a).toBeCloseTo(1.0, 2)
  })

  it('applies color map with case-insensitive name matching', async () => {
    const input = await makeMinimalGlb('STEEL', [1, 1, 1, 1])
    const colorMap = { steel: [0.7, 0.7, 0.8, 1.0] }

    const output = await optimizeGlbForAR(input, colorMap)
    const [r] = await readFirstMaterialColor(output)

    expect(r).toBeCloseTo(0.7, 2)
  })

  it('leaves unmatched materials unchanged when no entry in color map', async () => {
    const input = await makeMinimalGlb('Unknown', [1, 1, 1, 1])
    const colorMap = { Concrete: [0.5, 0.5, 0.5, 1.0] }

    const output = await optimizeGlbForAR(input, colorMap)
    const [r] = await readFirstMaterialColor(output)

    // [1,1,1,1] is valid, ensurePBR won't change it; unmatched keeps original color
    expect(r).toBeCloseTo(1.0, 2)
  })

  it('is a no-op when colorMap is undefined', async () => {
    const input = await makeMinimalGlb('Mat', [0.3, 0.3, 0.3, 1.0])

    const output = await optimizeGlbForAR(input)
    const [r] = await readFirstMaterialColor(output)

    // 0.3 is valid, ensurePBR won't change it
    expect(r).toBeCloseTo(0.3, 2)
  })
})
