import { Document, NodeIO, Primitive } from '@gltf-transform/core'
import type { Transform } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, metalRough, prune, normals, weld } from '@gltf-transform/functions'

/**
 * Strip all extras (FBX metadata) that confuse iOS Quick Look.
 */
function cleanExtras(): Transform {
  return (document: Document) => {
    document.getRoot().setExtras({})
    for (const scene of document.getRoot().listScenes()) scene.setExtras({})
    for (const material of document.getRoot().listMaterials()) material.setExtras({})
    for (const node of document.getRoot().listNodes()) node.setExtras({})
    for (const mesh of document.getRoot().listMeshes()) mesh.setExtras({})
    for (const accessor of document.getRoot().listAccessors()) accessor.setExtras({})
    for (const buffer of document.getRoot().listBuffers()) buffer.setExtras({})
  }
}

/**
 * Ensure all meshes use TRIANGLES mode (4). iOS Quick Look only supports triangles.
 */
function forceTriangles(): Transform {
  return (document: Document) => {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== Primitive.Mode.TRIANGLES) {
          prim.setMode(Primitive.Mode.TRIANGLES)
        }
      }
    }
  }
}

/**
 * Generate TEXCOORD_0 for any primitive missing UVs.
 * Three.js USDZExporter (used by model-viewer for iOS AR) crashes without UVs.
 */
function generateMissingUVs(): Transform {
  return (document: Document) => {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getAttribute('TEXCOORD_0')) continue

        const position = prim.getAttribute('POSITION')
        if (!position) continue

        const count = position.getCount()
        // Create a flat UV array (all zeros) — gives valid UVs without distortion
        const uvData = new Float32Array(count * 2)
        const uvAccessor = document.createAccessor()
          .setType('VEC2')
          .setArray(uvData)
        prim.setAttribute('TEXCOORD_0', uvAccessor)
      }
    }
  }
}

/**
 * Ensure every material has valid PBR values (Quick Look needs these).
 */
function ensurePBR(): Transform {
  return (document: Document) => {
    for (const material of document.getRoot().listMaterials()) {
      // Ensure base color factor exists
      const bc = material.getBaseColorFactor()
      if (!bc || bc.some((v: number) => isNaN(v))) {
        material.setBaseColorFactor([0.8, 0.8, 0.8, 1.0])
      }
      // Clamp metallic/roughness to valid range
      const metallic = material.getMetallicFactor()
      if (isNaN(metallic) || metallic < 0 || metallic > 1) {
        material.setMetallicFactor(0.0)
      }
      const roughness = material.getRoughnessFactor()
      if (isNaN(roughness) || roughness < 0 || roughness > 1) {
        material.setRoughnessFactor(1.0)
      }
    }
  }
}

/**
 * Optimizes a GLB buffer for maximum compatibility with iOS Quick Look.
 */
export async function optimizeGlbForAR(inputBuffer: Uint8Array): Promise<Uint8Array> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

  const document = await io.readBinary(inputBuffer)

  await document.transform(
    metalRough(),
    dedup(),
    flatten(),
    prune(),
    weld(),
    normals({ overwrite: false }),
    generateMissingUVs(),
    cleanExtras(),
    forceTriangles(),
    ensurePBR(),
  )

  // Strip ALL extensions — Quick Look only supports core glTF 2.0
  const root = document.getRoot()
  for (const ext of root.listExtensionsUsed()) {
    ext.dispose()
  }

  // Ensure accessor min/max are computed by gltf-transform
  for (const accessor of root.listAccessors()) {
    if (accessor.getCount() > 0) {
      // Reading min/max forces gltf-transform to compute them on write
      accessor.getMin(new Array(accessor.getElementSize()).fill(0))
      accessor.getMax(new Array(accessor.getElementSize()).fill(0))
    }
  }

  const output = await io.writeBinary(document)

  // Post-process: patch accessor min/max in the raw GLB binary (belt & suspenders)
  return patchAccessorBounds(Buffer.from(output))
}

