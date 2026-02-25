import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, metalRough } from '@gltf-transform/functions'

/**
 * Optimizes a GLB buffer for maximum compatibility with iOS Quick Look.
 * - Registers all known extensions so nothing is lost during read
 * - Converts materials to metal-rough PBR (Quick Look requirement)
 * - Deduplicates accessors/textures to reduce file size
 * - Flattens node hierarchy where possible
 * - Strips unknown/unsupported extensions
 */
export async function optimizeGlbForAR(inputBuffer: Uint8Array): Promise<Uint8Array> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

  const document = await io.readBinary(inputBuffer)

  // Convert materials to PBR metallic-roughness (required by Quick Look)
  await document.transform(
    metalRough(),
    dedup(),
    flatten(),
  )

  // Strip all extensions — Quick Look only supports core glTF 2.0
  const root = document.getRoot()
  for (const ext of root.listExtensionsUsed()) {
    ext.dispose()
  }

  return await io.writeBinary(document)
}
