const LABELS: Record<string, string> = {
  orchestrator: 'Orquestrador',
  'arquiteto-de-projeto': 'Arquiteto',
  'auditor-seo': 'Auditor SEO',
  copywriter: 'Copywriter',
  'pesquisador-de-nicho': 'Pesquisador de nicho',
  'pesquisador-local': 'Pesquisador local',
  Explore: 'Explorador',
  'general-purpose': 'Generalista',
  Plan: 'Planejador',
}

export function labelForAgentType(type: string): string {
  return LABELS[type] ?? type
}
