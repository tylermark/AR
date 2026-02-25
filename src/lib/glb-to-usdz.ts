import { NodeIO, Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

/**
 * Minimal GLB → USDZ converter that bypasses Three.js entirely.
 * Reads the GLB via gltf-transform, generates USDA text, wraps in USDZ zip.
 */
export async function convertGlbToUsdz(glbBuffer: Uint8Array): Promise<Uint8Array> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.readBinary(glbBuffer)

  const root = document.getRoot()
  const meshDefs: string[] = []
  const materialDefs: string[] = []
  const materialNames = new Map<string, string>()

  // Collect materials
  for (const material of root.listMaterials()) {
    const name = safeName(material.getName() || `Material_${materialNames.size}`)
    materialNames.set(material.getName() || '', name)

    const bc = material.getBaseColorFactor()
    const r = bc[0].toFixed(4)
    const g = bc[1].toFixed(4)
    const b = bc[2].toFixed(4)
    const metallic = material.getMetallicFactor().toFixed(4)
    const roughness = material.getRoughnessFactor().toFixed(4)

    materialDefs.push(`
    def Material "${name}"
    {
        token outputs:surface.connect = </${name}/PBRShader.outputs:surface>

        def Shader "PBRShader"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (${r}, ${g}, ${b})
            float inputs:metallic = ${metallic}
            float inputs:roughness = ${roughness}
            float inputs:opacity = ${bc[3].toFixed(4)}
            token outputs:surface
        }
    }`)
  }

  // If no materials, create a default
  if (materialDefs.length === 0) {
    materialDefs.push(`
    def Material "DefaultMaterial"
    {
        token outputs:surface.connect = </DefaultMaterial/PBRShader.outputs:surface>

        def Shader "PBRShader"
        {
            uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (0.8, 0.8, 0.8)
            float inputs:metallic = 0.0
            float inputs:roughness = 1.0
            float inputs:opacity = 1.0
            token outputs:surface
        }
    }`)
  }

  // Collect meshes from all nodes
  let meshIndex = 0
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue

    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue

      const posAccessor = prim.getAttribute('POSITION')
      if (!posAccessor || posAccessor.getCount() === 0) continue

      const count = posAccessor.getCount()
      const meshName = safeName(node.getName() || mesh.getName() || `Mesh_${meshIndex}`)

      // Get position data
      const positions: string[] = []
      const pos = [0, 0, 0]
      for (let i = 0; i < count; i++) {
        posAccessor.getElement(i, pos)
        positions.push(`(${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}, ${pos[2].toFixed(6)})`)
      }

      // Get normal data
      const normalAccessor = prim.getAttribute('NORMAL')
      const normals: string[] = []
      if (normalAccessor) {
        const n = [0, 0, 0]
        for (let i = 0; i < normalAccessor.getCount(); i++) {
          normalAccessor.getElement(i, n)
          normals.push(`(${n[0].toFixed(6)}, ${n[1].toFixed(6)}, ${n[2].toFixed(6)})`)
        }
      }

      // Get UV data
      const uvAccessor = prim.getAttribute('TEXCOORD_0')
      const uvs: string[] = []
      if (uvAccessor) {
        const uv = [0, 0]
        for (let i = 0; i < uvAccessor.getCount(); i++) {
          uvAccessor.getElement(i, uv)
          uvs.push(`(${uv[0].toFixed(6)}, ${uv[1].toFixed(6)})`)
        }
      }

      // Get indices
      const indicesAccessor = prim.getIndices()
      let faceVertexCounts: string
      let faceVertexIndices: string

      if (indicesAccessor) {
        const idxCount = indicesAccessor.getCount()
        const triCount = Math.floor(idxCount / 3)
        faceVertexCounts = new Array(triCount).fill('3').join(', ')
        const indices: number[] = []
        for (let i = 0; i < idxCount; i++) {
          indices.push(indicesAccessor.getScalar(i))
        }
        faceVertexIndices = indices.join(', ')
      } else {
        const triCount = Math.floor(count / 3)
        faceVertexCounts = new Array(triCount).fill('3').join(', ')
        faceVertexIndices = Array.from({ length: count }, (_, i) => i).join(', ')
      }

      // Material binding
      const material = prim.getMaterial()
      let materialBinding = 'DefaultMaterial'
      if (material) {
        materialBinding = safeName(material.getName() || '') || 'DefaultMaterial'
      }

      // Apply node transform
      const t = node.getTranslation()
      const r = node.getRotation()
      const s = node.getScale()

      let xformOps = ''
      const hasTranslate = t[0] !== 0 || t[1] !== 0 || t[2] !== 0
      const hasRotate = r[0] !== 0 || r[1] !== 0 || r[2] !== 0 || r[3] !== 1
      const hasScale = s[0] !== 1 || s[1] !== 1 || s[2] !== 1

      if (hasTranslate || hasRotate || hasScale) {
        const ops: string[] = []
        if (hasTranslate) {
          ops.push(`        double3 xformOp:translate = (${t[0]}, ${t[1]}, ${t[2]})`)
        }
        if (hasRotate) {
          ops.push(`        quatf xformOp:orient = (${r[3]}, ${r[0]}, ${r[1]}, ${r[2]})`)
        }
        if (hasScale) {
          ops.push(`        float3 xformOp:scale = (${s[0]}, ${s[1]}, ${s[2]})`)
        }
        const opNames = []
        if (hasTranslate) opNames.push('"xformOp:translate"')
        if (hasRotate) opNames.push('"xformOp:orient"')
        if (hasScale) opNames.push('"xformOp:scale"')
        xformOps = ops.join('\n') + `\n        uniform token[] xformOpOrder = [${opNames.join(', ')}]`
      }

      meshDefs.push(`
    def Xform "${meshName}" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
${xformOps}
        rel material:binding = </${materialBinding}>

        def Mesh "${meshName}_mesh"
        {
            int[] faceVertexCounts = [${faceVertexCounts}]
            int[] faceVertexIndices = [${faceVertexIndices}]
            point3f[] points = [${positions.join(', ')}]${normals.length > 0 ? `\n            normal3f[] normals = [${normals.join(', ')}]` : ''}${uvs.length > 0 ? `\n            float2[] primvars:st = [${uvs.join(', ')}] (\n                interpolation = "vertex"\n            )` : ''}
        }
    }`)

      meshIndex++
    }
  }

  const usda = `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{
    def Scope "Geom"
    {${meshDefs.join('\n')}
    }
}
${materialDefs.join('\n')}
`

  return createUsdzZip(usda)
}

