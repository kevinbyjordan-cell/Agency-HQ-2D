export function connect(onBuilding) {
  let ws
  function open() {
    ws = new WebSocket(`ws://${location.host}`)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'building') onBuilding(msg.building)
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => setTimeout(open, 1000)
  }
  open()
}
