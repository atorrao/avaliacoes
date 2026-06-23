import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, VisitBadge, BillingBadge, EmptyState } from '@/components/ui'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import { ChevronDown, ChevronRight, Trash2, CheckSquare, Square } from 'lucide-react'
import toast from 'react-hot-toast'

const VISIT_LABELS: Record<string,string>   = { pending:'Por visitar', scheduled:'Agendado', visited:'Visitado', report_done:'Report OK' }
const BILLING_LABELS: Record<string,string> = { no_po:'Sem PO', awaiting_po:'A aguardar PO', po_received:'PO recebida', invoice_pending:'Fat. por emitir', invoice_issued:'Fat. emitida', paid:'Pago' }

// Multi-select dropdown component
function MultiSelect({ label, options, selected, onChange }: { label:string; options:string[]; selected:string[]; onChange:(v:string[])=>void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v])
  }

  const display = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} seleccionados`

  return (
    <div ref={ref} className="relative">
      <button className="input text-left flex items-center justify-between gap-2 min-w-[160px]" onClick={() => setOpen(o => !o)}>
        <span className={`truncate text-sm ${selected.length ? 'text-gray-900' : 'text-gray-400'}`}>{display}</span>
        <ChevronDown size={13} className="flex-shrink-0 text-gray-400"/>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2">Sem opções</p>
          ) : (
            <>
              <button className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                onClick={() => onChange([])}>Limpar selecção</button>
              {options.map(o => (
                <button key={o} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2" onClick={() => toggle(o)}>
                  {selected.includes(o) ? <CheckSquare size={14} className="text-brand-400"/> : <Square size={14} className="text-gray-300"/>}
                  {o}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Properties() {
  const qc = useQueryClient()
  const [search,          setSearch]          = useState('')
  const [visitFilter,     setVisitFilter]     = useState('')
  const [billingFilter,   setBillingFilter]   = useState('')
  const [districtFilter,  setDistrictFilter]  = useState<string[]>([])
  const [parishFilter,    setParishFilter]    = useState<string[]>([])
  const [peritoFilter,    setPeritoFilter]    = useState('')
  const [collapsed,       setCollapsed]       = useState<Record<string,boolean>>({})
  const [selected,        setSelected]        = useState<Set<string>>(new Set())
  const [bulkVisit,       setBulkVisit]       = useState('')
  const [bulkBilling,     setBulkBilling]     = useState('')
  const [showBulk,        setShowBulk]        = useState(false)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['properties-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('properties')
        .select('id, ref, address, street, number, municipality, district, parish, postal_code, property_type, typology, area_m2, gross_area, visit_status, billing_status, fee_amount, perito_avaliador, updated_at, portfolios(id, name, clients(name))')
        .order('portfolio_id').order('ref')
      return (data||[]) as any[]
    }
  })

  const districts = useMemo(() => [...new Set(rows.map((r: any) => r.district).filter(Boolean))].sort(), [rows])
  const parishes  = useMemo(() => {
    const base = districtFilter.length ? rows.filter((r: any) => districtFilter.includes(r.district)) : rows
    return [...new Set(base.map((r: any) => r.parish).filter(Boolean))].sort()
  }, [rows, districtFilter])
  const peritos   = useMemo(() => [...new Set(rows.map((r: any) => r.perito_avaliador).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => rows.filter((r: any) => {
    if (visitFilter                           && r.visit_status     !== visitFilter)            return false
    if (billingFilter                          && r.billing_status   !== billingFilter)           return false
    if (districtFilter.length                  && !districtFilter.includes(r.district))           return false
    if (parishFilter.length                    && !parishFilter.includes(r.parish))               return false
    if (peritoFilter                           && r.perito_avaliador !== peritoFilter)            return false
    if (search) {
      const s = search.toLowerCase()
      return [r.ref, r.address, r.street, r.municipality, r.district, r.parish, r.typology, r.property_type, r.perito_avaliador]
        .some(v => v?.toLowerCase().includes(s))
    }
    return true
  }), [rows, visitFilter, billingFilter, districtFilter, parishFilter, peritoFilter, search])

  const grouped = useMemo(() => {
    const map: Record<string,{portfolio:any;items:any[]}> = {}
    filtered.forEach((r: any) => {
      const pid = r.portfolios?.id || 'sem-portfolio'
      if (!map[pid]) map[pid] = { portfolio: r.portfolios, items:[] }
      map[pid].items.push(r)
    })
    return Object.entries(map)
  }, [filtered])

  function toggleGroup(pid: string) { setCollapsed(prev => ({...prev, [pid]: !prev[pid]})) }

  // Selection
  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAll() {
    const allIds = filtered.map((r: any) => r.id)
    setSelected(prev => prev.size === allIds.length ? new Set() : new Set(allIds))
  }
  function selectGroup(items: any[]) {
    const ids = items.map((i: any) => i.id)
    const allSelected = ids.every(id => selected.has(id))
    setSelected(prev => { const n = new Set(prev); allSelected ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n })
  }

  // Bulk update
  const bulkUpdate = useMutation({
    mutationFn: async ({ field, value }: { field:string; value:string }) => {
      const ids = [...selected]
      for (let i = 0; i < ids.length; i += 50) {
        const { error } = await supabase.from('properties').update({ [field]: value }).in('id', ids.slice(i, i+50))
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties-all'] })
      toast.success(`${selected.size} imóveis actualizados`)
      setSelected(new Set()); setBulkVisit(''); setBulkBilling('')
    },
    onError: (e: any) => toast.error(e.message)
  })

  // Bulk delete
  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = [...selected]
      const { data: photos } = await supabase.from('property_photos').select('storage_path').in('property_id', ids)
      if (photos?.length) await supabase.storage.from('photos').remove(photos.map((p: any) => p.storage_path))
      await supabase.from('property_photos').delete().in('property_id', ids)
      await supabase.from('market_comps').delete().in('property_id', ids)
      const { error } = await supabase.from('properties').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties-all'] })
      toast.success(`${selected.size} imóveis eliminados`)
      setSelected(new Set())
    },
    onError: (e: any) => toast.error(e.message)
  })

  const hasFilters = districtFilter.length || parishFilter.length || peritoFilter || visitFilter || billingFilter || search

  return (
    <div>
      <PageHeader title="Imóveis" subtitle={`${filtered.length} de ${rows.length} registos`}
        actions={<Link to="/import" className="btn btn-primary">Importar data-tape</Link>}
      />

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap gap-2 items-center">
        <input className="input max-w-[180px]" placeholder="Ref, morada, perito…" value={search} onChange={e => setSearch(e.target.value)}/>
        <MultiSelect label="Distrito" options={districts} selected={districtFilter} onChange={v => { setDistrictFilter(v); setParishFilter([]) }}/>
        <MultiSelect label="Freguesia" options={parishes} selected={parishFilter} onChange={setParishFilter}/>
        <select className="input max-w-[160px]" value={peritoFilter} onChange={e => setPeritoFilter(e.target.value)}>
          <option value="">Todos os peritos</option>
          {peritos.map(p => <option key={p}>{p}</option>)}
        </select>
        <select className="input max-w-[150px]" value={visitFilter} onChange={e => setVisitFilter(e.target.value)}>
          <option value="">Estado visita</option>
          {Object.entries(VISIT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-[160px]" value={billingFilter} onChange={e => setBillingFilter(e.target.value)}>
          <option value="">Estado financeiro</option>
          {Object.entries(BILLING_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {hasFilters && (
          <button className="btn text-xs" onClick={() => { setSearch(''); setDistrictFilter([]); setParishFilter([]); setPeritoFilter(''); setVisitFilter(''); setBillingFilter('') }}>
            Limpar
          </button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="bg-brand-50 border-b border-brand-100 px-6 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-brand-700">{selected.size} seleccionados</span>
          <div className="flex items-center gap-2">
            <select className="input text-xs py-1 max-w-[160px]" value={bulkVisit} onChange={e => setBulkVisit(e.target.value)}>
              <option value="">Alterar estado visita…</option>
              {Object.entries(VISIT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {bulkVisit && (
              <button className="btn btn-primary text-xs py-1" onClick={() => bulkUpdate.mutate({ field:'visit_status', value:bulkVisit })}>
                Aplicar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select className="input text-xs py-1 max-w-[160px]" value={bulkBilling} onChange={e => setBulkBilling(e.target.value)}>
              <option value="">Alterar estado faturação…</option>
              {Object.entries(BILLING_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {bulkBilling && (
              <button className="btn btn-primary text-xs py-1" onClick={() => bulkUpdate.mutate({ field:'billing_status', value:bulkBilling })}>
                Aplicar
              </button>
            )}
          </div>
          <button className="btn text-xs text-red-500 hover:bg-red-50 border-red-200 ml-auto"
            onClick={() => { if (confirm(`Eliminar ${selected.size} imóveis?`)) bulkDelete.mutate() }}>
            <Trash2 size={12}/> Eliminar seleccionados
          </button>
          <button className="btn text-xs" onClick={() => setSelected(new Set())}>Cancelar</button>
        </div>
      )}

      <div className="p-6 space-y-4">
        {isLoading ? <p className="text-sm text-gray-400">A carregar…</p>
          : grouped.length === 0 ? <EmptyState message="Nenhum imóvel encontrado."/>
          : grouped.map(([pid, { portfolio, items }]) => {
            const isOpen = !collapsed[pid]
            const label  = portfolio ? `${portfolio.name}${portfolio.clients?.name ? ` — ${portfolio.clients.name}` : ''}` : 'Sem portfólio'
            const groupAllSelected = items.every((i: any) => selected.has(i.id))

            return (
              <div key={pid} className="card overflow-hidden p-0">
                <div className="flex items-center px-4 py-3 bg-gray-50 border-b border-gray-100 gap-2">
                  <button onClick={() => selectGroup(items)} className="text-gray-400 hover:text-brand-500 flex-shrink-0">
                    {groupAllSelected ? <CheckSquare size={15} className="text-brand-400"/> : <Square size={15}/>}
                  </button>
                  <button className="flex items-center gap-2 flex-1" onClick={() => toggleGroup(pid)}>
                    {isOpen ? <ChevronDown size={15} className="text-gray-400"/> : <ChevronRight size={15} className="text-gray-400"/>}
                    <span className="text-sm font-semibold text-gray-700">Data Tape + {label}</span>
                    <span className="badge badge-gray">{items.length}</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th className="w-8">
                            <button onClick={selectAll} className="text-gray-400 hover:text-brand-500">
                              {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare size={14} className="text-brand-400"/> : <Square size={14}/>}
                            </button>
                          </th>
                          <th>Ref.</th><th>Morada</th><th>Distrito</th><th>Freguesia</th>
                          <th>Tipo</th><th>Tipologia</th><th>Área</th>
                          <th>Perito</th><th>Visita</th><th>Financeiro</th><th>Honorário</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p: any) => (
                          <tr key={p.id} className={selected.has(p.id) ? 'bg-brand-50' : ''}>
                            <td>
                              <button onClick={() => toggleSelect(p.id)} className="text-gray-400 hover:text-brand-500">
                                {selected.has(p.id) ? <CheckSquare size={14} className="text-brand-400"/> : <Square size={14}/>}
                              </button>
                            </td>
                            <td><Link to={`/properties/${p.id}`} className="text-brand-600 hover:underline font-medium">{p.ref}</Link></td>
                            <td className="text-gray-600 max-w-[160px] truncate">{[p.street, p.number, p.municipality].filter(Boolean).join(', ') || p.address || '—'}</td>
                            <td className="text-gray-600">{p.district||'—'}</td>
                            <td className="text-gray-600">{p.parish||'—'}</td>
                            <td className="text-gray-600">{p.property_type||'—'}</td>
                            <td className="text-gray-600">{p.typology||'—'}</td>
                            <td className="text-gray-600">{p.area_m2||p.gross_area||'—'}</td>
                            <td className="text-gray-500 text-xs max-w-[90px] truncate">{p.perito_avaliador||'—'}</td>
                            <td><VisitBadge status={p.visit_status}/></td>
                            <td><BillingBadge status={p.billing_status}/></td>
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
        }
      </div>
    </div>
  )
}
