import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import chokidar from 'chokidar'
import { parseLine } from './parse'
import { reduce, initialState } from './reducer'
import { isSessionFile, type FileInfo } from './activeSession'
import { FileTailer } from './tail'
import { shouldTrack, shouldDrop } from './sessionLifecycle'
import { groupByProject } from './projectRooms'
import type { OfficeState } from './types'
import { dashboardSummary } from './dashboard'
import { memoryRoots, memoryResponse } from './memory'
import { sessionsResponse } from './sessions'
import { activityResponse } from './activity'
import { subAgentsResponse } from './subagents'

const PORT = Number(process.env.PORT ?? 4500)
const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects')
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web')
// agency-hq lives at <workspace>/agency-hq; the workspace holds the orchestrator CLAUDE.md
const WORKSPACE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MEMORY_ROOTS = memoryRoots(os.homedir(), WORKSPACE)

interface Tracked {
  tailer: FileTailer
  state: OfficeState
  lastActivityMs: number
}

const sessions = new Map<string, Tracked>()
const clients = new Set<WebSocket>()

function snapshot(now: number): string {
  const snaps = [...sessions.values()].map((t) => ({ state: t.state, lastActivityMs: t.lastActivityMs }))
  const rooms = groupByProject(snaps, now)
  const iso = new Date(now).toISOString()
  return JSON.stringify({
    type: 'building',
    building: { rooms, updatedAt: iso },
    dashboard: dashboardSummary(rooms, iso),
  })
}

function broadcast(now: number): void {
  const msg = snapshot(now)
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg)
}

async function listSessionFiles(): Promise<FileInfo[]> {
  const out: FileInfo[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.name.endsWith('.jsonl') && isSessionFile(p)) {
        try {
          const st = await fs.stat(p)
          out.push({ path: p, mtimeMs: st.mtimeMs })
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(PROJECTS_ROOT)
  return out
}

async function ingest(t: Tracked): Promise<boolean> {
  const lines = await t.tailer.readNewLines()
  if (lines.length === 0) return false
  for (const raw of lines) {
    const line = parseLine(raw)
    if (line) t.state = reduce(t.state, line)
  }
  return true
}

async function reconcile(now: number): Promise<void> {
  const files = await listSessionFiles()
  for (const f of files) {
    if (!shouldTrack(f.mtimeMs, now)) continue
    let t = sessions.get(f.path)
    if (!t) {
      t = { tailer: new FileTailer(f.path), state: initialState(), lastActivityMs: f.mtimeMs }
      sessions.set(f.path, t)
      await ingest(t)
    } else if (await ingest(t)) {
      t.lastActivityMs = now
    }
  }
  for (const [p, t] of sessions) {
    if (shouldDrop(t.lastActivityMs, now)) sessions.delete(p)
  }
  broadcast(now)
}

let pending = false
function scheduleReconcile(): void {
  if (pending) return
  pending = true
  setTimeout(() => {
    pending = false
    reconcile(Date.now()).catch((e) => console.error('[hq] reconcile', e))
  }, 150)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === '/api/memory' || pathname === '/api/memory/content') {
    const r = await memoryResponse(MEMORY_ROOTS, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }

  if (pathname === '/api/sessions' || pathname === '/api/sessions/transcript') {
    const r = await sessionsResponse(PROJECTS_ROOT, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }

  if (pathname === '/api/activity') {
    const r = await activityResponse(PROJECTS_ROOT, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }

  if (pathname === '/api/subagents') {
    const r = await subAgentsResponse(PROJECTS_ROOT, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }

  let p = pathname
  if (p === '/') p = '/index.html'
  const file = path.join(WEB_DIR, p)
  if (!file.startsWith(WEB_DIR)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  try {
    const data = await fs.readFile(file)
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

const wss = new WebSocketServer({ server })
wss.on('connection', (ws) => {
  clients.add(ws)
  ws.send(snapshot(Date.now()))
  ws.on('close', () => clients.delete(ws))
})

async function main(): Promise<void> {
  await reconcile(Date.now())
  const watcher = chokidar.watch(PROJECTS_ROOT, { ignoreInitial: true, depth: 5 })
  watcher.on('all', scheduleReconcile)
  setInterval(() => reconcile(Date.now()).catch((e) => console.error('[hq] tick', e)), 3000)
  server.listen(PORT, () => console.log(`[hq] Agency HQ em http://localhost:${PORT}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
