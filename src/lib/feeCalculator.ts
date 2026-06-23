// Calcula o honorário com base no precário ABANCA
// activity = property_type do imóvel
// area = area_m2 ou gross_area

interface FeeRule {
  activity: string
  area_min: number
  area_max: number | null
  area_unit: string
  price: number
}

// Normaliza o tipo de imóvel para corresponder às actividades do precário
const TYPE_MAP: Record<string, string> = {
  'apartamento': 'Apartamento',
  'apto': 'Apartamento',
  'fração': 'Apartamento',
  'fracao': 'Apartamento',
  'moradia': 'Moradia',
  'moradia unifamiliar': 'Moradias unifamiliares',
  'moradia em banda': 'Moradias em banda',
  'loja': 'Loja',
  'comércio': 'Comércio',
  'comercio': 'Comércio',
  'escritório': 'Escritórios',
  'escritorio': 'Escritórios',
  'armazém': 'Armazém',
  'armazem': 'Armazém',
  'garagem': 'Garagem',
  'arrumos': 'Arrumos',
  'terreno rústico': 'Terreno rústico',
  'terreno rustico': 'Terreno rústico',
  'terreno urbano': 'Terreno urbano',
  'terreno': 'Terreno urbano',
  'nave industrial': 'Naves industriais',
  'naves industriais': 'Naves industriais',
  'habitação': 'Habitação',
  'habitacao': 'Habitação',
}

export function calculateFee(
  propertyType: string | null,
  area: number | null,
  rules: FeeRule[]
): number | null {
  if (!propertyType || !rules.length) return null

  const norm  = propertyType.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const activity = TYPE_MAP[norm] || propertyType

  // Find matching rules for this activity
  const matching = rules.filter(r =>
    r.activity.toLowerCase() === activity.toLowerCase()
  )
  if (!matching.length) return null

  // If single rule (no area dependency), return that price
  if (matching.length === 1) return matching[0].price

  // Area-dependent: find the right bracket
  const a = area || 0
  const rule = matching.find(r =>
    a >= r.area_min && (r.area_max === null || a < r.area_max)
  )
  return rule?.price ?? null
}
