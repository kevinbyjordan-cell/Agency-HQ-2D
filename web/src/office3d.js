import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { layoutRooms } from './office3dLayout.js'

const TYPE_COLOR = {
  orchestrator: 0xe2603f,
  'general-purpose': 0x6ea8fe,
  Explore: 0x46c28e,
  Plan: 0xb07cf0,
  'pesquisador-de-nicho': 0xe0b341,
  'pesquisador-local': 0xe0b341,
  copywriter: 0x46c28e,
  'arquiteto-de-projeto': 0xb07cf0,
  'auditor-seo': 0xe0794a,
}
const colorFor = (type) => TYPE_COLOR[type] ?? 0x8a9099

// Builds the 3D office scene inside `container`, returns { update, dispose }.
export function createOffice3D(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0d11)
  scene.fog = new THREE.Fog(0x0b0d11, 28, 60)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(0, 15, 22)

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  container.appendChild(renderer.domElement)

  const labelRenderer = new CSS2DRenderer()
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.top = '0'
  labelRenderer.domElement.style.left = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(labelRenderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 1, 0)
  controls.maxPolarAngle = Math.PI / 2.05

  scene.add(new THREE.AmbientLight(0xffffff, 0.65))
  const dir = new THREE.DirectionalLight(0xffffff, 0.85)
  dir.position.set(8, 16, 10)
  scene.add(dir)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x1b1e27, roughness: 1 }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  scene.add(new THREE.GridHelper(80, 40, 0x2a2f3a, 0x20242d))

  const avatars = new Map()
  const roomGroup = new THREE.Group()
  scene.add(roomGroup)

  function clearGroup(g) {
    for (const child of [...g.children]) {
      if (child.isCSS2DObject && child.element && child.element.parentNode) child.element.parentNode.removeChild(child.element)
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    }
    g.clear()
  }

  function makeAvatar(a) {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorFor(a.type), roughness: 0.7 })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 10), bodyMat)
    body.position.y = 0.75
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf0e6da, roughness: 0.6 })
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), headMat)
    head.position.y = 1.5
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.08, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x6b4f34, roughness: 0.9 }),
    )
    desk.position.set(0, 0.5, 0.8)
    group.add(body, head, desk)

    const labelDiv = document.createElement('div')
    labelDiv.className = 'o3d__label'
    const label = new CSS2DObject(labelDiv)
    label.position.set(0, 2.15, 0)
    group.add(label)

    const bubbleDiv = document.createElement('div')
    bubbleDiv.className = 'o3d__bubble'
    bubbleDiv.style.display = 'none'
    const bubble = new CSS2DObject(bubbleDiv)
    bubble.position.set(0, 2.75, 0)
    group.add(bubble)

    return { group, bodyMat, headMat, labelDiv, bubbleDiv, working: false, phase: 0 }
  }

  function disposeAvatar(av) {
    av.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
    if (av.labelDiv.parentNode) av.labelDiv.parentNode.removeChild(av.labelDiv)
    if (av.bubbleDiv.parentNode) av.bubbleDiv.parentNode.removeChild(av.bubbleDiv)
  }

  function update(building) {
    const rooms = layoutRooms(building)

    // Rebuild room zones + project signs each tick (rooms change rarely; cheap).
    clearGroup(roomGroup)
    for (const room of rooms) {
      const active = room.status === 'active'
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(room.w, room.d),
        new THREE.MeshStandardMaterial({ color: active ? 0x242a36 : 0x1b1f27, roughness: 1, transparent: true, opacity: 0.92 }),
      )
      pad.rotation.x = -Math.PI / 2
      pad.position.set(room.cx, 0.02, room.cz)
      roomGroup.add(pad)

      const signDiv = document.createElement('div')
      signDiv.className = 'o3d__sign' + (active ? ' o3d__sign--active' : '')
      signDiv.textContent = room.project || '—'
      const sign = new CSS2DObject(signDiv)
      sign.position.set(room.cx, 3.4, room.cz - room.d / 2 - 0.6)
      roomGroup.add(sign)
    }

    // Position one avatar per agent at its room-relative spot; diff by stable id.
    const flat = rooms.flatMap((r) => r.agents)
    const seen = new Set()
    for (const a of flat) {
      seen.add(a.id)
      let av = avatars.get(a.id)
      if (!av) {
        av = makeAvatar(a)
        scene.add(av.group)
        avatars.set(a.id, av)
      }
      av.group.position.x = a.x
      av.group.position.z = a.z
      av.phase = a.x * 0.7 + a.z * 0.3
      av.bodyMat.color.set(colorFor(a.type))
      av.labelDiv.textContent = a.label
      av.working = a.status === 'working'
      const faded = a.status === 'done'
      av.bodyMat.opacity = faded ? 0.5 : 1
      av.bodyMat.transparent = faded
      if (av.working && a.speech) {
        av.bubbleDiv.textContent = a.speech
        av.bubbleDiv.style.display = ''
      } else {
        av.bubbleDiv.style.display = 'none'
      }
    }
    for (const [id, av] of avatars) {
      if (!seen.has(id)) {
        scene.remove(av.group)
        disposeAvatar(av)
        avatars.delete(id)
      }
    }
  }

  const startedAt = performance.now()
  let running = true
  function frame() {
    if (!running) return
    requestAnimationFrame(frame)
    const t = (performance.now() - startedAt) / 1000
    for (const av of avatars.values()) {
      av.group.position.y = av.working ? Math.abs(Math.sin(t * 3 + av.phase)) * 0.18 : 0
    }
    controls.update()
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }

  function resize() {
    const w = container.clientWidth
    const h = container.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    labelRenderer.setSize(w, h)
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  frame()

  // Debug / e2e hook: pause the render loop so a still frame can be screenshotted
  // (a continuously-animating WebGL canvas never reaches "idle" for a headless capture).
  if (typeof window !== 'undefined') {
    window.__office3d = {
      pause() {
        running = false
      },
      resume() {
        if (!running) {
          running = true
          frame()
        }
      },
    }
  }

  function dispose() {
    running = false
    ro.disconnect()
    for (const [, av] of avatars) {
      scene.remove(av.group)
      disposeAvatar(av)
    }
    avatars.clear()
    clearGroup(roomGroup)
    controls.dispose()
    renderer.dispose()
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
    if (labelRenderer.domElement.parentNode) labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement)
  }

  return { update, dispose }
}
