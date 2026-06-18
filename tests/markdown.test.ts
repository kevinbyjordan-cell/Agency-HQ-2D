import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../web/src/markdown.js'

describe('renderMarkdown', () => {
  it('escapes HTML to prevent injection', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders headings by level', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>')
    expect(renderMarkdown('### Sub')).toContain('<h3>Sub</h3>')
  })

  it('renders bold, italic and inline code', () => {
    expect(renderMarkdown('a **b** c')).toContain('<strong>b</strong>')
    expect(renderMarkdown('a *b* c')).toContain('<em>b</em>')
    expect(renderMarkdown('use `code` here')).toContain('<code>code</code>')
  })

  it('renders unordered lists', () => {
    const html = renderMarkdown('- one\n- two')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
  })

  it('renders fenced code blocks without applying inline rules inside', () => {
    const html = renderMarkdown('```\n**not bold**\n```')
    expect(html).toContain('<pre><code>')
    expect(html).toContain('**not bold**')
    expect(html).not.toContain('<strong>')
  })

  it('renders safe links and neutralizes javascript: urls', () => {
    expect(renderMarkdown('[x](https://a.com)')).toContain('href="https://a.com"')
    const bad = renderMarkdown('[x](javascript:alert(1))')
    expect(bad).not.toContain('javascript:')
  })
})