function safeName(name: string): string {
  // USDA identifiers: start with letter/underscore, contain letters/digits/underscore
  let safe = name.replace(/[^a-zA-Z0-9_]/g, '_')
  if (safe.length === 0) return '_unnamed'
  if (/^[0-9]/.test(safe)) safe = '_' + safe
  return safe
}

/**
 * Create a USDZ file (uncompressed zip with 64-byte alignment).
 */
function createUsdzZip(usda: string): Uint8Array {
  const encoder = new TextEncoder()
  const fileName = 'model.usda'
  const fileNameBytes = encoder.encode(fileName)
  const fileData = encoder.encode(usda)

  // Calculate padding needed for 64-byte alignment of file data
  const localHeaderSize = 30 + fileNameBytes.length
  const paddingNeeded = (64 - (localHeaderSize % 64)) % 64
  const paddedFileNameBytes = new Uint8Array(fileNameBytes.length + paddingNeeded)
  paddedFileNameBytes.set(fileNameBytes)
  // Fill padding with spaces (valid in zip extra field? Actually we pad the filename area)

  // Build zip manually
  // Local file header
  const localHeader = new ArrayBuffer(30)
  const lhView = new DataView(localHeader)
  lhView.setUint32(0, 0x04034b50, true)  // signature
  lhView.setUint16(4, 20, true)           // version needed
  lhView.setUint16(6, 0, true)            // flags
  lhView.setUint16(8, 0, true)            // compression (store)
  lhView.setUint16(10, 0, true)           // mod time
  lhView.setUint16(12, 0, true)           // mod date
  lhView.setUint32(14, crc32(fileData), true) // crc32
  lhView.setUint32(18, fileData.length, true) // compressed size
  lhView.setUint32(22, fileData.length, true) // uncompressed size
  lhView.setUint16(26, fileNameBytes.length + paddingNeeded, true) // name length (with padding)
  lhView.setUint16(28, 0, true)           // extra length

  const dataOffset = 30 + fileNameBytes.length + paddingNeeded

  // Central directory
  const centralDir = new ArrayBuffer(46)
  const cdView = new DataView(centralDir)
  cdView.setUint32(0, 0x02014b50, true)  // signature
  cdView.setUint16(4, 20, true)           // version made by
  cdView.setUint16(6, 20, true)           // version needed
  cdView.setUint16(8, 0, true)            // flags
  cdView.setUint16(10, 0, true)           // compression
  cdView.setUint16(12, 0, true)           // mod time
  cdView.setUint16(14, 0, true)           // mod date
  cdView.setUint32(16, crc32(fileData), true)
  cdView.setUint32(20, fileData.length, true)
  cdView.setUint32(24, fileData.length, true)
  cdView.setUint16(28, fileNameBytes.length, true) // name length
  cdView.setUint16(30, 0, true)           // extra length
  cdView.setUint16(32, 0, true)           // comment length
  cdView.setUint16(34, 0, true)           // disk number
  cdView.setUint16(36, 0, true)           // internal attrs
  cdView.setUint32(38, 0, true)           // external attrs
  cdView.setUint32(42, 0, true)           // local header offset

  const cdOffset = dataOffset + fileData.length
  const cdSize = 46 + fileNameBytes.length

  // End of central directory
  const eocd = new ArrayBuffer(22)
  const eocdView = new DataView(eocd)
  eocdView.setUint32(0, 0x06054b50, true)
  eocdView.setUint16(4, 0, true)          // disk number
  eocdView.setUint16(6, 0, true)          // disk with CD
  eocdView.setUint16(8, 1, true)          // entries on disk
  eocdView.setUint16(10, 1, true)         // total entries
  eocdView.setUint32(12, cdSize, true)    // CD size
  eocdView.setUint32(16, cdOffset, true)  // CD offset
  eocdView.setUint16(20, 0, true)         // comment length

  // Assemble
  const totalSize = dataOffset + fileData.length + cdSize + 22
  const result = new Uint8Array(totalSize)
  let offset = 0

  result.set(new Uint8Array(localHeader), offset); offset += 30
  result.set(paddedFileNameBytes, offset); offset += paddedFileNameBytes.length
  result.set(fileData, offset); offset += fileData.length
  result.set(new Uint8Array(centralDir), offset); offset += 46
  result.set(fileNameBytes, offset); offset += fileNameBytes.length
  result.set(new Uint8Array(eocd), offset)

  return result
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
