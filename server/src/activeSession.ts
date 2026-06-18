export interface FileInfo {
  path: string
  mtimeMs: number
}

export function isSessionFile(p: string): boolean {
  if (!p.endsWith('.jsonl')) return false
  const norm = p.replace(/\\/g, '/')
  if (norm.includes('/subagents/')) return false
  return true
}

export function pickActiveSession(files: FileInfo[]): string | null {
  const sessions = files.filter((f) => isSessionFile(f.path))
  if (sessions.length === 0) return null
  return sessions.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a)).path
}
