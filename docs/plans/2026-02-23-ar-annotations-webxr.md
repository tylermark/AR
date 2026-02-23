# AR Annotations (WebXR) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace model-viewer's built-in AR button with a custom WebXR AR session that renders the GLB model plus multi-line metadata annotation sprites floating in 3D space — works on Android Chrome and iOS 18+ Safari.

**Architecture:** Keep `<model-viewer>` for the standard browser 3D view (unchanged). Add a new `ARViewer` client component that uses Three.js + WebXR to launch a custom `immersive-ar` session. Annotation labels are rendered as canvas-based `THREE.Sprite` billboards positioned at each annotation's stored X/Y/Z coordinates. If WebXR AR is not available (older browsers/OS), fall back silently to model-viewer's Quick Look.

**Tech Stack:** Three.js (`three` npm), Three.js GLTFLoader, WebXR `immersive-ar` + `hit-test` feature, Next.js 14 App Router client component, Canvas 2D API for label textures.

---

## Context

### Annotation data shape (already stored in Supabase)
```typescript
interface Annotation {
  id: string
  label: string
  position: { x: number; y: number; z: number }  // model-space, meters
  metadata: Record<string, string>  // e.g. { Reference, Span, Material, LoadBearing }
}
```

### Existing viewer page
`src/app/model/[id]/page.tsx` — client component, fetches model from Supabase, renders `<model-viewer>` with hotspot buttons, and a metadata panel below. **Do not break any of this.**

### Key files
- `src/app/model/[id]/page.tsx` — main viewer page (modify: swap AR button)
- `src/components/ARViewer.tsx` — new component (create)
- `src/app/globals.css` — hotspot styles (no changes needed)

---

## Task 1: Install Three.js

**Files:**
- Modify: `arfab/package.json` (via npm install)

**Step 1: Install**
```bash
cd C:\Users\tyler\desktop\arfab\arfab
npm install three
npm install --save-dev @types/three
```

**Step 2: Verify**
```bash
node -e "require('three'); console.log('three ok')"
```
Expected: `three ok`

**Step 3: Commit**
```bash
git add package.json package-lock.json
git commit -m "feat: install three.js for WebXR AR viewer"
```

---

## Task 2: Create ARViewer component shell with WebXR detection

**Files:**
- Create: `src/components/ARViewer.tsx`

**Step 1: Create the component**

```tsx
'use client'

import { useRef, useState, useCallback } from 'react'
import type { Annotation } from '@/types/model'

interface ARViewerProps {
  modelUrl: string
  annotations: Annotation[]
}

export default function ARViewer({ modelUrl, annotations }: ARViewerProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [active, setActive] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Check WebXR AR support on mount
  useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      setSupported(false)
      return
    }
    navigator.xr.isSessionSupported('immersive-ar').then(setSupported)
  }, [])

  if (supported === false) return null  // hide button — model-viewer fallback handles AR

  return (
    <div className="relative">
      <button
        onClick={() => setActive(true)}
        className="absolute bottom-6 right-6 bg-amber-500 hover:bg-amber-400
                   text-arfab-black font-mono font-bold uppercase tracking-widest
                   text-sm px-5 py-3 rounded-sm transition-colors shadow-lg z-10"
      >
        View in AR
      </button>
      {active && (
        <canvas
          ref={canvasRef}
          className="fixed inset-0 z-50 w-full h-full"
        />
      )}
    </div>
  )
}
```

**Step 2: Fix the useCallback — it should be useEffect**

Replace `useCallback(() => {` with:
```tsx
import { useRef, useState, useEffect } from 'react'
// ...
useEffect(() => {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    setSupported(false)
    return
  }
  navigator.xr.isSessionSupported('immersive-ar').then(setSupported)
}, [])
```

**Step 3: Verify TypeScript compiles**
```bash
cd C:\Users\tyler\desktop\arfab\arfab
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**
```bash
git add src/components/ARViewer.tsx
git commit -m "feat: add ARViewer shell with WebXR detection"
```

---

## Task 3: Build the annotation label canvas texture helper

**Files:**
- Create: `src/lib/ar-label.ts`

This module creates a `THREE.CanvasTexture` showing multi-line metadata for one annotation. It runs client-side only (uses browser Canvas API).

**Step 1: Create the file**

```typescript
import * as THREE from 'three'
import type { Annotation } from '@/types/model'

const CANVAS_W = 512
const FONT_SIZE = 22
const PADDING = 16
const LINE_HEIGHT = 30
const HEADER_HEIGHT = 40

