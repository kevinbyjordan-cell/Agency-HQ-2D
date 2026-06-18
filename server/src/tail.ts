import { promises as fs } from 'node:fs'

export class FileTailer {
  private offset = 0
  private buffer = ''
  private lastMtimeMs = -1

  constructor(private readonly path: string) {}

  async readNewLines(): Promise<string[]> {
    let stat
    try {
      stat = await fs.stat(this.path)
    } catch {
      return []
    }

    // Reset on truncation (size went down) or overwrite (mtime changed but size <= offset)
    const truncated = stat.size < this.offset
    const overwritten =
      this.lastMtimeMs >= 0 &&
      stat.mtimeMs !== this.lastMtimeMs &&
      stat.size <= this.offset

    if (truncated || overwritten) {
      this.offset = 0
      this.buffer = ''
    }

    this.lastMtimeMs = stat.mtimeMs

    if (stat.size === this.offset) return []

    const length = stat.size - this.offset
    const fd = await fs.open(this.path, 'r')
    try {
      const buf = Buffer.alloc(length)
      await fd.read(buf, 0, length, this.offset)
      this.offset = stat.size
      this.buffer += buf.toString('utf8')
    } finally {
      await fd.close()
    }

    const parts = this.buffer.split('\n')
    this.buffer = parts.pop() ?? ''
    return parts.filter((l) => l.length > 0)
  }
}
