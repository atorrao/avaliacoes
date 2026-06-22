import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, VisitBadge, BillingBadge, EmptyState } from '@/components/ui'
import { Link, useSearchParams } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

export default function Properties() {
  const [params] = useSearchParams()
  const [search,         setSearch]         = useState('')
  const [visitFilter,    setVisitFilter]    = useState('')
  const [billingFilter,  setBillingFilter]  = useState('')
  const [districtFilter, setDistrictFilter] = useState('')
  const [parishFilter,   setParishFilter]   = useState('')
  const [peritoFilter,   setPeritoFilter]   = useState('')
  const [collapsed,      setCollapsed]      = useState<Record<string, boolean>>({})

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['properties-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('properties')
        .select(`
          id, ref, address, street, number, municipality, district, parish,
          postal_code, property_type, property_subtype, typology,
          gross_area, area_m2, visit_status, billing_status,
          fee_amount, perito_avaliador, updated_at,
          portfolios(id, name, clients(name))
        `)
        .order('portfolio_id')
        .order('ref')
      return (data || []) as any[]
    }
  })

  // Derived filter options
  const districts = useMemo(() => [...new Set(rows.map((r: any) => r.district).filter(Boolean))].sort(), [rows])
  const parishes  = useMemo(() => [...new Set(rows.filter((r: any) => !districtFilter || r.district === districtFilter).map((r: any) => r.parish).filter(Boolean))].sort(), [rows, districtFilter])
  const peritos   = useMemo(() => [...new Set(rows.map((r: any) => r.perito_avaliador).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => rows.filter((r: any) => {
    if (visitFilter   && r.visit_status     !== visitFilter)   return false
    if (billingFilter && r.billing_status   !== billingFilter) return false
    if (districtFilter && r.district        !== districtFilter) return false
    if (parishFilter  && r.parish           !== parishFilter)  return false
    if (peritoFilter  && r.perito_avaliador !== peritoFilter)  return false
    if (search) {
      const s = search.toLowerCase()
      return [r.ref, r.address, r.street, r.municipality, r.district, r.parish, r.typology, r.property_type, r.perito_avaliador]
        .some(v => v?.toLowerCase().includes(s))
    }
    return true
  }), [rows, visitFilter, billingFilter, districtFilter, parishFilter, peritoFilter, search])

  // Group by portfolio
  const grouped = useMemo(() => {
    const map: Record<string, { portfolio: any; items: any[] }> = {}
    filtered.forEach((r: any) => {
      const pid = r.portfolios?.id || 'sem-portfolio'
      if (!map[pid]) map[pid] = { portfolio: r.portfolios, items: [] }
      map[pid].items.push(r)
    })
    return Object.entries(map)
  }, [filtered])

  function toggleGroup(pid: string) {
    setCollapsed(prev => ({ ...prev, [pid]: !prev[pid] }))
  }

  const VISIT_LABELS: any = { pending: 'Por visitar', scheduled: 'Agendado', visited: 'Visitado', report_done: 'Report OK' }
  const BILLING_LABELS: any = { no_po: 'Sem PO', awaiting_po: 'A aguardar PO', po_received: 'PO recebida', invoice_pending: 'Fat. por emitir', invoice_issued: 'Fat. emitida', paid: 'Pago' }

  return (
    <div>
      <PageHeader
        title="Imóveis"
        subtitle={`${filtered.length} de ${rows.length} registos`}
        actions={<Link to="/import" className="btn btn-primary">Importar data-tape</Link>}
      />

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap gap-2">
        <input className="input max-w-[200px]" placeholder="Pesquisar ref, morada…"
          value={search} onChange={e => setSearch(e.target.value)} />

        <select className="input max-w-[160px]" value={districtFilter} onChange={e => { setDistrictFilter(e.target.value); setParishFilter('') }}>
          <option value="">Todos os distritos</option>
          {districts.map(d => <option key={d}>{d}</option>)}
        </select>

        <select className="input max-w-[160px]" value={parishFilter} onChange={e => setParishFilter(e.target.value)}>
          <option value="">Todas as freguesias</option>
          {parishes.map(p => <option key={p}>{p}</option>)}
        </select>

        <select className="input max-w-[160px]" value={peritoFilter} onChange={e => setPeritoFilter(e.target.value)}>
          <option value="">Todos os peritos</option>
          {peritos.map(p => <option key={p}>{p}</option>)}
        </select>

        <select className="input max-w-[160px]" value={visitFilter} onChange={e => setVisitFilter(e.target.value)}>
          <option value="">Estado visita</option>
          {Object.entries(VISIT_LABELS).map(([k,v]) => <option key={k} value={k}>{v as string}</option>)}
        </select>

        <select className="input max-w-[180px]" value={billingFilter} onChange={e => setBillingFilter(e.target.value)}>
          <option value="">Estado financeiro</option>
          {Object.entries(BILLING_LABELS).map(([k,v]) => <option key={k} value={k}>{v as string}</option>)}
        </select>

        {(districtFilter || parishFilter || peritoFilter || visitFilter || billingFilter || search) && (
          <button className="btn text-xs" onClick={() => { setSearch(''); setDistrictFilter(''); setParishFilter(''); setPeritoFilter(''); setVisitFilter(''); setBillingFilter('') }}>
            Limpar filtros
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">A carregar…</p>
        ) : grouped.length === 0 ? (
          <EmptyState message="Nenhum imóvel encontrado." />
        ) : (
          grouped.map(([pid, { portfolio, items }]) => {
            const isOpen = !collapsed[pid]
            const label  = portfolio ? `${portfolio.name}${portfolio.clients?.name ? ` — ${portfolio.clients.name}` : ''}` : 'Sem portfólio'
            return (
              <div key={pid} className="card overflow-hidden p-0">
                {/* Portfolio header */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100"
                  onClick={() => toggleGroup(pid)}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown size={15} className="text-gray-400"/> : <ChevronRight size={15} className="text-gray-400"/>}
                    <span className="text-sm font-semibold text-gray-700">
                      Data Tape + {label}
                    </span>
                    <span className="badge badge-gray">{items.length}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Ref.</th>
                          <th>Morada</th>
                          <th>Distrito</th>
                          <th>Freguesia</th>
                          <th>Tipo</th>
                          <th>Tipologia</th>
                          <th>Área (m²)</th>
                          <th>Perito</th>
                          <th>Visita</th>
                          <th>Financeiro</th>
                          <th>Honorário</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p: any) => (
                          <tr key={p.id}>
                            <td>
                              <Link to={`/properties/${p.id}`} className="text-brand-600 hover:underline font-medium">
                                {p.ref}
                              </Link>
                            </td>
                            <td className="text-gray-600 max-w-[180px] truncate">
                              {[p.street, p.number, p.municipality].filter(Boolean).join(', ') || p.address || '—'}
                            </td>
                            <td className="text-gray-600">{p.district || '—'}</td>
                            <td className="text-gray-600">{p.parish || '—'}</td>
                            <td className="text-gray-600">{p.property_type || '—'}</td>
                            <td className="text-gray-600">{p.typology || '—'}</td>
                            <td className="text-gray-600">{p.area_m2 || p.gross_area || '—'}</td>
                            <td className="text-gray-500 text-xs max-w-[100px] truncate">{p.perito_avaliador || '—'}</td>
                            <td><VisitBadge status={p.visit_status} /></td>
                            <td><BillingBadge status={p.billing_status} /></td>
                            <td className="text-gray-600">{p.fee_amount ? formatCurrency(p.fee_amount) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
