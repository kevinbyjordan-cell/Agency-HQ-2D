function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(s) {
  // operates on already-escaped text
  s = s.replace(/`([^`]+)`/g, (_, c) => '<code>' + c + '</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safe = /^(https?:\/\/|\/|\.\/|#|mailto:)/i.test(url) ? url : '#'
    return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + text + '</a>'
  })
  return s
}

export function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inCode = false
  let codeBuf = []
  let listType = null
  let para = []

  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + inline(para.join(' ')) + '</p>')
      para = []
    }
  }
  const closeList = () => {
    if (listType) {
      out.push('</' + listType + '>')
      listType = null
    }
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>')
        codeBuf = []
        inCode = false
      } else {
        flushPara()
        closeList()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }
    if (/^\s*$/.test(line)) {
      flushPara()
      closeList()
      continue
    }

    const esc = escapeHtml(line)
    const h = esc.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      closeList()
      out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>')
      continue
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara()
      closeList()
      out.push('<hr>')
      continue
    }
    const ul = esc.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      flushPara()
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push('<li>' + inline(ul[1]) + '</li>')
      continue
    }
    const ol = esc.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      flushPara()
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push('<li>' + inline(ol[1]) + '</li>')
      continue
    }
    const bq = esc.match(/^&gt;\s?(.*)$/)
    if (bq) {
      flushPara()
      closeList()
      out.push('<blockquote>' + inline(bq[1]) + '</blockquote>')
      continue
    }
    para.push(esc)
  }
  if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>')
  flushPara()
  closeList()
  return out.join('\n')
}
