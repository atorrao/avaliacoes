// Preferências do utilizador guardadas em localStorage
// Perito Avaliador configurado globalmente

const KEY_PERITO  = 'addvaliador_perito'
const KEY_FILTERS = 'addvaliador_property_filters'

export function getSavedPerito(): string {
  return localStorage.getItem(KEY_PERITO) || ''
}
export function savePerito(name: string) {
  localStorage.setItem(KEY_PERITO, name)
}

export interface PropertyFilters {
  search:        string
  visitFilter:   string
  billingFilter: string
  districtFilter: string[]
  parishFilter:   string[]
  peritoFilter:   string
}
const DEFAULT_FILTERS: PropertyFilters = {
  search:'', visitFilter:'', billingFilter:'',
  districtFilter:[], parishFilter:[], peritoFilter:''
}
export function getSavedFilters(): PropertyFilters {
  try {
    const raw = localStorage.getItem(KEY_FILTERS)
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS
  } catch { return DEFAULT_FILTERS }
}
export function saveFilters(f: PropertyFilters) {
  localStorage.setItem(KEY_FILTERS, JSON.stringify(f))
}
export function clearFilters() {
  localStorage.removeItem(KEY_FILTERS)
}
