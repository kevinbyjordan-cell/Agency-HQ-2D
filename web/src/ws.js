export function connect(onUpdate) {
  let ws
  function open() {
    ws = new WebSocket(`ws://${location.host}`)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'building') onUpdate(msg)
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => setTimeout(open, 1000)
  }
  open()
}
