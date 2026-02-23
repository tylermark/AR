'use strict';

/**
 * parse-test-ifc.js
 * IFC inspection script for ARFab project.
 * Reads a Revit IFC export, extracts elements and their property sets,
 * and previews what the annotations array would look like.
 *
 * Usage: node scripts/parse-test-ifc.js
 */

const fs = require('fs');
const path = require('path');

const IFC_PATH = 'C:/Users/tyler/Downloads/Project1.ifc';

console.log('='.repeat(80));
console.log('ARFab IFC Inspector');
console.log('='.repeat(80));
console.log(`File: ${IFC_PATH}`);

let raw;
try {
  raw = fs.readFileSync(IFC_PATH, 'utf8');
} catch (err) {
  console.error(`ERROR: Could not read file: ${err.message}`);
  process.exit(1);
}

console.log(`File size: ${(raw.length / 1024).toFixed(1)} KB`);

// ---------------------------------------------------------------------------
// IFC STEP parser helpers
// IFC uses STEP physical file format. Each line is like:
//   #123 = IFCENTITY(arg1, arg2, ...);
// Arguments can be strings ('...'), numbers, refs (#123), enums (.ENUM.),
// lists ((a,b,c)), or $null.
// ---------------------------------------------------------------------------

// Parse all entities into a map: id -> { type, args_raw, args }
function parseIfc(text) {
  const entities = new Map();
  // Match lines like: #123= IFCFOO(...);\n
  const lineRe = /#(\d+)\s*=\s*([A-Z0-9]+)\s*\(([^;]*)\)\s*;/g;
  let m;
  while ((m = lineRe.exec(text)) !== null) {
    const id = parseInt(m[1], 10);
    const type = m[2];
    const argsRaw = m[3];
    entities.set(id, { type, argsRaw, args: parseArgs(argsRaw) });
  }
  return entities;
}

