import { NodeIO, Primitive, Node as GltfNode } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

/**
 * Minimal GLB → USDZ converter that bypasses Three.js entirely.
 * Reads the GLB via gltf-transform, generates USDA text, wraps in USDZ zip.
 *
 * Key requirements for iOS Quick Look:
 * - Everything under the defaultPrim ("Root")
 * - Materials inside the scene hierarchy (not at pseudoroot)
 * - All mesh names must be unique
 * - metersPerUnit and upAxis must be set
 * - subdivisionScheme = "none" on all meshes
 */
export async function convertGlbToUsdz(glbBuffer: Uint8Array): Promise<Uint8Array> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.readBinary(glbBuffer)

  const root = document.getRoot()
  const meshDefs: string[] = []
  const materialDefs: string[] = []
  const materialNames = new Map<string, string>()
  const usedMeshNames = new Set<string>()

  // Collect materials
  for (const material of root.listMaterials()) {
    const rawName = material.getName() || `Material_${materialNames.size}`
    const name = safeName(rawName)
    materialNames.set(rawName, name)

    const bc = material.getBaseColorFactor()
    const r = bc[0].toFixed(4)
    const g = bc[1].toFixed(4)
    const b = bc[2].toFixed(4)
    const metallic = material.getMetallicFactor().toFixed(4)
    const roughness = material.getRoughnessFactor().toFixed(4)
    const opacity = bc[3].toFixed(4)

    materialDefs.push(`
        def Material "${name}"
        {
            token outputs:surface.connect = </Root/Materials/${name}/PBRShader.outputs:surface>

            def Shader "PBRShader"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (${r}, ${g}, ${b})
                float inputs:metallic = ${metallic}
                float inputs:roughness = ${roughness}
                float inputs:opacity = ${opacity}
                token outputs:surface
            }
        }`)
  }

  // If no materials, create a default
  if (materialDefs.length === 0) {
    materialDefs.push(`
        def Material "DefaultMaterial"
        {
            token outputs:surface.connect = </Root/Materials/DefaultMaterial/PBRShader.outputs:surface>

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

  // Recursively traverse nodes to accumulate world transforms
  function getWorldTransform(node: GltfNode): { t: number[], r: number[], s: number[] } {
    const t = node.getTranslation().slice() as number[]
    const r = node.getRotation().slice() as number[]
    const s = node.getScale().slice() as number[]

    // Walk up to parent and combine transforms
    const parent = node.getParentNode()
    if (parent) {
      const parentWorld = getWorldTransform(parent)
      // Apply parent scale to child translation
      t[0] = parentWorld.t[0] + t[0] * parentWorld.s[0]
      t[1] = parentWorld.t[1] + t[1] * parentWorld.s[1]
      t[2] = parentWorld.t[2] + t[2] * parentWorld.s[2]
      // Multiply scales
      s[0] *= parentWorld.s[0]
      s[1] *= parentWorld.s[1]
      s[2] *= parentWorld.s[2]
      // For rotation, use parent rotation if child has identity rotation
      if (r[0] === 0 && r[1] === 0 && r[2] === 0 && r[3] === 1) {
        r[0] = parentWorld.r[0]
        r[1] = parentWorld.r[1]
        r[2] = parentWorld.r[2]
        r[3] = parentWorld.r[3]
      } else if (parentWorld.r[0] !== 0 || parentWorld.r[1] !== 0 || parentWorld.r[2] !== 0 || parentWorld.r[3] !== 1) {
        // Multiply quaternions: parent * child
        const px = parentWorld.r[0], py = parentWorld.r[1], pz = parentWorld.r[2], pw = parentWorld.r[3]
        const cx = r[0], cy = r[1], cz = r[2], cw = r[3]
        r[3] = pw * cw - px * cx - py * cy - pz * cz
        r[0] = pw * cx + px * cw + py * cz - pz * cy
        r[1] = pw * cy - px * cz + py * cw + pz * cx
        r[2] = pw * cz + px * cy - py * cx + pz * cw
      }
    }
    return { t, r, s }
  }

  // Generate a unique mesh name
  function getUniqueMeshName(node: GltfNode, mesh: { getName(): string }): string {
    let base = safeName(node.getName() || mesh.getName() || 'Mesh')
    let name = base
    let counter = 1
    while (usedMeshNames.has(name)) {
      name = `${base}_${counter}`
      counter++
    }
    usedMeshNames.add(name)
    return name
  }

  // Collect meshes from all nodes (traverse full hierarchy)
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue

    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue

      const posAccessor = prim.getAttribute('POSITION')
      if (!posAccessor || posAccessor.getCount() === 0) continue

      const count = posAccessor.getCount()
      const meshName = getUniqueMeshName(node, mesh)

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

      // Material binding — path is now under /Root/Materials/
      const material = prim.getMaterial()
      let materialBinding = 'DefaultMaterial'
      if (material) {
        const rawName = material.getName() || ''
        materialBinding = materialNames.get(rawName) || 'DefaultMaterial'
      }

      // Apply world transform (accumulated from parent hierarchy)
      const world = getWorldTransform(node)
      const t = world.t
      const r = world.r
      const s = world.s

      let xformOps = ''
      const hasTranslate = t[0] !== 0 || t[1] !== 0 || t[2] !== 0
      const hasRotate = r[0] !== 0 || r[1] !== 0 || r[2] !== 0 || r[3] !== 1
      const hasScale = s[0] !== 1 || s[1] !== 1 || s[2] !== 1

      if (hasTranslate || hasRotate || hasScale) {
        const ops: string[] = []
        if (hasTranslate) {
          ops.push(`            double3 xformOp:translate = (${t[0]}, ${t[1]}, ${t[2]})`)
        }
        if (hasRotate) {
          ops.push(`            quatf xformOp:orient = (${r[3]}, ${r[0]}, ${r[1]}, ${r[2]})`)
        }
        if (hasScale) {
          ops.push(`            float3 xformOp:scale = (${s[0]}, ${s[1]}, ${s[2]})`)
        }
        const opNames = []
        if (hasTranslate) opNames.push('"xformOp:translate"')
        if (hasRotate) opNames.push('"xformOp:orient"')
        if (hasScale) opNames.push('"xformOp:scale"')
        xformOps = ops.join('\n') + `\n            uniform token[] xformOpOrder = [${opNames.join(', ')}]`
      }

      meshDefs.push(`
        def Xform "${meshName}" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {
${xformOps}
            rel material:binding = </Root/Materials/${materialBinding}>

            def Mesh "${meshName}_mesh"
            {
                uniform token subdivisionScheme = "none"
                int[] faceVertexCounts = [${faceVertexCounts}]
                int[] faceVertexIndices = [${faceVertexIndices}]
                point3f[] points = [${positions.join(', ')}]${normals.length > 0 ? `\n                normal3f[] normals = [${normals.join(', ')}]` : ''}${uvs.length > 0 ? `\n                texCoord2f[] primvars:st = [${uvs.join(', ')}] (\n                    interpolation = "vertex"\n                )` : ''}
            }
        }`)
    }
  }

  // Everything inside Root (the defaultPrim) — materials in a Materials scope
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

    def Scope "Materials"
    {${materialDefs.join('\n')}
    }
}
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
