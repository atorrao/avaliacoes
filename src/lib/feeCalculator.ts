// Calcula o honorário com base no precário ABANCA 2026
// Mapeia os valores do campo TIPO_BIEN do ficheiro ABANCA para as actividades do precário

interface FeeRule {
  activity: string
  area_min: number
  area_max: number | null
  area_unit: string
  price: number
}

// Normaliza strings: minúsculas, sem acentos, sem espaços extra
function norm(s: string): string {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

// Mapeamento dos valores TIPO_BIEN do ABANCA → actividade do precário
// Os valores em espanhol vêm directamente do ficheiro Excel da data-tape
const BIEN_TO_ACTIVITY: Record<string, string> = {
  // Habitação
  'vivienda':                          'Apartamento',
  'piso':                              'Apartamento',
  'apartamento':                       'Apartamento',
  'apto':                              'Apartamento',
  'fracao':                            'Apartamento',
  'fracao autonoma':                   'Apartamento',
  'fração':                            'Apartamento',
  'fração autonoma':                   'Apartamento',
  'atico':                             'Apartamento',
  'duplex':                            'Apartamento',
  'estudio':                           'Apartamento',
  'chalet adosado':                    'Moradias em banda',
  'chalet pareado':                    'Moradias em banda',
  'moradia em banda':                  'Moradias em banda',
  'casa adosada':                      'Moradias em banda',
  'chalet':                            'Moradias unifamiliares',
  'casa':                              'Moradias unifamiliares',
  'moradia':                           'Moradias unifamiliares',
  'moradia unifamiliar':               'Moradias unifamiliares',
  'moradia isolada':                   'Moradias unifamiliares',
  'vivenda':                           'Moradias unifamiliares',
  // Garagem / Arrumos
  'garaje':                            'Garagem',
  'garagem':                           'Garagem',
  'plaza de garaje':                   'Garagem',
  'trastero':                          'Arrumos',
  'arrumos':                           'Arrumos',
  'arrecadacao':                       'Arrumos',
  // Comércio / Escritório
  'local comercial':                   'Loja',
  'local':                             'Loja',
  'loja':                              'Loja',
  'comercio':                          'Comércio',
  'comércio':                          'Comércio',
  'oficina':                           'Escritórios',
  'escritorio':                        'Escritórios',
  'escritório':                        'Escritórios',
  // Industrial
  'nave industrial':                   'Naves industriais',
  'naves industriais':                 'Naves industriais',
  'armazem':                           'Armazém',
  'armazém':                           'Armazém',
  // Terrenos
  'terreno finca rustica':             'Terreno rústico',
  'terreno finca rústica':             'Terreno rústico',
  'finca rustica':                     'Terreno rústico',
  'finca rústica':                     'Terreno rústico',
  'terreno rustico':                   'Terreno rústico',
  'terreno rústico':                   'Terreno rústico',
  'terreno finca urbana':              'Terreno urbano',
  'terreno urbano':                    'Terreno urbano',
  'solar':                             'Terreno urbano',
  'terreno':                           'Terreno urbano',
  // Outros
  'habitacao':                         'Habitação',
  'habitação':                         'Habitação',
  'edificio':                          'Edifício',
  'edifício':                          'Edifício',
}

export function calculateFee(
  propertyType: string | null,
  area: number | null,
  rules: FeeRule[]
): number | null {
  if (!propertyType || !rules.length) return null

  const key      = norm(propertyType)
  const activity = BIEN_TO_ACTIVITY[key] || propertyType

  // Encontra regras para esta actividade
  const matching = rules.filter(r =>
    norm(r.activity) === norm(activity)
  )
  if (!matching.length) {
    // Segunda tentativa: correspondência parcial
    const partial = rules.filter(r =>
      norm(r.activity).includes(key) || key.includes(norm(r.activity))
    )
    if (!partial.length) return null
    if (partial.length === 1) return partial[0].price
    // Se múltiplas regras parciais, usa a área
    const a = area || 0
    const rule = partial.find(r =>
      a >= r.area_min && (r.area_max === null || a < r.area_max)
    )
    return rule?.price ?? partial[0].price
  }

  // Regra única (sem dependência de área)
  if (matching.length === 1) return matching[0].price

  // Dependente de área: encontra o escalão correcto
  const a = area || 0
  const rule = matching.find(r =>
    a >= r.area_min && (r.area_max === null || a < r.area_max)
  )
  // Se não encontrar escalão, devolve o último (área máxima)
  return rule?.price ?? matching[matching.length - 1].price
}

// Honorários fixos ABANCA 2026 (fallback quando não há tabela na BD)
// Usados apenas se fee_schedules estiver vazia
export const ABANCA_FEES_DEFAULT: Record<string, number> = {
  'Apartamento':            120,
  'Moradias unifamiliares': 150,
  'Moradias em banda':      130,
  'Garagem':                 95,
  'Arrumos':                 75,
  'Loja':                   130,
  'Comércio':               130,
  'Escritórios':            130,
  'Naves industriais':      180,
  'Armazém':                160,
  'Terreno rústico':        140,
  'Terreno urbano':         130,
  'Habitação':              120,
  'Edifício':               250,
}

export function calculateFeeWithFallback(
  propertyType: string | null,
  area: number | null,
  rules: FeeRule[]
): number | null {
  // Tenta com regras da BD
  const feeFromRules = calculateFee(propertyType, area, rules)
  if (feeFromRules !== null) return feeFromRules

  // Fallback: tabela fixa
  if (!propertyType) return null
  const key      = norm(propertyType)
  const activity = BIEN_TO_ACTIVITY[key] || propertyType
  return ABANCA_FEES_DEFAULT[activity] ?? null
}