// Tokenise a comma-separated args string (handles nested parens/strings)
function parseArgs(raw) {
  const args = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "'" && !inStr) { inStr = true; cur += c; continue; }
    if (c === "'" && inStr) {
      // escaped quote ''
      if (raw[i + 1] === "'") { cur += "''"; i++; continue; }
      inStr = false; cur += c; continue;
    }
    if (inStr) { cur += c; continue; }
    if (c === '(') { depth++; cur += c; continue; }
    if (c === ')') { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

// Extract a string value from an IFC arg (strips quotes, handles $)
function strArg(arg) {
  if (!arg || arg === '$') return null;
  if (arg.startsWith("'") && arg.endsWith("'")) {
    return arg.slice(1, -1).replace(/''/g, "'");
  }
  return arg;
}

// Resolve a ref like #123 to its entity
function ref(arg, entities) {
  if (!arg || !arg.startsWith('#')) return null;
  return entities.get(parseInt(arg.slice(1), 10)) || null;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------
console.log('\nParsing IFC entities...');
const entities = parseIfc(raw);
console.log(`Total entities parsed: ${entities.size}`);

// Count by type
const typeCounts = {};
for (const { type } of entities.values()) {
  typeCounts[type] = (typeCounts[type] || 0) + 1;
}

console.log('\n--- Entity type counts (top 30) ---');
Object.entries(typeCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([t, c]) => console.log(`  ${t}: ${c}`));

// ---------------------------------------------------------------------------
// Find building elements
// Revit exports: IFCMEMBER, IFCPLATE, IFCWALL, IFCBEAM, IFCCOLUMN, IFCSLAB,
// IFCDOOR, IFCWINDOW, IFCBUILDINGELEMENTPROXY, IFCFLOWSEGMENT, etc.
// ---------------------------------------------------------------------------
const ELEMENT_TYPES = new Set([
  'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCBEAM', 'IFCCOLUMN',
  'IFCMEMBER', 'IFCPLATE', 'IFCDOOR', 'IFCWINDOW', 'IFCSTAIR', 'IFCROOF',
  'IFCFURNISHINGELEMENT', 'IFCBUILDINGELEMENTPROXY', 'IFCFLOWSEGMENT',
  'IFCFLOWFITTING', 'IFCFLOWTERMINAL', 'IFCPIPEsegment', 'IFCPIPEFITTING',
  'IFCDUCTFITTING', 'IFCDUCTSEGMENT', 'IFCCOVERING', 'IFCRAILING',
  'IFCFOOTING', 'IFCPILE', 'IFCSPACE', 'IFCOPENINGELEMENT',
]);

const elements = [];
for (const [id, ent] of entities.entries()) {
  if (ELEMENT_TYPES.has(ent.type)) {
    // args: GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, Tag
    const guid = strArg(ent.args[0]);
    const name = strArg(ent.args[2]);
    elements.push({ id, type: ent.type, guid, name });
  }
}

console.log(`\n--- Building elements found: ${elements.length} ---`);
const elTypeCounts = {};
for (const el of elements) {
  elTypeCounts[el.type] = (elTypeCounts[el.type] || 0) + 1;
}
Object.entries(elTypeCounts).forEach(([t, c]) => console.log(`  ${t}: ${c}`));

// ---------------------------------------------------------------------------
// Build property set index: elementId -> { propSetName -> { key -> value } }
// ---------------------------------------------------------------------------
// IFCRELDEFINESBYPROPERTIES links elements to property sets
// args: GlobalId, OwnerHistory, Name, Description, RelatedObjects[(#refs)], RelatingPropertyDefinition(#ref)
const propIndex = new Map(); // elementId -> merged flat properties

for (const [, ent] of entities.entries()) {
  if (ent.type !== 'IFCRELDEFINESBYPROPERTIES') continue;
  const relatedRaw = ent.args[4]; // e.g. (#12,#34)
  const psetRef = ent.args[5];    // e.g. #56

  // Parse related object refs
  const relatedIds = [];
  const refRe = /#(\d+)/g;
  let rm;
  while ((rm = refRe.exec(relatedRaw)) !== null) {
    relatedIds.push(parseInt(rm[1], 10));
  }

  const psetEnt = ref(psetRef, entities);
  if (!psetEnt) continue;
  if (psetEnt.type !== 'IFCPROPERTYSET') continue;

  // pset args: GlobalId, OwnerHistory, Name, Description, HasProperties[(#refs)]
  const psetName = strArg(psetEnt.args[2]) || 'Unknown';
  const propsRaw = psetEnt.args[4]; // (#p1,#p2,...)

  // Collect property values
  const props = {};
  const propRe = /#(\d+)/g;
  let pm;
  while ((pm = propRe.exec(propsRaw)) !== null) {
    const propEnt = entities.get(parseInt(pm[1], 10));
    if (!propEnt || propEnt.type !== 'IFCPROPERTYSINGLEVALUE') continue;
    // args: Name, Description, NominalValue(typed), Unit
    const propName = strArg(propEnt.args[0]);
    // NominalValue is a typed value like IFCTEXT('foo') or IFCREAL(1.23)
    const nomRaw = propEnt.args[2];
    let propVal = null;
    if (nomRaw && nomRaw !== '$') {
      const innerMatch = nomRaw.match(/^[A-Z0-9]+\((.+)\)$/);
      propVal = innerMatch ? strArg(innerMatch[1]) || innerMatch[1] : nomRaw;
    }
    if (propName && propVal !== null) {
      props[propName] = String(propVal);
    }
  }

  // Merge into each related element
  for (const elId of relatedIds) {
    if (!propIndex.has(elId)) propIndex.set(elId, {});
    Object.assign(propIndex.get(elId), props);
  }
}

// ---------------------------------------------------------------------------
// Material index: elementId -> material name
// IFCRELASSOCIATESMATERIAL: args[4]=RelatedObjects, args[5]=RelatingMaterial
// ---------------------------------------------------------------------------
const matIndex = new Map();
for (const [, ent] of entities.entries()) {
  if (ent.type !== 'IFCRELASSOCIATESMATERIAL') continue;
  const relatedRaw = ent.args[4];
  const matRef = ent.args[5];
  const matEnt = ref(matRef, entities);
  if (!matEnt) continue;

  let matName = null;
  if (matEnt.type === 'IFCMATERIAL') {
    matName = strArg(matEnt.args[0]);
  } else if (matEnt.type === 'IFCMATERIALLAYERSET') {
    // args[0] = MaterialLayers list, args[1] = LayerSetName
    matName = strArg(matEnt.args[1]);
  } else if (matEnt.type === 'IFCMATERIALLAYER') {
    const innerMat = ref(matEnt.args[0], entities);
    if (innerMat && innerMat.type === 'IFCMATERIAL') matName = strArg(innerMat.args[0]);
  } else if (matEnt.type === 'IFCMATERIALLIST') {
    // args[0] = list of #refs
    const firstRef = matEnt.args[0]?.match(/#(\d+)/);
    if (firstRef) {
      const m2 = entities.get(parseInt(firstRef[1], 10));
      if (m2 && m2.type === 'IFCMATERIAL') matName = strArg(m2.args[0]);
    }
  }

  if (!matName) continue;
  const refRe = /#(\d+)/g;
  let rm;
  while ((rm = refRe.exec(relatedRaw)) !== null) {
    matIndex.set(parseInt(rm[1], 10), matName);
  }
}

// ---------------------------------------------------------------------------
// Sample: show first 10 elements with full properties
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('SAMPLE ELEMENTS (first 10 with properties)');
console.log('='.repeat(80));

const sample = elements.slice(0, 10);
for (const el of sample) {
  const props = propIndex.get(el.id) || {};
  const mat = matIndex.get(el.id);
  console.log(`\n[#${el.id}] ${el.type}`);
  console.log(`  GUID: ${el.guid}`);
  console.log(`  Name: ${el.name}`);
  if (mat) console.log(`  Material: ${mat}`);
  const keys = Object.keys(props);
  if (keys.length === 0) {
    console.log('  Properties: (none)');
  } else {
    console.log(`  Properties (${keys.length}):`);
    keys.slice(0, 15).forEach(k => console.log(`    ${k}: ${props[k]}`));
    if (keys.length > 15) console.log(`    ... (${keys.length - 15} more)`);
  }
}

// ---------------------------------------------------------------------------
// Annotation preview
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('ANNOTATION PREVIEW (first 5 elements)');
console.log('='.repeat(80));

const annotationPreview = elements.slice(0, 5).map((el, i) => {
  const props = propIndex.get(el.id) || {};
  const mat = matIndex.get(el.id);
  const metadata = { ...props };
  if (mat) metadata['Material'] = mat;
  return {
    id: `ann_${String(i).padStart(3, '0')}`,
    label: el.name || el.type,
    guid: el.guid,
    position: { x: 0, y: 0, z: 0 }, // positions come from GLB
    metadata,
  };
});

console.log(JSON.stringify(annotationPreview, null, 2));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Total elements:                   ${elements.length}`);
console.log(`Elements with property sets:      ${[...elements].filter(e => propIndex.has(e.id) && Object.keys(propIndex.get(e.id)).length > 0).length}`);
console.log(`Elements with material:           ${[...elements].filter(e => matIndex.has(e.id)).length}`);
console.log(`Unique property keys across all:  ${new Set(elements.flatMap(e => Object.keys(propIndex.get(e.id) || {}))).size}`);
console.log('\n' + '='.repeat(80));
console.log('Inspection complete.');
console.log('='.repeat(80));
