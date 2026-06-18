const ACTIVITY: Record<string, string> = {
  Read: 'Lendo arquivos',
  Grep: 'Buscando no código',
  Glob: 'Procurando arquivos',
  Bash: 'Rodando comando',
  PowerShell: 'Rodando comando',
  Write: 'Escrevendo arquivo',
  Edit: 'Editando arquivo',
  WebSearch: 'Pesquisando na web',
  WebFetch: 'Lendo uma página',
  Skill: 'Usando uma skill',
  Task: 'Delegando a um agente',
  Agent: 'Delegando a um agente',
  AskUserQuestion: 'Perguntando a você',
}

export function toolActivity(tool: string): string {
  return ACTIVITY[tool] ?? `Usando ${tool}`
}
