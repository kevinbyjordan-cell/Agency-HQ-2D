import { describe, it, expect } from 'vitest'
import { shouldTrack, roomStatus, shouldDrop, IDLE_AFTER_MS, DROP_AFTER_MS, TRACK_WINDOW_MS } from '../server/src/sessionLifecycle'

const now = 1_000_000_000_000

describe('shouldTrack', () => {
  it('rastreia arquivo com mtime dentro da janela', () => {
    expect(shouldTrack(now - 1000, now)).toBe(true)
    expect(shouldTrack(now - TRACK_WINDOW_MS - 1, now)).toBe(false)
  })
})
describe('roomStatus', () => {
  it('ativo se atividade recente, ocioso depois', () => {
    expect(roomStatus(now - 1000, now)).toBe('active')
    expect(roomStatus(now - IDLE_AFTER_MS - 1, now)).toBe('idle')
  })
})
describe('shouldDrop', () => {
  it('descarta após DROP_AFTER_MS sem atividade', () => {
    expect(shouldDrop(now - 1000, now)).toBe(false)
    expect(shouldDrop(now - DROP_AFTER_MS - 1, now)).toBe(true)
  })
})
