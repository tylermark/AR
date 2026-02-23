'use strict';

/**
 * parse-test-glb.js
 * GLB inspection script for ARFab project.
 * Parses the binary GLB format, extracts the JSON chunk, and reports
 * node-level details including extras, translations, and matrices.
 * Generates a preview of auto-annotations from nodes with name + extras.
 *
 * Usage: node scripts/parse-test-glb.js
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const GLB_PATH = 'C:/Users/tyler/Downloads/Project1-3DView-{3D}.glb';
const EXTRAS_KEY_PREVIEW_LIMIT = 10;

// ---------------------------------------------------------------------------
// Read file
// ---------------------------------------------------------------------------
console.log('='.repeat(80));
console.log('ARFab GLB Inspector');
console.log('='.repeat(80));
console.log(`File: ${GLB_PATH}`);

let buf;
try {
  buf = fs.readFileSync(GLB_PATH);
} catch (err) {
  console.error(`ERROR: Could not read file: ${err.message}`);
  process.exit(1);
}
console.log(`File size: ${buf.length.toLocaleString()} bytes (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);

// ---------------------------------------------------------------------------
// Parse GLB header (12 bytes)
// Spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
//   Bytes 0-3:  magic  (0x46546C67 = "glTF")
//   Bytes 4-7:  version (uint32 LE)
//   Bytes 8-11: total length (uint32 LE)
// ---------------------------------------------------------------------------
console.log('\n' + '-'.repeat(40));
console.log('GLB HEADER');
console.log('-'.repeat(40));

if (buf.length < 12) {
  console.error('ERROR: File too small to be a valid GLB.');
  process.exit(1);
}

const magic = buf.readUInt32LE(0);
const EXPECTED_MAGIC = 0x46546C67; // "glTF"
const version = buf.readUInt32LE(4);
const totalLength = buf.readUInt32LE(8);

console.log(`Magic:        0x${magic.toString(16).toUpperCase().padStart(8, '0')} (${magic === EXPECTED_MAGIC ? 'valid "glTF"' : 'INVALID — expected 0x46546C67'})`);
console.log(`Version:      ${version}`);
console.log(`Total length: ${totalLength.toLocaleString()} bytes`);

if (magic !== EXPECTED_MAGIC) {
  console.error('ERROR: Not a valid GLB file (bad magic number).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse first chunk (JSON)
// Bytes 12-15: chunk 0 length (uint32 LE)
// Bytes 16-19: chunk 0 type  (uint32 LE) — 0x4E4F534A = "JSON"
// Bytes 20 .. (20 + chunkLength - 1): chunk 0 data
// ---------------------------------------------------------------------------
console.log('\n' + '-'.repeat(40));
console.log('CHUNK 0 (JSON)');
console.log('-'.repeat(40));

const JSON_CHUNK_TYPE = 0x4E4F534A; // "JSON"
const chunk0Length = buf.readUInt32LE(12);
const chunk0Type   = buf.readUInt32LE(16);

console.log(`Chunk length: ${chunk0Length.toLocaleString()} bytes`);
console.log(`Chunk type:   0x${chunk0Type.toString(16).toUpperCase().padStart(8, '0')} (${chunk0Type === JSON_CHUNK_TYPE ? 'valid JSON chunk' : 'UNEXPECTED — expected 0x4E4F534A'})`);

if (chunk0Type !== JSON_CHUNK_TYPE) {
  console.error('ERROR: First chunk is not a JSON chunk.');
  process.exit(1);
}

const jsonStart = 20;
const jsonEnd   = jsonStart + chunk0Length;

if (jsonEnd > buf.length) {
  console.error(`ERROR: JSON chunk claims length ${chunk0Length} but file is only ${buf.length} bytes.`);
  process.exit(1);
}

const jsonStr = buf.slice(jsonStart, jsonEnd).toString('utf8').replace(/\0+$/, ''); // strip null padding

let gltf;
try {
  gltf = JSON.parse(jsonStr);
} catch (err) {
  console.error(`ERROR: Failed to parse JSON chunk: ${err.message}`);
  process.exit(1);
}

console.log('JSON chunk parsed successfully.');

// ---------------------------------------------------------------------------
// High-level structure summary
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('HIGH-LEVEL GLTF STRUCTURE');
console.log('='.repeat(80));

const asset     = gltf.asset     || {};
const scenes    = gltf.scenes    || [];
const nodes     = gltf.nodes     || [];
const meshes    = gltf.meshes    || [];
const materials = gltf.materials || [];
const textures  = gltf.textures  || [];
const images    = gltf.images    || [];
const buffers   = gltf.buffers   || [];
const bufferViews = gltf.bufferViews || [];
const accessors = gltf.accessors || [];
const animations = gltf.animations || [];
const skins     = gltf.skins     || [];
const cameras   = gltf.cameras   || [];
const extensions = gltf.extensions || {};
const extensionsUsed = gltf.extensionsUsed || [];
const extensionsRequired = gltf.extensionsRequired || [];

console.log('\nAsset info:');
console.log(`  generator:  ${asset.generator || '(none)'}`);
console.log(`  version:    ${asset.version   || '(none)'}`);
console.log(`  minVersion: ${asset.minVersion || '(none)'}`);
if (asset.copyright) console.log(`  copyright:  ${asset.copyright}`);
if (asset.extras) console.log(`  extras:     ${JSON.stringify(asset.extras)}`);

console.log('\nTop-level counts:');
console.log(`  scenes:       ${scenes.length}`);
console.log(`  nodes:        ${nodes.length}`);
console.log(`  meshes:       ${meshes.length}`);
console.log(`  materials:    ${materials.length}`);
console.log(`  textures:     ${textures.length}`);
console.log(`  images:       ${images.length}`);
console.log(`  buffers:      ${buffers.length}`);
console.log(`  bufferViews:  ${bufferViews.length}`);
console.log(`  accessors:    ${accessors.length}`);
console.log(`  animations:   ${animations.length}`);
console.log(`  skins:        ${skins.length}`);
console.log(`  cameras:      ${cameras.length}`);

if (extensionsUsed.length > 0) {
  console.log(`\nExtensions used:     ${extensionsUsed.join(', ')}`);
}
if (extensionsRequired.length > 0) {
  console.log(`Extensions required: ${extensionsRequired.join(', ')}`);
}

if (gltf.scene !== undefined) {
  const defaultScene = scenes[gltf.scene];
  console.log(`\nDefault scene index: ${gltf.scene}`);
  if (defaultScene) {
    console.log(`  Scene name:        ${defaultScene.name || '(unnamed)'}`);
    console.log(`  Root nodes:        ${(defaultScene.nodes || []).join(', ') || '(none)'}`);
  }
}

// ---------------------------------------------------------------------------
// Mesh summary
// ---------------------------------------------------------------------------
if (meshes.length > 0) {
  console.log('\n' + '-'.repeat(40));
  console.log('MESHES SUMMARY');
  console.log('-'.repeat(40));
  meshes.forEach((mesh, i) => {
    const primitiveCount = (mesh.primitives || []).length;
    console.log(`  [${i}] "${mesh.name || '(unnamed)'}" — ${primitiveCount} primitive(s)`);
  });
}

// ---------------------------------------------------------------------------
// Materials summary
// ---------------------------------------------------------------------------
if (materials.length > 0) {
  console.log('\n' + '-'.repeat(40));
  console.log('MATERIALS SUMMARY');
  console.log('-'.repeat(40));
  materials.forEach((mat, i) => {
    const pbr = mat.pbrMetallicRoughness || {};
    const baseColor = pbr.baseColorFactor
      ? `rgba(${pbr.baseColorFactor.map(v => v.toFixed(3)).join(', ')})`
      : '(default)';
    console.log(`  [${i}] "${mat.name || '(unnamed)'}" — baseColor: ${baseColor}, metallic: ${pbr.metallicFactor !== undefined ? pbr.metallicFactor : '(default)'}, roughness: ${pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : '(default)'}`);
  });
}

// ---------------------------------------------------------------------------
// Helper: pretty-print extras, truncating if too many keys
// ---------------------------------------------------------------------------
function formatExtras(extras) {
  if (extras === null || extras === undefined) return null;
  if (typeof extras !== 'object' || Array.isArray(extras)) {
    return JSON.stringify(extras);
  }
  const keys = Object.keys(extras);
  if (keys.length === 0) return '{}';

  const truncated = keys.length > EXTRAS_KEY_PREVIEW_LIMIT;
  const preview = {};
  keys.slice(0, EXTRAS_KEY_PREVIEW_LIMIT).forEach(k => { preview[k] = extras[k]; });
  let out = JSON.stringify(preview, null, 4);
  if (truncated) {
    out += `\n    ... (${keys.length - EXTRAS_KEY_PREVIEW_LIMIT} more keys; ${keys.length} total)`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helper: extract a position from a node's translation or matrix
// ---------------------------------------------------------------------------
function extractPosition(node) {
  if (node.translation && node.translation.length >= 3) {
    return { x: node.translation[0], y: node.translation[1], z: node.translation[2] };
  }
  if (node.matrix && node.matrix.length === 16) {
    // Column-major 4x4: translation is in indices 12, 13, 14
    return { x: node.matrix[12], y: node.matrix[13], z: node.matrix[14] };
  }
  return { x: 0, y: 0, z: 0 };
}

// ---------------------------------------------------------------------------
// Node-by-node walkthrough
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log(`NODE DETAILS  (${nodes.length} total)`);
console.log('='.repeat(80));

nodes.forEach((node, i) => {
  const hasName        = node.name !== undefined && node.name !== null && node.name !== '';
  const hasExtras      = node.extras !== undefined && node.extras !== null &&
                         (typeof node.extras !== 'object' || !Array.isArray(node.extras) || node.extras.length > 0) &&
                         (typeof node.extras !== 'object' || Array.isArray(node.extras) || Object.keys(node.extras).length > 0);
  const hasTranslation = Array.isArray(node.translation) && node.translation.length >= 3;
  const hasMatrix      = Array.isArray(node.matrix) && node.matrix.length === 16;
  const hasChildren    = Array.isArray(node.children) && node.children.length > 0;
  const hasMesh        = node.mesh !== undefined;
  const hasSkin        = node.skin !== undefined;
  const hasCamera      = node.camera !== undefined;
  const hasRotation    = Array.isArray(node.rotation) && node.rotation.length >= 4;
  const hasScale       = Array.isArray(node.scale) && node.scale.length >= 3;

  console.log(`\n[Node ${i}]`);
  console.log(`  name:        ${hasName ? JSON.stringify(node.name) : '(none)'}`);
  console.log(`  mesh:        ${hasMesh ? node.mesh : '(none)'}`);
  console.log(`  children:    ${hasChildren ? node.children.join(', ') : '(none)'}`);
  console.log(`  skin:        ${hasSkin ? node.skin : '(none)'}`);
  console.log(`  camera:      ${hasCamera ? node.camera : '(none)'}`);

  if (hasTranslation) {
    console.log(`  translation: [${node.translation.map(v => v.toFixed(6)).join(', ')}]`);
  } else {
    console.log(`  translation: (none)`);
  }

  if (hasRotation) {
    console.log(`  rotation:    [${node.rotation.map(v => v.toFixed(6)).join(', ')}]`);
  }

  if (hasScale) {
    console.log(`  scale:       [${node.scale.map(v => v.toFixed(6)).join(', ')}]`);
  }

  if (hasMatrix) {
    // Print matrix in 4x4 grid for readability
    const m = node.matrix;
    console.log(`  matrix:      (column-major 4x4)`);
    console.log(`               [${m.slice(0,4).map(v=>v.toFixed(4)).join(', ')}]`);
    console.log(`               [${m.slice(4,8).map(v=>v.toFixed(4)).join(', ')}]`);
    console.log(`               [${m.slice(8,12).map(v=>v.toFixed(4)).join(', ')}]`);
    console.log(`               [${m.slice(12,16).map(v=>v.toFixed(4)).join(', ')}]`);
    console.log(`               translation from matrix: (${m[12].toFixed(4)}, ${m[13].toFixed(4)}, ${m[14].toFixed(4)})`);
  } else {
    console.log(`  matrix:      (none)`);
  }

  if (hasExtras) {
    console.log(`  extras:\n${formatExtras(node.extras).split('\n').map(l => '    ' + l).join('\n')}`);
  } else {
    console.log(`  extras:      (none)`);
  }
});

// ---------------------------------------------------------------------------
// Auto-annotation preview
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('AUTO-ANNOTATION PREVIEW');
console.log('(nodes with BOTH a name AND non-empty extras)');
console.log('='.repeat(80));

const annotations = [];
nodes.forEach((node, i) => {
  const hasName = node.name !== undefined && node.name !== null && String(node.name).trim() !== '';
  const extras = node.extras;
  const hasExtras = extras !== undefined && extras !== null &&
                    typeof extras === 'object' && !Array.isArray(extras) &&
                    Object.keys(extras).length > 0;

  if (hasName && hasExtras) {
    const pos = extractPosition(node);
    annotations.push({
      id:       `node-${i}`,
      label:    node.name,
      position: pos,
      metadata: extras,
    });
  }
});

if (annotations.length === 0) {
  console.log('\n(No nodes have both a name and non-empty extras — no annotations generated.)');
} else {
  console.log(`\nGenerated ${annotations.length} annotation(s):\n`);
  console.log(JSON.stringify(annotations, null, 2));
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('SUMMARY STATISTICS');
console.log('='.repeat(80));

let countWithName        = 0;
let countWithExtras      = 0;
let countWithBoth        = 0;
let countWithTranslation = 0;
let countWithMatrix      = 0;
let countWithMesh        = 0;
let countWithChildren    = 0;

nodes.forEach(node => {
  const hasName = node.name !== undefined && node.name !== null && String(node.name).trim() !== '';
  const extras  = node.extras;
  const hasExtras = extras !== undefined && extras !== null &&
                    typeof extras === 'object' && !Array.isArray(extras) &&
                    Object.keys(extras).length > 0;
  const hasTranslation = Array.isArray(node.translation) && node.translation.length >= 3;
  const hasMatrix      = Array.isArray(node.matrix)      && node.matrix.length === 16;

  if (hasName)        countWithName++;
  if (hasExtras)      countWithExtras++;
  if (hasName && hasExtras) countWithBoth++;
  if (hasTranslation) countWithTranslation++;
  if (hasMatrix)      countWithMatrix++;
  if (node.mesh !== undefined) countWithMesh++;
  if (Array.isArray(node.children) && node.children.length > 0) countWithChildren++;
});

console.log(`\nTotal nodes:                ${nodes.length}`);
console.log(`Nodes with name:            ${countWithName}`);
console.log(`Nodes with extras:          ${countWithExtras}`);
console.log(`Nodes with name AND extras: ${countWithBoth}  <-- annotation candidates`);
console.log(`Nodes with translation:     ${countWithTranslation}`);
console.log(`Nodes with matrix:          ${countWithMatrix}`);
console.log(`Nodes with mesh ref:        ${countWithMesh}`);
console.log(`Nodes with children:        ${countWithChildren}`);

console.log('\n' + '='.repeat(80));
console.log('Inspection complete.');
console.log('='.repeat(80));