/** Returns a THREE.Sprite with annotation metadata rendered as a canvas texture */
export function makeAnnotationSprite(ann: Annotation): THREE.Sprite {
  // Build lines: header + key: value pairs
  const lines: { key: string; value: string }[] = Object.entries(ann.metadata)
    .filter(([, v]) => v && v !== '$')
    .slice(0, 8)  // cap at 8 properties to keep label readable
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

  // Scale: keep aspect ratio, ~0.4m tall in world space
  const aspect = CANVAS_W / canvasH
  const height = 0.25 + lines.length * 0.04  // grows with number of lines
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
  return v.length > 20 ? v.slice(0, 18) + '…' : v
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
  ctx.lineTo(x, y + r.tl)
  ctx.quadraticCurveTo(x, y, x + r.tl, y)
  ctx.closePath()
}
```

**Step 2: Verify TypeScript**
```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Commit**
```bash
git add src/lib/ar-label.ts
git commit -m "feat: add canvas annotation sprite builder for WebXR AR"
```

---

## Task 4: Implement the WebXR AR session in ARViewer

**Files:**
- Modify: `src/components/ARViewer.tsx`

This is the core WebXR loop. Replace the placeholder `onClick={() => setActive(true)}` with the full session launcher.

**Step 1: Add the startAR function to ARViewer.tsx**

Add these imports at the top:
```tsx
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { makeAnnotationSprite } from '@/lib/ar-label'
```

Add `startAR` function inside the component (before return):
```tsx
async function startAR() {
  if (!canvasRef.current || !navigator.xr) return

  // --- Three.js setup ---
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.current,
    alpha: true,
    antialias: true,
  })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.xr.enabled = true

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1))

  // --- Load GLB ---
  const loader = new GLTFLoader()
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.load(modelUrl, resolve, undefined, reject)
  })
  const model3d = gltf.scene
  model3d.visible = false  // hidden until placed
  scene.add(model3d)

  // --- Annotation sprites (offset upward from anchor point) ---
  for (const ann of annotations) {
    const sprite = makeAnnotationSprite(ann)
    // Position relative to model root — match GLB node translation
    sprite.position.set(
      ann.position.x,
      ann.position.y + 0.3,  // float 30cm above the part
      ann.position.z
    )
    model3d.add(sprite)  // parented to model so they move with it
  }

  // --- Reticle (placement indicator) ---
  const reticleGeo = new THREE.RingGeometry(0.08, 0.1, 32)
  reticleGeo.rotateX(-Math.PI / 2)
  const reticle = new THREE.Mesh(
    reticleGeo,
    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
  )
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  scene.add(reticle)

  // --- WebXR session ---
  const session = await navigator.xr!.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
  })
  renderer.xr.setReferenceSpaceType('local')
  await renderer.xr.setSession(session as XRSession)

  const refSpace = await session.requestReferenceSpace('local')
  const viewerSpace = await session.requestReferenceSpace('viewer')
  const hitTestSource = await session.requestHitTestSource!({ space: viewerSpace })

  let placed = false
  let placedPosition = new THREE.Vector3()

  // Tap to place
  session.addEventListener('select', () => {
    if (!placed && reticle.visible) {
      placed = true
      placedPosition.setFromMatrixPosition(reticle.matrix)
      model3d.position.copy(placedPosition)
      model3d.visible = true
      reticle.visible = false
    }
  })

  // Exit button
  setActive(true)

  // --- Render loop ---
  renderer.setAnimationLoop((_time: number, frame: XRFrame) => {
    if (!frame) return

    // Hit test for reticle
    if (!placed && hitTestSource) {
      const hits = frame.getHitTestResults(hitTestSource as XRHitTestSource)
      if (hits.length > 0) {
        const hit = hits[0]
        const pose = hit.getPose(refSpace)
        if (pose) {
          reticle.matrix.fromArray(pose.transform.matrix)
          reticle.visible = true
        }
      } else {
        reticle.visible = false
      }
    }

    renderer.render(scene, camera)
  })

  // Handle session end
  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null)
    renderer.dispose()
    setActive(false)
  })
}
```

**Step 2: Wire the button**

Replace `onClick={() => setActive(true)}` with `onClick={startAR}`.

**Step 3: Add exit button overlay**

Inside the `{active && ...}` block, add an exit button over the canvas:
```tsx
{active && (
  <>
    <canvas ref={canvasRef} className="fixed inset-0 z-50 w-full h-full" />
    <button
      className="fixed top-6 right-6 z-[60] bg-arfab-black border border-steel-700
                 text-steel-100 font-mono text-sm px-4 py-2 rounded-sm"
      onClick={() => {
        // session end event handles cleanup
        navigator.xr?.requestSession && setActive(false)
      }}
    >
      Exit AR
    </button>
    <p className="fixed bottom-10 left-0 right-0 z-[60] text-center text-amber-400
                  font-mono text-sm">
      {placed ? '' : 'Point at a flat surface and tap to place'}
    </p>
  </>
)}
```