/**
 * Parses the GLB binary, computes missing accessor min/max from the
 * binary buffer data, rewrites the JSON chunk with bounds included.
 */
function patchAccessorBounds(buf: Buffer): Uint8Array {
  const jsonChunkLen = buf.readUInt32LE(12)
  const jsonStr = buf.slice(20, 20 + jsonChunkLen).toString('utf8').replace(/\0+$/, '')
  const gltf = JSON.parse(jsonStr)

  if (!gltf.accessors || !gltf.bufferViews || !gltf.buffers) return buf

  // The binary chunk starts after GLB header (12) + JSON chunk header (8) + JSON data
  const binChunkOffset = 12 + 8 + jsonChunkLen
  const binChunkDataOffset = binChunkOffset + 8 // skip chunk header
  const binData = buf.slice(binChunkDataOffset)

  const COMPONENT_SIZES: Record<number, number> = {
    5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4
  }
  const ELEMENT_COUNTS: Record<string, number> = {
    'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16
  }

  for (const accessor of gltf.accessors) {
    if (accessor.min && accessor.max) continue
    if (accessor.count === 0) continue

    const elemCount = ELEMENT_COUNTS[accessor.type]
    if (!elemCount) continue

    const compType = accessor.componentType
    const compSize = COMPONENT_SIZES[compType]
    if (!compSize) continue

    const bv = gltf.bufferViews[accessor.bufferView]
    if (!bv) continue

    const byteOffset = (bv.byteOffset || 0) + (accessor.byteOffset || 0)
    const stride = bv.byteStride || (compSize * elemCount)

    const min = new Array(elemCount).fill(Infinity)
    const max = new Array(elemCount).fill(-Infinity)

    for (let i = 0; i < accessor.count; i++) {
      const base = byteOffset + i * stride
      for (let j = 0; j < elemCount; j++) {
        const offset = base + j * compSize
        let val: number
        if (compType === 5126) val = binData.readFloatLE(offset)
        else if (compType === 5125) val = binData.readUInt32LE(offset)
        else if (compType === 5123) val = binData.readUInt16LE(offset)
        else if (compType === 5121) val = binData.readUInt8(offset)
        else if (compType === 5122) val = binData.readInt16LE(offset)
        else if (compType === 5120) val = binData.readInt8(offset)
        else continue

        if (val < min[j]) min[j] = val
        if (val > max[j]) max[j] = val
      }
    }

    accessor.min = min
    accessor.max = max
  }

  // Rebuild GLB with patched JSON
  const newJsonStr = JSON.stringify(gltf)
  // JSON chunk must be padded to 4-byte alignment with spaces (0x20)
  const jsonPadded = newJsonStr + ' '.repeat((4 - (newJsonStr.length % 4)) % 4)
  const jsonBuf = Buffer.from(jsonPadded, 'utf8')

  // Rebuild GLB: header(12) + json chunk header(8) + json + bin chunk header(8) + bin
  const binChunkHeader = buf.slice(binChunkOffset, binChunkOffset + 8)
  const totalLen = 12 + 8 + jsonBuf.length + 8 + binData.length

  const out = Buffer.alloc(totalLen)
  // GLB header
  out.writeUInt32LE(0x46546C67, 0) // magic
  out.writeUInt32LE(2, 4)          // version
  out.writeUInt32LE(totalLen, 8)   // total length
  // JSON chunk header
  out.writeUInt32LE(jsonBuf.length, 12)
  out.writeUInt32LE(0x4E4F534A, 16) // "JSON"
  jsonBuf.copy(out, 20)
  // BIN chunk header + data
  const binOffset = 20 + jsonBuf.length
  binChunkHeader.copy(out, binOffset)
  binData.copy(out, binOffset + 8)

  return new Uint8Array(out)
}
