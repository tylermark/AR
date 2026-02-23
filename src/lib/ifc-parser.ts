export interface IfcElement {
  guid: string
  name: string
  properties: Record<string, string>
}

// IFC building element types to extract
const ELEMENT_TYPES = new Set([
  'IFCBEAM',
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCMEMBER',
  'IFCPLATE',
  'IFCCOLUMN',
  'IFCSLAB',
  'IFCBUILDINGELEMENTPROXY',
  'IFCDOOR',
  'IFCWINDOW',
  'IFCROOF',
  'IFCFOOTING',
  'IFCCOVERING',
  'IFCRAILING',
])

// Tokenise a comma-separated args string (handles nested parens/strings)
function parseArgs(raw: string): string[] {
  const args: string[] = []
  let depth = 0
  let inStr = false
  let cur = ''
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === "'" && !inStr) { inStr = true; cur += c; continue }
    if (c === "'" && inStr) {
      if (raw[i + 1] === "'") { cur += "''"; i++; continue }
      inStr = false; cur += c; continue
    }
    if (inStr) { cur += c; continue }
    if (c === '(') { depth++; cur += c; continue }
    if (c === ')') { depth--; cur += c; continue }
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) args.push(cur.trim())
  return args
}

// Extract a string value from an IFC arg (strips quotes, handles $)
function strArg(arg: string | undefined): string | null {
  if (!arg || arg === '$') return null
  if (arg.startsWith("'") && arg.endsWith("'")) {
    return arg.slice(1, -1).replace(/''/g, "'")
  }
  return arg
}

// Resolve a ref like #123 to its entity id
function refId(arg: string | undefined): number | null {
  if (!arg || !arg.startsWith('#')) return null
  const n = parseInt(arg.slice(1), 10)
  return isNaN(n) ? null : n
}

// Clean a property value
function cleanValue(v: string): string {
  // Boolean literals
  if (v === '.T.') return 'true'
  if (v === '.F.') return 'false'
  // Trailing dot on numbers: e.g. "4." -> "4", "5.994." -> "5.994"
  if (/(\d+)\.$/.test(v)) return v.slice(0, -1)
  return v
}

export function parseIfcBuffer(buffer: Buffer): IfcElement[] {
  try {
    const text = buffer.toString('utf8')

    // Parse all entities into a map: numericId -> { type, args }
    const entities = new Map<number, { type: string; args: string[] }>()
    const lineRe = /#(\d+)\s*=\s*([A-Z0-9]+)\s*\(([^;]*)\)\s*;/g
    let m: RegExpExecArray | null
    while ((m = lineRe.exec(text)) !== null) {
      const id = parseInt(m[1], 10)
      const type = m[2]
      const argsRaw = m[3]
      entities.set(id, { type, args: parseArgs(argsRaw) })
    }

    // Collect building elements
    const elementIds: number[] = []
    const elementData = new Map<number, { guid: string; name: string }>()

    entities.forEach((ent, id) => {
      if (!ELEMENT_TYPES.has(ent.type)) return
      const guid = strArg(ent.args[0]) ?? ''
      const name = strArg(ent.args[2]) ?? ''
      elementIds.push(id)
      elementData.set(id, { guid, name })
    })

    // Build property index: elementId -> flat property map
    const propIndex = new Map<number, Record<string, string>>()

    entities.forEach(ent => {
      if (ent.type !== 'IFCRELDEFINESBYPROPERTIES') return

      const relatedRaw = ent.args[4] // e.g. (#12,#34)
      const psetRefId = refId(ent.args[5])
      if (psetRefId === null) return

      const psetEnt = entities.get(psetRefId)
      if (!psetEnt || psetEnt.type !== 'IFCPROPERTYSET') return

      // pset args: GlobalId, OwnerHistory, Name, Description, HasProperties[(#refs)]
      const propsRaw = psetEnt.args[4] // (#p1,#p2,...)

      // Collect property values
      const props: Record<string, string> = {}
      const propRe = /#(\d+)/g
      let pm: RegExpExecArray | null
      while ((pm = propRe.exec(propsRaw)) !== null) {
        const propEnt = entities.get(parseInt(pm[1], 10))
        if (!propEnt || propEnt.type !== 'IFCPROPERTYSINGLEVALUE') continue
        // args: Name, Description, NominalValue(typed), Unit
        const propName = strArg(propEnt.args[0])
        const nomRaw = propEnt.args[2]
        let propVal: string | null = null
        if (nomRaw && nomRaw !== '$') {
          const innerMatch = nomRaw.match(/^[A-Z0-9]+\((.+)\)$/)
          propVal = innerMatch ? (strArg(innerMatch[1]) ?? innerMatch[1]) : nomRaw
        }
        if (propName && propVal !== null) {
          props[propName] = cleanValue(String(propVal))
        }
      }

      // Merge into each related element
      const refRe = /#(\d+)/g
      let rm: RegExpExecArray | null
      while ((rm = refRe.exec(relatedRaw)) !== null) {
        const elId = parseInt(rm[1], 10)
        if (!propIndex.has(elId)) propIndex.set(elId, {})
        Object.assign(propIndex.get(elId)!, props)
      }
    })

    // Build material index: elementId -> material name
    const matIndex = new Map<number, string>()

    entities.forEach(ent => {
      if (ent.type !== 'IFCRELASSOCIATESMATERIAL') return
      const relatedRaw = ent.args[4]
      const matRefId = refId(ent.args[5])
      if (matRefId === null) return
      const matEnt = entities.get(matRefId)
      if (!matEnt) return

      let matName: string | null = null
      if (matEnt.type === 'IFCMATERIAL') {
        matName = strArg(matEnt.args[0])
      }

      if (!matName) return

      const refRe = /#(\d+)/g
      let rm: RegExpExecArray | null
      while ((rm = refRe.exec(relatedRaw)) !== null) {
        matIndex.set(parseInt(rm[1], 10), matName!)
      }
    })

    // Build final IfcElement array
    const results: IfcElement[] = []
    for (const id of elementIds) {
      const data = elementData.get(id)!
      const properties: Record<string, string> = { ...(propIndex.get(id) ?? {}) }
      const mat = matIndex.get(id)
      if (mat) properties['Material'] = mat
      results.push({
        guid: data.guid,
        name: data.name,
        properties,
      })
    }

    return results
  } catch {
    return []
  }
}
