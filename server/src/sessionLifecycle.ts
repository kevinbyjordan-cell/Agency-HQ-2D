export const IDLE_AFTER_MS = 90_000
export const DROP_AFTER_MS = 20 * 60_000
export const TRACK_WINDOW_MS = 12 * 60_000

export function shouldTrack(mtimeMs: number, now: number): boolean {
  return now - mtimeMs <= TRACK_WINDOW_MS
}

export function roomStatus(lastActivityMs: number, now: number): 'active' | 'idle' {
  return now - lastActivityMs <= IDLE_AFTER_MS ? 'active' : 'idle'
}

export function shouldDrop(lastActivityMs: number, now: number): boolean {
  return now - lastActivityMs > DROP_AFTER_MS
}
