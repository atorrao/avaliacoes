import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, VisitBadge, EmptyState } from '@/components/ui'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import { ChevronDown, ChevronRight, Trash2, CheckSquare, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSavedFilters, saveFilters, clearFilters, type PropertyFilters } from '@/lib/userPrefs'

const VISIT_LABELS: Record<string,string>   = { pending:'Por visitar', scheduled:'Agendado', visited:'Visitado', report_done:'Report OK' }
const BILLING_LABELS: Record<string,string> = { no_po:'Sem PO', awaiting_po:'A aguardar PO', po_received:'PO recebida', invoice_pending:'Fat. por emitir', invoice_issued:'Fat. emitida', paid:'Pago' }

function MultiSelect({ label, options, selected, onChange }: { label:string; options:string[]; selected:string[]; onChange:(v:string[])=>void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  function toggle(v: string) { onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]) }
  const display = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} seleccionados`
  return (
    <div ref={ref} className="relative">
      <button className="input text-left flex items-center justify-between gap-2 min-w-[150px]" onClick={() => setOpen(o => !o)}>
        <span className={`truncate text-sm ${selected.length ? 'text-gray-900' : 'text-gray-400'}`}>{display}</span>
        <ChevronDown size={12} className="flex-shrink-0 text-gray-400"/>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-60 overflow-y-auto">
          {options.length === 0 ? <p className="text-xs text-gray-400 px-3 py-2">Sem opções</p> : (
            <>
              <button className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-100" onClick={() => onChange([])}>Limpar selecção</button>
              {options.map(o => (
                <button key={o} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2" onClick={() => toggle(o)}>
                  {selected.includes(o) ? <CheckSquare size={13} className="text-brand-400"/> : <Square size={13} className="text-gray-300"/>}
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

  // Load saved filters on mount
  const [filters, setFilters] = useState<PropertyFilters>(getSavedFilters)

  // Persist filters on every change
  function updateFilters(partial: Partial<PropertyFilters>) {
    setFilters(prev => {
      const next = { ...prev, ...partial }
      saveFilters(next)
      return next
    })
  }

  const [collapsed, setCollapsed] = useState<Record<string,boolean>>({})
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [bulkVisit,   setBulkVisit]   = useState('')
  const [bulkBilling, setBulkBilling] = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['properties-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('properties')
        .select(`
          id, ref, external_ref,
          street, number, block, floor_letter, fracao,
          address, parish, municipality, district, postal_code,
          property_type, property_subtype, use_type, use_subtype, property_state,
          typology, year_built, condition,
          area_m2, gross_area, useful_area, land_area, area_garage_m2, area_annex_m2,
          id_registo_predial, id_registo_matricial,
          perito_avaliador, visit_status, visit_date,
          billing_status, fee_amount, po_number, invoice_number, payment_date,
          latitude, longitude,
          portfolios(id, name, clients(name))
        `)
        .order('portfolio_id').order('ref')
      return (data||[]) as any[]
    }
  })

  const districts = useMemo(() => [...new Set(rows.map((r: any) => r.district).filter(Boolean))].sort(), [rows])
  const parishes  = useMemo(() => {
    const base = filters.districtFilter.length ? rows.filter((r: any) => filters.districtFilter.includes(r.district)) : rows
    return [...new Set(base.map((r: any) => r.parish).filter(Boolean))].sort()
  }, [rows, filters.districtFilter])
  const peritos = useMemo(() => [...new Set(rows.map((r: any) => r.perito_avaliador).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => rows.filter((r: any) => {
    if (filters.visitFilter                    && r.visit_status     !== filters.visitFilter)          return false
    if (filters.billingFilter                  && r.billing_status   !== filters.billingFilter)         return false
    if (filters.districtFilter.length          && !filters.districtFilter.includes(r.district))         return false
    if (filters.parishFilter.length            && !filters.parishFilter.includes(r.parish))             return false
    if (filters.peritoFilter                   && r.perito_avaliador !== filters.peritoFilter)           return false
    if (filters.search) {
      const s = filters.search.toLowerCase()
      return [r.ref, r.external_ref, r.address, r.street, r.municipality, r.district,
              r.parish, r.typology, r.property_type, r.perito_avaliador, r.postal_code]
        .some(v => v?.toLowerCase().includes(s))
    }
    return true
  }), [rows, filters])

  const grouped = useMemo(() => {
    const map: Record<string,{portfolio:any;items:any[]}> = {}
    filtered.forEach((r: any) => {
      const pid = r.portfolios?.id || 'sem-portfolio'
      if (!map[pid]) map[pid] = { portfolio: r.portfolios, items: [] }
      map[pid].items.push(r)
    })
    return Object.entries(map)
  }, [filtered])

  function toggleGroup(pid: string) { setCollapsed(prev => ({...prev, [pid]: !prev[pid]})) }
  function toggleSelect(id: string) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function selectGroup(items: any[]) {
    const ids = items.map((i: any) => i.id)
    const allSel = ids.every(id => selected.has(id))
    setSelected(prev => { const n = new Set(prev); allSel ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id)); return n })
  }
  function selectAll() {
    const allIds = filtered.map((r: any) => r.id)
    setSelected(prev => prev.size === allIds.length ? new Set() : new Set(allIds))
  }

  const bulkUpdate = useMutation({
    mutationFn: async ({ field, value }: { field:string; value:string }) => {
      const ids = [...selected]
      for (let i = 0; i < ids.length; i += 50) {
        const { error } = await supabase.from('properties').update({ [field]: value }).in('id', ids.slice(i, i+50))
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey:['properties-all'] }); toast.success(`${selected.size} actualizados`); setSelected(new Set()); setBulkVisit(''); setBulkBilling('') },
    onError: (e: any) => toast.error(e.message)
  })

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
    onSuccess: () => { qc.invalidateQueries({ queryKey:['properties-all'] }); toast.success(`${selected.size} eliminados`); setSelected(new Set()) },
    onError: (e: any) => toast.error(e.message)
  })

  const hasFilters = filters.districtFilter.length || filters.parishFilter.length || filters.peritoFilter || filters.visitFilter || filters.billingFilter || filters.search

  return (
    <div>
      <PageHeader title="Imóveis" subtitle={`${filtered.length} de ${rows.length} registos`}/>

      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-wrap gap-2 items-center">
        <input className="input max-w-[180px]" placeholder="Ref, morada, perito…"
          value={filters.search} onChange={e => updateFilters({ search: e.target.value })}/>
        <MultiSelect label="Distrito" options={districts} selected={filters.districtFilter}
          onChange={v => updateFilters({ districtFilter: v, parishFilter: [] })}/>
        <MultiSelect label="Freguesia" options={parishes} selected={filters.parishFilter}
          onChange={v => updateFilters({ parishFilter: v })}/>
        <select className="input max-w-[150px]" value={filters.peritoFilter}
          onChange={e => updateFilters({ peritoFilter: e.target.value })}>
          <option value="">Todos os peritos</option>
          {peritos.map(p => <option key={p}>{p}</option>)}
        </select>
        <select className="input max-w-[150px]" value={filters.visitFilter}
          onChange={e => updateFilters({ visitFilter: e.target.value })}>
          <option value="">Estado visita</option>
          {Object.entries(VISIT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-[160px]" value={filters.billingFilter}
          onChange={e => updateFilters({ billingFilter: e.target.value })}>
          <option value="">Estado financeiro</option>
          {Object.entries(BILLING_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {hasFilters && (
          <button className="btn text-xs" onClick={() => { clearFilters(); setFilters({ search:'', visitFilter:'', billingFilter:'', districtFilter:[], parishFilter:[], peritoFilter:'' }) }}>
            Limpar
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="bg-brand-50 border-b border-brand-100 px-6 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-brand-700">{selected.size} seleccionados</span>
          <div className="flex items-center gap-2">
            <select className="input text-xs py-1 max-w-[160px]" value={bulkVisit} onChange={e => setBulkVisit(e.target.value)}>
              <option value="">Alterar estado visita…</option>
              {Object.entries(VISIT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {bulkVisit && <button className="btn btn-primary text-xs py-1" onClick={() => bulkUpdate.mutate({ field:'visit_status', value:bulkVisit })}>Aplicar</button>}
          </div>
          <div className="flex items-center gap-2">
            <select className="input text-xs py-1 max-w-[160px]" value={bulkBilling} onChange={e => setBulkBilling(e.target.value)}>
              <option value="">Alterar faturação…</option>
              {Object.entries(BILLING_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {bulkBilling && <button className="btn btn-primary text-xs py-1" onClick={() => bulkUpdate.mutate({ field:'billing_status', value:bulkBilling })}>Aplicar</button>}
          </div>
          <button className="btn text-xs text-red-500 hover:bg-red-50 border-red-200 ml-auto"
            onClick={() => { if (confirm(`Eliminar ${selected.size} imóveis?`)) bulkDelete.mutate() }}>
            <Trash2 size={12}/> Eliminar
          </button>
          <button className="btn text-xs" onClick={() => setSelected(new Set())}>Cancelar</button>
        </div>
      )}

      <div className="p-6 space-y-4">
        {isLoading ? <p className="text-sm text-gray-400">A carregar…</p>
          : grouped.length === 0 ? <EmptyState message="Nenhum imóvel encontrado."/>
          : grouped.map(([pid, { portfolio, items }]) => {
            const isOpen    = !collapsed[pid]
            const label     = portfolio ? `${portfolio.name}${portfolio.clients?.name ? ` — ${portfolio.clients.name}` : ''}` : 'Sem portfólio'
            const groupAllSel = items.every((i: any) => selected.has(i.id))

            return (
              <div key={pid} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center px-4 py-3 bg-gray-50 border-b border-gray-200 gap-2">
                  <button onClick={() => selectGroup(items)} className="text-gray-400 hover:text-brand-500 flex-shrink-0">
                    {groupAllSel ? <CheckSquare size={14} className="text-brand-400"/> : <Square size={14}/>}
                  </button>
                  <button className="flex items-center gap-2 flex-1 text-left" onClick={() => toggleGroup(pid)}>
                    {isOpen ? <ChevronDown size={14} className="text-gray-400"/> : <ChevronRight size={14} className="text-gray-400"/>}
                    <span className="text-sm font-semibold text-gray-700">Data Tape + {label}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{items.length}</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse" style={{ minWidth:'2400px' }}>
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="sticky left-0 bg-gray-50 px-3 py-2 w-8 z-10">
                            <button onClick={selectAll} className="text-gray-400 hover:text-brand-500">
                              {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare size={13} className="text-brand-400"/> : <Square size={13}/>}
                            </button>
                          </th>
                          <th className="sticky left-8 bg-gray-50 px-3 py-2 font-semibold text-gray-600 whitespace-nowrap z-10 min-w-[90px]">Ref.</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[110px]">Ref. externa</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">Reg. Predial</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">Reg. Matricial</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[70px]">Fracção</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[160px]">Rua</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[50px]">Nº</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[60px]">Bloco</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[60px]">Piso/Letra</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Cód. Postal</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[100px]">Freguesia</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[100px]">Concelho</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[100px]">Distrito</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[110px]">Tipo de Bem</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[110px]">Subtipo</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Uso</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Subuso</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Estado Bem</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">Tipologia</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">Ano Const.</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">m² (N)</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">m² Garagem</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">m² Anexo</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">Área bruta</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">Área útil</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">Terreno</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[130px]">Perito Avaliador</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[110px]">Estado visita</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Data visita</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[130px]">Est. faturação</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[100px]">Honorário</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Nº PO</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Nº Fatura</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[90px]">Dt. Pagamento</th>
                          <th className="px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[50px]">Geo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p: any, idx: number) => (
                          <tr key={p.id} className={`border-b border-gray-100 hover:bg-gray-50 ${selected.has(p.id) ? 'bg-brand-50' : idx%2===0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                            <td className="sticky left-0 px-3 py-2 bg-inherit z-10">
                              <button onClick={() => toggleSelect(p.id)} className="text-gray-400 hover:text-brand-500">
                                {selected.has(p.id) ? <CheckSquare size={13} className="text-brand-400"/> : <Square size={13}/>}
                              </button>
                            </td>
                            <td className="sticky left-8 px-3 py-2 bg-inherit z-10">
                              <Link to={`/properties/${p.id}`} className="text-brand-600 hover:underline font-semibold whitespace-nowrap">{p.ref}</Link>
                            </td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.external_ref||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.id_registo_predial||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.id_registo_matricial||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.fracao||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[160px] truncate">{p.street||p.address||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.number||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.block||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.floor_letter||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.postal_code||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.parish||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.municipality||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.district||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.property_type||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.property_subtype||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.use_type||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.use_subtype||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.property_state||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.typology||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.year_built||'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.area_m2?`${p.area_m2} m²`:'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.area_garage_m2?`${p.area_garage_m2} m²`:'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.area_annex_m2?`${p.area_annex_m2} m²`:'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.gross_area?`${p.gross_area} m²`:'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.useful_area?`${p.useful_area} m²`:'—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.land_area?`${p.land_area} m²`:'—'}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.perito_avaliador||'—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap"><VisitBadge status={p.visit_status}/></td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.visit_date||'—'}</td>
                            {/* Billing status — plain text, no badge */}
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{BILLING_LABELS[p.billing_status]||p.billing_status||'—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{p.fee_amount?formatCurrency(p.fee_amount):'—'}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.po_number||'—'}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.invoice_number||'—'}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{p.payment_date||'—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {p.latitude ? <span className="text-emerald-500">✓</span> : <span className="text-gray-300">—</span>}
                            </td>
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
