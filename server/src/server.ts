import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import chokidar from 'chokidar'
import { parseLine } from './parse'
import { reduce, initialState } from './reducer'
import { pickActiveSession, isSessionFile, type FileInfo } from './activeSession'
import { FileTailer } from './tail'
import type { OfficeState } from './types'

const PORT = Number(process.env.PORT ?? 4500)
const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects')
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web')
const IDLE_MS = 90_000

let state: OfficeState = initialState()
let activeFile: string | null = null
let tailer: FileTailer | null = null
let lastActivityMs = 0
const clients = new Set<WebSocket>()

function broadcast(): void {
  const msg = JSON.stringify({ type: 'state', state })
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

async function applyLines(lines: string[]): Promise<void> {
  for (const raw of lines) {
    const line = parseLine(raw)
    if (line) state = reduce(state, line)
  }
}

async function switchTo(file: string): Promise<void> {
  activeFile = file
  state = initialState()
  tailer = new FileTailer(file)
  await applyLines(await tailer.readNewLines())
  state.status = 'active'
  lastActivityMs = Date.now()
  console.log(`[hq] sessão ativa: ${file}`)
  broadcast()
}

async function onChange(): Promise<void> {
  const newest = pickActiveSession(await listSessionFiles())
  if (!newest) return
  if (newest !== activeFile) {
    await switchTo(newest)
    return
  }
  if (!tailer) return
  const lines = await tailer.readNewLines()
  if (lines.length === 0) return
  await applyLines(lines)
  state.status = 'active'
  lastActivityMs = Date.now()
  broadcast()
}

let pending = false
function scheduleChange(): void {
  if (pending) return
  pending = true
  setTimeout(() => {
    pending = false
    onChange().catch((e) => console.error('[hq] onChange', e))
  }, 150)
}

setInterval(() => {
  if (state.status === 'active' && Date.now() - lastActivityMs > IDLE_MS) {
    state = { ...state, status: 'idle' }
    broadcast()
  }
}, 2000)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0])
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
  ws.send(JSON.stringify({ type: 'state', state }))
  ws.on('close', () => clients.delete(ws))
})

async function main(): Promise<void> {
  const active = pickActiveSession(await listSessionFiles())
  if (active) await switchTo(active)
  const watcher = chokidar.watch(PROJECTS_ROOT, { ignoreInitial: true, depth: 5 })
  watcher.on('all', scheduleChange)
  server.listen(PORT, () => console.log(`[hq] Agency HQ em http://localhost:${PORT}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