**Step 4: Verify TypeScript**
```bash
npx tsc --noEmit
```
Expected: no errors (XRFrame/XRSession types come from `@types/webxr` — install if missing: `npm i -D @types/webxr`)

**Step 5: Commit**
```bash
git add src/components/ARViewer.tsx
git commit -m "feat: implement WebXR AR session with Three.js model + annotation sprites"
```

---

## Task 5: Integrate ARViewer into the model page

**Files:**
- Modify: `src/app/model/[id]/page.tsx`

**Step 1: Import ARViewer**

Add at the top of the file:
```tsx
import dynamic from 'next/dynamic'
const ARViewer = dynamic(() => import('@/components/ARViewer'), { ssr: false })
```

Use `dynamic` with `ssr: false` because Three.js and WebXR APIs don't exist server-side.

**Step 2: Replace the slot="ar-button" div**

Remove this block from inside `<model-viewer>`:
```tsx
<div
  slot="ar-button"
  className="absolute bottom-6 right-6 bg-amber-500 ..."
>
  View in AR
</div>
```

**Step 3: Add ARViewer as a sibling of model-viewer**

After the closing `</model-viewer>` tag and before `</div>` of the flex-1 container, add:
```tsx
<ARViewer modelUrl={model.file_url} annotations={annotations} />
```

The ARViewer renders its own "View in AR" button (amber, bottom-right, z-10) and the full-screen canvas overlay when active.

**Step 4: Verify page still loads**
```bash
npm run dev
```
Open http://localhost:3000/model/[any-id] — should see:
- 3D viewer (model-viewer) with small hotspot labels
- "View in AR" button bottom-right (from ARViewer)
- Metadata panel below (unchanged)

**Step 5: Commit**
```bash
git add src/app/model/[id]/page.tsx
git commit -m "feat: integrate ARViewer into model page, replace model-viewer AR button"
```

---

## Task 6: Handle TypeScript strict mode and edge cases

**Files:**
- Modify: `src/components/ARViewer.tsx`

**Step 1: Add null guards and error handling to startAR**

Wrap the entire `startAR` body in try/catch:
```tsx
async function startAR() {
  try {
    // ... existing code ...
  } catch (err) {
    console.error('WebXR AR failed:', err)
    setActive(false)
    // Optionally show a user-facing error
  }
}
```

**Step 2: Handle window resize during AR session**

Add inside startAR after renderer setup:
```tsx
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', onResize)
session.addEventListener('end', () => window.removeEventListener('resize', onResize))
```

**Step 3: Verify TypeScript**
```bash
npx tsc --noEmit
```

**Step 4: Commit**
```bash
git add src/components/ARViewer.tsx
git commit -m "fix: add error handling and resize support to WebXR AR viewer"
```

---

## Task 7: Manual end-to-end test checklist

Test on a real device (not browser devtools):

**Android Chrome:**
- [ ] Navigate to /model/[id]
- [ ] "View in AR" button visible
- [ ] Tap — camera opens, amber reticle appears on flat surface
- [ ] Tap flat surface — model appears at correct scale
- [ ] Annotation sprites visible floating above model parts
- [ ] Each sprite shows element ID, and key properties (Reference, Material, Span, etc.)
- [ ] Exit AR button works
- [ ] Page returns to normal 3D view

**iOS 18 Safari:**
- [ ] Same flow as Android
- [ ] Confirm WebXR `immersive-ar` session starts (not Quick Look)
- [ ] Annotation sprites visible in AR

**Fallback (older browser):**
- [ ] `supported === false` → ARViewer renders nothing
- [ ] model-viewer's own AR button should still be present as fallback
  - Note: if it was removed in Task 5 Step 2, re-add it conditionally:
    ```tsx
    {/* Fallback AR button for browsers without WebXR */}
    {typeof navigator !== 'undefined' && !navigator.xr && (
      <div slot="ar-button" className="absolute bottom-6 right-6 ...">
        View in AR
      </div>
    )}
    ```

---

## Notes

- **Annotation position coordinates**: stored in model-space meters from the GLB parser. Since sprites are parented to `model3d` (the Three.js group), they move correctly when the model is placed.
- **Scale**: GLB nodes had `scale: [0.3048, 0.3048, 0.3048]` (feet-to-meters). The Three.js GLTFLoader applies these transforms automatically, so annotation positions should align correctly.
- **iOS 18 WebXR**: Requires the page to be served over HTTPS. For local dev, use ngrok or deploy to Vercel to test on device.
- **Hit-test feature**: Required for the reticle. If the device doesn't support it, the session request will fail — caught by the try/catch and ARViewer hides gracefully.
