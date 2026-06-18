// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { initCamera } from '../web/src/camera.js'

describe('initCamera', () => {
  let vp, content
  beforeEach(() => {
    document.body.innerHTML = '<div id="vp"><div id="c"></div></div>'
    vp = document.getElementById('vp')
    content = document.getElementById('c')
  })

  it('wheel com deltaY negativo aumenta a escala', () => {
    initCamera(vp, content)
    vp.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    expect(content.style.transform).toContain('scale(1.1')
  })

  it('arrastar move o conteúdo (translate muda)', () => {
    initCamera(vp, content)
    vp.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 20 }))
    expect(content.style.transform).toContain('translate(30px, 20px)')
    window.dispatchEvent(new MouseEvent('mouseup', {}))
  })

  it('reset volta a câmera ao estado inicial', () => {
    const cam = initCamera(vp, content)
    vp.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    cam.reset()
    expect(content.style.transform).toContain('scale(1)')
    expect(content.style.transform).toContain('translate(0px, 0px)')
  })
})
