import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface MemoryRoot {
  category: string
  label: string
  dir: string
  /** 'md' = any *.md file; otherwise an exact filename to match (e.g. 'CLAUDE.md') */
  match: 'md' | string
  maxDepth: number
}

export interface MemoryFile {
  id: string
  category: string
  categoryLabel: string
  name: string
  relPath: string
  /** absolute path — server-internal, never serialized to clients */
  absPath: string
  mtimeMs: number
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.next'])
const MAX_CONTENT_BYTES = 400_000

const CATEGORY_ORDER = ['memory', 'agents', 'skills', 'instructions']

export function memoryRoots(home: string, workspace: string): MemoryRoot[] {
  const claude = path.join(home, '.claude')
  return [
    { category: 'memory', label: 'Memória', dir: path.join(claude, 'projects'), match: 'md', maxDepth: 3 },
    { category: 'agents', label: 'Agentes', dir: path.join(claude, 'agents'), match: 'md', maxDepth: 2 },
    { category: 'skills', label: 'Skills', dir: path.join(claude, 'skills'), match: 'md', maxDepth: 3 },
    { category: 'instructions', label: 'Instruções', dir: workspace, match: 'CLAUDE.md', maxDepth: 2 },
  ]
}

function matches(name: string, match: string): boolean {
  if (match === 'md') return name.toLowerCase().endsWith('.md')
  return name === match
}

async function walk(dir: string, match: string, maxDepth: number, depth: number, out: string[]): Promise<void> {
  if (depth > maxDepth) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(path.join(dir, e.name), match, maxDepth, depth + 1, out)
    } else if (matches(e.name, match)) {
      out.push(path.join(dir, e.name))
    }
  }
}

function makeId(category: string, relPath: string): string {
  return category + '/' + relPath.split(path.sep).join('/')
}

export async function buildMemoryIndex(roots: MemoryRoot[]): Promise<MemoryFile[]> {
  const files: MemoryFile[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    const found: string[] = []
    await walk(root.dir, root.match, root.maxDepth, 0, found)
    for (const abs of found) {
      const relPath = path.relative(root.dir, abs)
      const id = makeId(root.category, relPath)
      if (seen.has(id)) continue
      seen.add(id)
      let mtimeMs = 0
      try {
        mtimeMs = (await fs.stat(abs)).mtimeMs
      } catch {
        continue
      }
      files.push({
        id,
        category: root.category,
        categoryLabel: root.label,
        name: path.basename(abs),
        relPath: relPath.split(path.sep).join('/'),
        absPath: abs,
        mtimeMs,
      })
    }
  }
  files.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category)
    const cb = CATEGORY_ORDER.indexOf(b.category)
    if (ca !== cb) return ca - cb
    return a.name.localeCompare(b.name)
  })
  return files
}

export async function readMemoryFile(
  roots: MemoryRoot[],
  id: string,
): Promise<{ file: MemoryFile; content: string } | null> {
  const files = await buildMemoryIndex(roots)
  const file = files.find((f) => f.id === id)
  if (!file) return null
  try {
    let content = await fs.readFile(file.absPath, 'utf8')
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      content = content.slice(0, MAX_CONTENT_BYTES) + '\n\n…(truncado)'
    }
    return { file, content }
  } catch {
    return null
  }
}

/** strip absPath before serializing to the client */
function publicFile(f: MemoryFile) {
  return { id: f.id, category: f.category, categoryLabel: f.categoryLabel, name: f.name, relPath: f.relPath, mtimeMs: f.mtimeMs }
}

export async function memoryResponse(
  roots: MemoryRoot[],
  pathname: string,
  query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/memory') {
    const files = await buildMemoryIndex(roots)
    return { status: 200, body: { files: files.map(publicFile) } }
  }
  if (pathname === '/api/memory/content') {
    const id = query.get('id') ?? ''
    const res = await readMemoryFile(roots, id)
    if (!res) return { status: 404, body: { error: 'not found' } }
    return { status: 200, body: { file: publicFile(res.file), content: res.content } }
  }
  return { status: 404, body: { error: 'not found' } }
}
