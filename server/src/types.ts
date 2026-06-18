export type AgentStatus = 'working' | 'idle' | 'done'

export interface Agent {
  id: string
  type: string
  label: string
  isVisitor: boolean
  status: AgentStatus
  activity: string
  speech: string
  tool: string | null
}

export interface OfficeState {
  sessionId: string | null
  project: string
  cwd: string
  status: 'active' | 'idle'
  agents: Agent[]
  updatedAt: string | null
}
