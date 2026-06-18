export function initCamera(viewport, content) {
  const cam = { x: 0, y: 0, scale: 1 }

  function apply() {
    content.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`
  }

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      cam.scale = Math.min(2, Math.max(0.3, cam.scale * factor))
      apply()
    },
    { passive: false }
  )

  let dragging = false
  let startX = 0
  let startY = 0
  let originX = 0
  let originY = 0

  viewport.addEventListener('mousedown', (e) => {
    dragging = true
    startX = e.clientX
    startY = e.clientY
    originX = cam.x
    originY = cam.y
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    cam.x = originX + (e.clientX - startX)
    cam.y = originY + (e.clientY - startY)
    apply()
  })
  window.addEventListener('mouseup', () => {
    dragging = false
  })

  apply()
  return {
    reset() {
      cam.x = 0
      cam.y = 0
      cam.scale = 1
      apply()
    },
  }
}
