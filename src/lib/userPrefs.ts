// Preferências persistentes do utilizador

const KEY_PERITO          = 'addvaliador_perito'
const KEY_FILTERS         = 'addvaliador_property_filters'
const KEY_VISIBLE_COLS    = 'addvaliador_visible_cols'

export function getSavedPerito(): string {
  return localStorage.getItem(KEY_PERITO) || ''
}
export function savePerito(name: string) {
  localStorage.setItem(KEY_PERITO, name)
}

export interface PropertyFilters {
  search: string
  visitFilter: string
  billingFilter: string
  districtFilter: string[]
  parishFilter: string[]
  peritoFilter: string
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

// All available columns (key → label)
export const ALL_COLUMNS: Record<string, string> = {
  ref:                    'Ref.',
  external_ref:           'Ref. externa',
  id_registo_predial:     'Reg. Predial',
  id_registo_matricial:   'Reg. Matricial',
  fracao:                 'Fracção',
  street:                 'Rua',
  number:                 'Nº',
  block:                  'Bloco',
  floor_letter:           'Piso/Letra',
  postal_code:            'Cód. Postal',
  parish:                 'Freguesia',
  municipality:           'Concelho',
  district:               'Distrito',
  property_type:          'Tipo de Bem',
  property_subtype:       'Subtipo',
  use_type:               'Uso',
  use_subtype:            'Subuso',
  property_state:         'Estado Bem',
  typology:               'Tipologia',
  year_built:             'Ano Const.',
  area_m2:                'm² (N)',
  area_garage_m2:         'm² Garagem',
  area_annex_m2:          'm² Anexo',
  gross_area:             'Área bruta',
  useful_area:            'Área útil',
  land_area:              'Terreno',
  perito_avaliador:       'Perito Avaliador',
  visit_status:           'Estado visita',
  visit_date:             'Data visita',
  billing_status:         'Est. faturação',
  fee_amount:             'Honorário',
  po_number:              'Nº PO',
  invoice_number:         'Nº Fatura',
  payment_date:           'Dt. Pagamento',
  geo:                    'Geo',
}

// Default visible columns
const DEFAULT_VISIBLE = [
  'ref','external_ref','street','municipality','district',
  'property_type','typology','area_m2',
  'perito_avaliador','visit_status','billing_status','fee_amount'
]

export function getSavedVisibleCols(): string[] {
  try {
    const raw = localStorage.getItem(KEY_VISIBLE_COLS)
    return raw ? JSON.parse(raw) : DEFAULT_VISIBLE
  } catch { return DEFAULT_VISIBLE }
}
export function saveVisibleCols(cols: string[]) {
  localStorage.setItem(KEY_VISIBLE_COLS, JSON.stringify(cols))
}
