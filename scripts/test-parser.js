'use strict';

/**
 * test-parser.js
 * Verifies the GLB annotation parsing logic against the real Revit-exported GLB file.
 * Mirrors the parseGlbAnnotations logic from src/app/api/upload/route.ts.
 *
 * Usage: node scripts/test-parser.js
 */

const fs = require('fs');

const GLB_PATH = 'C:/Users/tyler/Downloads/Project1-3DView-{3D}.glb';

const GLB_MAGIC      = 0x46546C67;   // "glTF"
const JSON_CHUNK_TYPE = 0x4E4F534A;  // "JSON"

// ---------------------------------------------------------------------------
// Parsing logic (mirrors route.ts parseGlbAnnotations)
// ---------------------------------------------------------------------------
function parseGlbAnnotations(buffer) {
  if (buffer.length < 20) {
    throw new Error('Buffer too small to be a valid GLB file');
  }

  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB magic: 0x${magic.toString(16).toUpperCase()} (expected 0x46546C67)`);
  }

  const chunk0Length = buffer.readUInt32LE(12);
  const chunk0Type   = buffer.readUInt32LE(16);

  if (chunk0Type !== JSON_CHUNK_TYPE) {
    throw new Error(`First chunk is not JSON (type: 0x${chunk0Type.toString(16).toUpperCase()})`);
  }

  const jsonStart = 20;
  const jsonEnd   = jsonStart + chunk0Length;

  if (jsonEnd > buffer.length) {
    throw new Error(`JSON chunk length ${chunk0Length} exceeds buffer size ${buffer.length}`);
  }

  const jsonStr = buffer.slice(jsonStart, jsonEnd).toString('utf8').replace(/\0+$/, '');
  const gltf = JSON.parse(jsonStr);

  const nodes = gltf.nodes || [];
  const annotations = [];

  nodes.forEach((node, index) => {
    const name = node.name;
    if (typeof name !== 'string' || name.trim() === '') {
      return;
    }

    // Determine position
    let position = { x: 0, y: 0, z: 0 };
    if (Array.isArray(node.translation) && node.translation.length >= 3) {
      position = { x: node.translation[0], y: node.translation[1], z: node.translation[2] };
    } else if (Array.isArray(node.matrix) && node.matrix.length === 16) {
      const m = node.matrix;
      position = { x: m[12], y: m[13], z: m[14] };
    }

    // Determine metadata
    let metadata;
    const extras = node.extras;
    const hasExtras =
      extras !== null &&
      extras !== undefined &&
      typeof extras === 'object' &&
      !Array.isArray(extras) &&
      Object.keys(extras).length > 0;

    if (hasExtras) {
      metadata = {};
      for (const key of Object.keys(extras)) {
        metadata[key] = String(extras[key]);
      }
    } else {
      metadata = {};
      const bracketMatch = name.match(/\[(\d+)\]/);
      if (bracketMatch) {
        metadata.revit_element_id = bracketMatch[1];
        const familyType = name.substring(0, name.lastIndexOf(' [')).trim();
        if (familyType) {
          metadata.family_type = familyType;
        }
      }
    }

    annotations.push({
      id: `ann_${index}`,
      label: name,
      position,
      metadata,
    });
  });

  return annotations;
}

// ---------------------------------------------------------------------------
// Run test
// ---------------------------------------------------------------------------
console.log('='.repeat(60));
console.log('ARFab GLB Parser Test');
console.log('='.repeat(60));
console.log(`File: ${GLB_PATH}`);

let buf;
try {
  buf = fs.readFileSync(GLB_PATH);
  console.log(`File size: ${buf.length.toLocaleString()} bytes\n`);
} catch (err) {
  console.error(`ERROR: Could not read file: ${err.message}`);
  process.exit(1);
}

let annotations;
try {
  annotations = parseGlbAnnotations(buf);
} catch (err) {
  console.error(`PARSE ERROR: ${err.message}`);
  process.exit(1);
}

console.log(`Parsed ${annotations.length} annotation(s):\n`);
annotations.forEach((ann, i) => {
  console.log(`[${i + 1}] id: ${ann.id}`);
  console.log(`    label: ${ann.label}`);
  console.log(`    position: x=${ann.position.x.toFixed(4)}, y=${ann.position.y.toFixed(4)}, z=${ann.position.z.toFixed(4)}`);
  console.log(`    metadata: ${JSON.stringify(ann.metadata)}`);
  console.log('');
});

// Validation checks
let passed = true;

if (annotations.length === 0) {
  console.error('FAIL: Expected at least 1 annotation, got 0');
  passed = false;
} else {
  console.log(`PASS: Got ${annotations.length} annotation(s)`);
}

// Check expected count for the known Revit file (6 nodes)
if (annotations.length === 6) {
  console.log('PASS: Got expected 6 annotations for this Revit GLB');
} else {
  console.warn(`WARN: Expected 6 annotations, got ${annotations.length} (file may differ)`);
}

// Validate structure of each annotation
let structureOk = true;
annotations.forEach((ann, i) => {
  if (typeof ann.id !== 'string' || ann.id === '') {
    console.error(`FAIL: annotations[${i}].id is invalid`);
    structureOk = false;
    passed = false;
  }
  if (typeof ann.label !== 'string' || ann.label.trim() === '') {
    console.error(`FAIL: annotations[${i}].label is invalid`);
    structureOk = false;
    passed = false;
  }
  if (typeof ann.position.x !== 'number' || typeof ann.position.y !== 'number' || typeof ann.position.z !== 'number') {
    console.error(`FAIL: annotations[${i}].position has non-numeric coords`);
    structureOk = false;
    passed = false;
  }
  if (typeof ann.metadata !== 'object' || ann.metadata === null) {
    console.error(`FAIL: annotations[${i}].metadata is not an object`);
    structureOk = false;
    passed = false;
  } else {
    for (const key of Object.keys(ann.metadata)) {
      if (typeof ann.metadata[key] !== 'string') {
        console.error(`FAIL: annotations[${i}].metadata["${key}"] is not a string`);
        structureOk = false;
        passed = false;
      }
    }
  }
});

if (structureOk) {
  console.log('PASS: All annotation structures are valid');
}

// Check that name-based metadata parsing worked (no extras on Revit nodes)
const hasRevitIds = annotations.some(ann => ann.metadata.revit_element_id);
if (hasRevitIds) {
  console.log('PASS: revit_element_id extracted from node names');
} else {
  console.warn('WARN: No revit_element_id found — nodes may have extras or no bracket IDs');
}

console.log('\n' + '='.repeat(60));
console.log(passed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
console.log('='.repeat(60));
process.exit(passed ? 0 : 1);
