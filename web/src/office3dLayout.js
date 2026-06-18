// Pure helpers for the 3D office — no Three.js import here so it stays unit-testable.

// Flatten the building (rooms → agents) into a flat placement list the 3D scene consumes.
// Each entry has a stable composite id (project:agentId) so the scene can diff across ticks.
export function flattenAgents(building) {
  const rooms = (building && building.rooms) || []
  const out = []
  rooms.forEach((room, roomIndex) => {
    const agents = room.agents || []
    agents.forEach((a) => {
      out.push({
        id: (room.project || 'room' + roomIndex) + ':' + a.id,
        label: a.label || a.type || 'agent',
        type: a.type || 'unknown',
        status: a.status || 'idle',
        speech: a.speech || '',
        isVisitor: !!a.isVisitor,
        project: room.project || '',
        roomIndex,
        roomStatus: room.status || 'idle',
      })
    })
  })
  return out
}

// Grid position (x,z) for the i-th agent, centered around the origin.
export function gridPosition(i, total, spacing = 3) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)))
  const rows = Math.max(1, Math.ceil(total / cols))
  const col = i % cols
  const row = Math.floor(i / cols)
  const x = (col - (cols - 1) / 2) * spacing
  const z = (row - (rows - 1) / 2) * spacing
  return { x, z, cols, rows }
}
