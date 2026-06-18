function groupByCategory(files) {
  const groups = new Map()
  for (const f of files) {
    if (!groups.has(f.category)) groups.set(f.category, { label: f.categoryLabel, items: [] })
    groups.get(f.category).items.push(f)
  }
  return [...groups.values()]
}

export function renderMemory(state, root) {
  const files = (state && state.files) || []
  const selected = (state && state.selected) || null
  root.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.className = 'mem'

  const list = document.createElement('div')
  list.className = 'mem__list'

  if (files.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mem__empty'
    empty.textContent = 'Nenhum arquivo de memória encontrado.'
    list.appendChild(empty)
  } else {
    for (const group of groupByCategory(files)) {
      const head = document.createElement('div')
      head.className = 'mem__grouphead'
      head.textContent = group.label
      list.appendChild(head)
      for (const f of group.items) {
        const item = document.createElement('button')
        item.className = 'mem__item' + (selected && selected.id === f.id ? ' mem__item--active' : '')
        item.setAttribute('data-mem-id', f.id)
        const name = document.createElement('span')
        name.className = 'mem__name'
        name.textContent = f.name
        const sub = document.createElement('span')
        sub.className = 'mem__sub'
        sub.textContent = f.relPath
        item.append(name, sub)
        list.appendChild(item)
      }
    }
  }

  const doc = document.createElement('div')
  doc.className = 'mem__doc'
  if (selected && selected.html != null) {
    const title = document.createElement('div')
    title.className = 'mem__doctitle'
    title.textContent = selected.name || ''
    const body = document.createElement('div')
    body.className = 'mem__docbody'
    body.innerHTML = selected.html
    doc.append(title, body)
  } else {
    const hint = document.createElement('div')
    hint.className = 'mem__hint'
    hint.textContent = 'Selecione um arquivo à esquerda para visualizar.'
    doc.appendChild(hint)
  }

  wrap.append(list, doc)
  root.appendChild(wrap)
}
