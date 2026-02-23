import * as THREE from 'three'
import type { Annotation } from '@/types/model'

const CANVAS_W = 512
const FONT_SIZE = 22
const PADDING = 16
const LINE_HEIGHT = 30
const HEADER_HEIGHT = 40

/** Returns a THREE.Sprite with annotation metadata rendered as a canvas texture */
export function makeAnnotationSprite(ann: Annotation): THREE.Sprite {
  // Build lines: key: value pairs (cap at 8 properties)
  const lines: { key: string; value: string }[] = Object.entries(ann.metadata)
    .filter(([, v]) => v && v !== '$')
    .slice(0, 8)
    .map(([k, v]) => ({
      key: k.replace(/_/g, ' ').toUpperCase(),
      value: cleanValue(v),
    }))

  const canvasH = HEADER_HEIGHT + PADDING + lines.length * LINE_HEIGHT + PADDING

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = canvasH

  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = 'rgba(10, 10, 10, 0.88)'
  roundRect(ctx, 0, 0, CANVAS_W, canvasH, 10)
  ctx.fill()

  // Amber top border
  ctx.fillStyle = '#f59e0b'
  roundRect(ctx, 0, 0, CANVAS_W, 4, { tl: 10, tr: 10, bl: 0, br: 0 })
  ctx.fill()

  // Header label
  ctx.fillStyle = '#fbbf24'
  ctx.font = `bold ${FONT_SIZE}px monospace`
  ctx.fillText(getShortId(ann), PADDING, HEADER_HEIGHT - 10)

  // Properties
  let y = HEADER_HEIGHT + PADDING
  for (const { key, value } of lines) {
    // Key
    ctx.fillStyle = '#6b7280'
    ctx.font = `${FONT_SIZE - 6}px monospace`
    ctx.fillText(key, PADDING, y)
    // Value
    ctx.fillStyle = '#f3f4f6'
    ctx.font = `${FONT_SIZE - 4}px monospace`
    const valueX = CANVAS_W / 2
    ctx.fillText(value, valueX, y)
    y += LINE_HEIGHT
  }

  // Build sprite
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)

  // Scale: keep aspect ratio, height grows with number of lines
  const aspect = CANVAS_W / canvasH
  const height = 0.25 + lines.length * 0.04
  sprite.scale.set(height * aspect, height, 1)

  return sprite
}

function getShortId(ann: Annotation): string {
  if (ann.metadata?.revit_element_id) return `#${ann.metadata.revit_element_id}`
  const match = ann.label.match(/\[(\d+)\]/)
  if (match) return `#${match[1]}`
  return ann.id
}

function cleanValue(v: string): string {
  if (v === '.T.' || v.toLowerCase() === 'true') return 'Yes'
  if (v === '.F.' || v.toLowerCase() === 'false') return 'No'
  // Remove trailing dot from numbers: "4." -> "4"
  if (/^\d+\.$/.test(v)) return v.slice(0, -1)
  // Truncate long values
  return v.length > 20 ? v.slice(0, 18) + '\u2026' : v
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  radius: number | { tl: number; tr: number; bl: number; br: number }
) {
  const r = typeof radius === 'number'
    ? { tl: radius, tr: radius, bl: radius, br: radius }
    : radius
  ctx.beginPath()
  ctx.moveTo(x + r.tl, y)
  ctx.lineTo(x + w - r.tr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr)
  ctx.lineTo(x + w, y + h - r.br)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h)
  ctx.lineTo(x + r.bl, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl)
  ctx.lineTo(x, y + r.bl)
  ctx.quadraticCurveTo(x, y, x + r.tl, y)
  ctx.closePath()
}
