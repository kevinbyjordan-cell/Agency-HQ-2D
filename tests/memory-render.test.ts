// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderMemory } from '../web/src/memory.js'

let root: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  root = document.getElementById('root')!
})

const files = [
  { id: 'memory/a/memory/MEMORY.md', category: 'memory', categoryLabel: 'Memória', name: 'MEMORY.md', relPath: 'a/memory/MEMORY.md' },
  { id: 'agents/researcher.md', category: 'agents', categoryLabel: 'Agentes', name: 'researcher.md', relPath: 'researcher.md' },
]

describe('renderMemory', () => {
  it('groups files by category label', () => {
    renderMemory({ files, selected: null }, root)
    const heads = [...root.querySelectorAll('.mem__grouphead')].map((e) => e.textContent)
    expect(heads).toContain('Memória')
    expect(heads).toContain('Agentes')
    expect(root.querySelectorAll('[data-mem-id]').length).toBe(2)
  })

  it('marks the selected file active and renders its html', () => {
    renderMemory({ files, selected: { id: files[0].id, name: 'MEMORY.md', html: '<h1>Index</h1>' } }, root)
    const active = root.querySelector('.mem__item--active')
    expect(active?.getAttribute('data-mem-id')).toBe(files[0].id)
    expect(root.querySelector('.mem__doc')?.innerHTML).toContain('<h1>Index</h1>')
  })

  it('shows an empty hint when nothing is selected', () => {
    renderMemory({ files, selected: null }, root)
    expect(root.querySelector('.mem__doc')?.textContent).toMatch(/selecione/i)
  })

  it('shows a placeholder when there are no files', () => {
    renderMemory({ files: [], selected: null }, root)
    expect(root.querySelector('.mem__empty')).not.toBeNull()
  })
})
