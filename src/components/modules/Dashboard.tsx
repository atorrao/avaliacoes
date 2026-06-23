import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, KpiCard, VisitBadge, BillingBadge } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { Check, X, ChevronDown, Camera, GitCompare, CheckCircle2, Circle } from 'lucide-react'
import toast from 'react-hot-toast'

const VISIT_OPTIONS = [
  { value: 'pending',     label: 'Por visitar' },
  { value: 'scheduled',   label: 'Agendado' },
  { value: 'visited',     label: 'Visitado' },
  { value: 'report_done', label: 'Report OK' },
]

// Inline select for visit status
function InlineVisitSelect({ id, value, onSaved }: { id: string; value: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || 'pending')
  const qc = useQueryClient()

  async function save(newVal: string) {
    setVal(newVal)
    setEditing(false)
    const { error } = await supabase.from('properties').update({ visit_status: newVal }).eq('id', id)
    if (error) { toast.error('Erro ao guardar'); return }
    qc.invalidateQueries({ queryKey: ['dashboard-props'] })
    onSaved()
  }

  if (!editing) return (
    <div className="cursor-pointer" onClick={() => setEditing(true)}>
      <VisitBadge status={value} />
    </div>
  )

  return (
    <select
      autoFocus
      className="text-xs border border-brand-300 rounded px-1 py-0.5 focus:outline-none"
      value={val}
      onChange={e => save(e.target.value)}
      onBlur={() => setEditing(false)}
    >
      {VISIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// Inline toggle for boolean fields (fotos, comparáveis, verificado)
function InlineToggle({
  id, field, value, onSaved, trueLabel, falseLabel, trueColor
}: {
  id: string; field: string; value: boolean; onSaved: () => void
  trueLabel: string; falseLabel: string; trueColor: string
}) {
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()

  async function toggle() {
    setLoading(true)
    const { error } = await supabase.from('properties').update({ [field]: !value }).eq('id', id)
    setLoading(false)
    if (error) { toast.error('Erro ao guardar'); return }
    qc.invalidateQueries({ queryKey: ['dashboard-props'] })
    onSaved()
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={value ? `Marcar como: ${falseLabel}` : `Marcar como: ${trueLabel}`}
      className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-colors
        ${value ? trueColor : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
    >
      {value ? <CheckCircle2 size={11}/> : <Circle size={11}/>}
      {value ? trueLabel : falseLabel}
    </button>
  )
}

type FilterState = {
  search:    string
  visita:    string
  comps:     '' | 'sim' | 'nao'
  fotos:     '' | 'sim' | 'nao'
  verificado: '' | 'sim' | 'nao'
  perito:    string
}

export default function Dashboard() {
  const { role, name } = useAuth()
  const qc = useQueryClient()
  const [filters, setFilters] = useState<FilterState>({
    search: '', visita: '', comps: '', fotos: '', verificado: '', perito: ''
  })

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-props'],
    queryFn: async () => {
      // For perito role, filter by name. Admin sees all.
      let query = supabase
        .from('properties')
        .select(`
          id, ref, address, street, municipality, district,
          property_type, typology,
          visit_status, billing_status, fee_amount,
          perito_avaliador, updated_at,
          tem_fotos, tem_comparaveis, verificado,
          photos:photos(id),
          market_comps:market_comps(id)
        `)
        .order('updated_at', { ascending: false })

      if (role === 'perito' && name) {
        query = query.eq('perito_avaliador', name)
      }

      const { data } = await query
      return (data || []) as any[]
    }
  })

  const rows = data || []

  // KPI counts (all rows, before filter)
  const total     = rows.length
  const visited   = rows.filter((p: any) => p.visit_status !== 'pending').length
  const reportOk  = rows.filter((p: any) => p.visit_status === 'report_done').length
  const toReceive = rows
    .filter((p: any) => ['awaiting_po','po_received','invoice_pending','invoice_issued'].includes(p.billing_status))
    .reduce((s: number, p: any) => s + (p.fee_amount || 0), 0)
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0

  const peritos = useMemo(() =>
    [...new Set(rows.map((r: any) => r.perito_avaliador).filter(Boolean))].sort() as string[]
  , [rows])

  const filtered = useMemo(() => rows.filter((p: any) => {
    if (filters.search) {
      const s = filters.search.toLowerCase()
      if (![p.ref, p.address, p.street, p.municipality, p.district, p.property_type, p.perito_avaliador]
        .some((v: any) => v?.toLowerCase().includes(s))) return false
    }
    if (filters.visita && p.visit_status !== filters.visita) return false
    if (filters.perito && p.perito_avaliador !== filters.perito) return false

    // Fotos: check tem_fotos flag OR photos array
    const hasPhotos = p.tem_fotos || (p.photos && p.photos.length > 0)
    if (filters.fotos === 'sim' && !hasPhotos) return false
    if (filters.fotos === 'nao' && hasPhotos)  return false

    // Comparáveis: check tem_comparaveis flag OR market_comps array
    const hasComps = p.tem_comparaveis || (p.market_comps && p.market_comps.length > 0)
    if (filters.comps === 'sim' && !hasComps) return false
    if (filters.comps === 'nao' && hasComps)  return false

    // Verificado
    if (filters.verificado === 'sim' && !p.verificado) return false
    if (filters.verificado === 'nao' && p.verificado)  return false

    return true
  }), [rows, filters])

  function noop() {} // just to trigger re-render via invalidateQueries

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={role === 'perito' ? `Os meus imóveis — ${name}` : 'Visão geral do portfólio'} />
      <div className="p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Total portfólio"    value={total}                     sub="imóveis" />
          <KpiCard label="Visitados"          value={`${pct}%`}                 sub={`${visited} de ${total}`} color="green" />
          <KpiCard label="Reports concluídos" value={reportOk}                  sub="imóveis" color="green" />
          <KpiCard label="A receber"          value={formatCurrency(toReceive)} sub="PO + faturas" color={toReceive > 0 ? 'amber' : 'default'} />
        </div>

        {/* Progress bar */}
        <div className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 font-medium">Progresso do portfólio</span>
            <span className="text-gray-500">{visited} / {total} visitados</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Filters + table */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">
              Imóveis{role === 'perito' ? ' atribuídos' : ''} ({filtered.length})
            </h2>
            <Link to="/properties" className="text-xs text-brand-600 hover:underline">Gestão completa →</Link>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              className="input text-sm"
              placeholder="Pesquisar ref., morada…"
              value={filters.search}
              onChange={e => setFilters(f => ({...f, search: e.target.value}))}
            />

            <select className="input text-sm" value={filters.visita} onChange={e => setFilters(f => ({...f, visita: e.target.value}))}>
              <option value="">Visita: todas</option>
              {VISIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <select className="input text-sm" value={filters.fotos} onChange={e => setFilters(f => ({...f, fotos: e.target.value as any}))}>
              <option value="">Fotos: todas</option>
              <option value="sim">Com fotos</option>
              <option value="nao">Sem fotos</option>
            </select>

            <select className="input text-sm" value={filters.comps} onChange={e => setFilters(f => ({...f, comps: e.target.value as any}))}>
              <option value="">Comparáveis: todos</option>
              <option value="sim">Com comparáveis</option>
              <option value="nao">Sem comparáveis</option>
            </select>

            <select className="input text-sm" value={filters.verificado} onChange={e => setFilters(f => ({...f, verificado: e.target.value as any}))}>
              <option value="">Verificado: todos</option>
              <option value="sim">Verificado</option>
              <option value="nao">Por verificar</option>
            </select>

            {role === 'admin' && (
              <select className="input text-sm" value={filters.perito} onChange={e => setFilters(f => ({...f, perito: e.target.value}))}>
                <option value="">Todos os peritos</option>
                {peritos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            {Object.values(filters).some(Boolean) && (
              <button className="text-xs text-gray-400 hover:text-gray-600 px-2" onClick={() => setFilters({ search:'', visita:'', comps:'', fotos:'', verificado:'', perito:'' })}>
                Limpar filtros
              </button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 py-6 text-center">A carregar…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Nenhum imóvel encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Ref.</th>
                    <th>Localização</th>
                    <th>Tipo</th>
                    {role === 'admin' && <th>Perito</th>}
                    <th>Visita</th>
                    <th>Financeiro</th>
                    <th>Honorário</th>
                    <th className="text-center">Fotos</th>
                    <th className="text-center">Comparáveis</th>
                    <th className="text-center">Verificado</th>
                    <th>Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p: any) => {
                    const hasPhotos = p.tem_fotos || (p.photos && p.photos.length > 0)
                    const hasComps  = p.tem_comparaveis || (p.market_comps && p.market_comps.length > 0)
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/properties/${p.id}`} className="text-brand-600 hover:underline font-medium">
                            {p.ref}
                          </Link>
                        </td>
                        <td className="text-gray-600 max-w-[160px] truncate">
                          {p.municipality || p.address || '—'}
                        </td>
                        <td className="text-gray-600 whitespace-nowrap">
                          {[p.property_type, p.typology].filter(Boolean).join(' ') || '—'}
                        </td>
                        {role === 'admin' && (
                          <td className="text-gray-500 text-xs whitespace-nowrap">{p.perito_avaliador || '—'}</td>
                        )}
                        <td>
                          <InlineVisitSelect id={p.id} value={p.visit_status} onSaved={noop} />
                        </td>
                        <td><BillingBadge status={p.billing_status} /></td>
                        <td className="text-gray-600 whitespace-nowrap">
                          {p.fee_amount ? formatCurrency(p.fee_amount) : '—'}
                        </td>
                        <td className="text-center">
                          <InlineToggle
                            id={p.id} field="tem_fotos" value={!!hasPhotos} onSaved={noop}
                            trueLabel="Sim" falseLabel="Não"
                            trueColor="bg-blue-100 text-blue-600 hover:bg-blue-200"
                          />
                        </td>
                        <td className="text-center">
                          <InlineToggle
                            id={p.id} field="tem_comparaveis" value={!!hasComps} onSaved={noop}
                            trueLabel="Sim" falseLabel="Não"
                            trueColor="bg-purple-100 text-purple-600 hover:bg-purple-200"
                          />
                        </td>
                        <td className="text-center">
                          <InlineToggle
                            id={p.id} field="verificado" value={!!p.verificado} onSaved={noop}
                            trueLabel="Sim" falseLabel="Não"
                            trueColor="bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                          />
                        </td>
                        <td className="text-gray-400 whitespace-nowrap">{formatDate(p.updated_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
