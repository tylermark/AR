'use client'

import { useRef, useState, useEffect } from 'react'
import type { Annotation } from '@/types/model'

interface ARViewerProps {
  modelUrl: string
  annotations: Annotation[]
}

export default function ARViewer({ modelUrl, annotations }: ARViewerProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [active, setActive] = useState(false)
  const [placed, setPlaced] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<XRSession | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      setSupported(false)
      return
    }
    navigator.xr.isSessionSupported('immersive-ar')
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [])

  async function startAR() {
    if (!canvasRef.current || !navigator.xr) return

    try {
      // Lazy-load Three.js (large library — only load when AR is actually requested)
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const { makeAnnotationSprite } = await import('@/lib/ar-label')

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

      // --- Resize handler ---
      const onResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight)
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
      }
      window.addEventListener('resize', onResize)

      // --- Load GLB ---
      const loader = new GLTFLoader()
      const gltf = await new Promise<{ scene: import('three').Group }>((resolve, reject) => {
        loader.load(modelUrl, resolve, undefined, reject)
      })
      const model3d = gltf.scene
      model3d.visible = false
      scene.add(model3d)

      // --- Annotation sprites ---
      for (const ann of annotations) {
        const sprite = makeAnnotationSprite(ann)
        sprite.position.set(ann.position.x, ann.position.y + 0.3, ann.position.z)
        model3d.add(sprite)
      }

      // --- Reticle ---
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
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
      })
      sessionRef.current = session
      renderer.xr.setReferenceSpaceType('local')
      await renderer.xr.setSession(session as XRSession)

      const refSpace = await session.requestReferenceSpace('local')
      const viewerSpace = await session.requestReferenceSpace('viewer')
      const hitTestSource = await session.requestHitTestSource!({ space: viewerSpace })

      let isPlaced = false

      // Tap to place
      session.addEventListener('select', () => {
        if (!isPlaced && reticle.visible) {
          isPlaced = true
          const pos = new THREE.Vector3()
          pos.setFromMatrixPosition(reticle.matrix)
          model3d.position.copy(pos)
          model3d.visible = true
          reticle.visible = false
          setPlaced(true)
        }
      })

      setActive(true)

      // --- Render loop ---
      renderer.setAnimationLoop((_time: number, frame: XRFrame | undefined) => {
        if (!frame) return

        if (!isPlaced && hitTestSource) {
          const hits = frame.getHitTestResults(hitTestSource as XRHitTestSource)
          if (hits.length > 0) {
            const pose = hits[0].getPose(refSpace)
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

      // --- Session end cleanup ---
      session.addEventListener('end', () => {
        hitTestSource?.cancel()
        renderer.setAnimationLoop(null)
        renderer.dispose()
        window.removeEventListener('resize', onResize)
        sessionRef.current = null
        setActive(false)
        setPlaced(false)
      })
    } catch (err) {
      console.error('WebXR AR failed:', err)
      setActive(false)
      setPlaced(false)
    }
  }

  if (supported === false) return null

  return (
    <div className="relative">
      <button
        onClick={startAR}
        className="absolute bottom-6 right-6 bg-amber-500 hover:bg-amber-400
                   text-black font-mono font-bold uppercase tracking-widest
                   text-sm px-5 py-3 rounded-sm transition-colors shadow-lg z-10"
      >
        View in AR
      </button>
      {/* Canvas is always mounted so canvasRef.current is available when startAR runs */}
      <canvas
        ref={canvasRef}
        className={`fixed inset-0 z-50 w-full h-full ${active ? 'block' : 'hidden'}`}
      />
      {active && (
        <>
          <button
            className="fixed top-6 right-6 z-[60] bg-black border border-gray-700
                       text-gray-100 font-mono text-sm px-4 py-2 rounded-sm"
            onClick={() => sessionRef.current?.end()}
          >
            Exit AR
          </button>
          {!placed && (
            <p className="fixed bottom-10 left-0 right-0 z-[60] text-center text-amber-400
                          font-mono text-sm pointer-events-none">
              Point at a flat surface and tap to place
            </p>
          )}
        </>
      )}
    </div>
  )
}
