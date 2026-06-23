import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState, Badge } from '@/components/ui'
import { Plus, Trash2, ChevronRight, Upload, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { calculateFee } from '@/lib/feeCalculator'
import { CheckCircle, AlertCircle } from 'lucide-react'

const ALIASES: Record<string, string> = {
  'referencia':'external_ref','ref':'external_ref','id':'external_ref','codigo':'external_ref','bem':'external_ref','n bem':'external_ref','nr bem':'external_ref',
  'rua':'street','street':'street','numero':'number','bloco':'block','letra':'floor_letter','fraccao':'fracao','fracao':'fracao',
  'morada':'address','endereco':'address','address':'address','freguesia':'parish','parish':'parish',
  'concelho':'municipality','municipio':'municipality','municipality':'municipality',
  'distrito':'district','district':'district','codigo postal':'postal_code','cp':'postal_code','cod postal':'postal_code',
  'tipo de bem':'property_type','tipo':'property_type','subtipo':'property_subtype','subtipo de bem':'property_subtype',
  'uso':'use_type','uso do bem':'use_type','subuso':'use_subtype','estado do bem':'property_state','estado':'property_state',
  'tipologia':'typology','m2':'area_m2','area m2':'area_m2','area':'area_m2','area bruta':'gross_area',
  'm2 garagem':'area_garage_m2','m2 anexo':'area_annex_m2','area util':'useful_area','area terreno':'land_area',
  'perito avaliador':'perito_avaliador','perito':'perito_avaliador','avaliador':'perito_avaliador','responsavel':'perito_avaliador',
  'honorario':'fee_amount','fee':'fee_amount','id registo predial':'id_registo_predial','id registo matricial':'id_registo_matricial',
}
const NUMERIC = ['area_m2','gross_area','useful_area','land_area','area_garage_m2','area_annex_m2','floor','year_built','fee_amount']
const FIELDS  = ['external_ref','street','number','block','floor_letter','fracao','address','parish','municipality','district','postal_code','property_type','property_subtype','use_type','use_subtype','property_state','typology','area_m2','gross_area','useful_area','land_area','area_garage_m2','area_annex_m2','year_built','condition','fee_amount','perito_avaliador','id_registo_predial','id_registo_matricial']
function norm(s: string) { return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'') }

// Portfolio status options — updated
const STATUS_OPTIONS = [
  { value: 'active',           label: 'Activo',              badge: 'green'  },
  { value: 'delivered',        label: 'Entregue',            badge: 'blue'   },
  { value: 'awaiting_payment', label: 'Aguarda Pagamento',   badge: 'amber'  },
  { value: 'closed',           label: 'Encerrado',           badge: 'gray'   },
] as const
type PortfolioStatus = typeof STATUS_OPTIONS[number]['value']
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s])) as Record<string, typeof STATUS_OPTIONS[number]>

function ImportPanel({ portfolioId, clientId, onClose, onDone }: { portfolioId:string; clientId:string; onClose:()=>void; onDone:()=>void }) {
  const [rows, setRows]         = useState<any[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mapping, setMapping]   = useState<Record<string,string>>({})
  const [fileName, setFileName] = useState('')
  const [step, setStep]         = useState<'upload'|'map'|'preview'|'done'>('upload')
  const [preview, setPreview]   = useState<{newRows:any[];updates:any[];unchanged:any[]}>({newRows:[],updates:[],unchanged:[]})
  const [result, setResult]     = useState({imported:0,updated:0})
  const [feeScheduleId, setFeeScheduleId] = useState('')

  const { data: feeSchedules = [] } = useQuery({
    queryKey: ['fee-schedules'],
    queryFn: async () => { const {data} = await supabase.from('fee_schedules').select('*').eq('is_active',true); return (data||[]) as any[] }
  })

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const wb   = XLSX.read(ev.target!.result, { type:'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:null }) as any[]
      if (!data.length) { toast.error('Ficheiro vazio'); return }
      const hdrs = Object.keys(data[0])
      const map: Record<string,string> = {}
      hdrs.forEach(h => { const a = ALIASES[norm(h)]; if (a) map[h] = a })
      setHeaders(hdrs); setMapping(map); setRows(data); setStep('map')
    }
    reader.readAsArrayBuffer(file)
  }

  async function buildPreview() {
    let feeRules: any[] = []
    if (feeScheduleId) {
      const sched = feeSchedules.find((s: any) => s.id === feeScheduleId)
      feeRules = sched?.rules || []
    }
    const { data: existing } = await supabase.from('properties').select('id, external_ref').eq('portfolio_id', portfolioId)
    const existMap: Record<string,any> = {}
    ;(existing||[]).forEach((p: any) => { if (p.external_ref) existMap[p.external_ref] = p })

    const newRows: any[] = [], updates: any[] = [], unchanged: any[] = []
    rows.forEach((row: any, i: number) => {
      const p: any = { datatape_data: row }
      Object.entries(mapping).forEach(([col, field]) => {
        const v = row[col]
        if (v !== null && v !== undefined && String(v).trim() !== '')
          p[field] = NUMERIC.includes(field) ? (parseFloat(String(v)) || null) : String(v).trim()
      })
      if (feeRules.length && p.property_type && !p.fee_amount) {
        const fee = calculateFee(p.property_type, p.area_m2 || p.gross_area, feeRules)
        if (fee) p.fee_amount = fee
      }
      const extRef = p.external_ref
      if (extRef && existMap[extRef]) {
        updates.push({ ...p, _id: existMap[extRef].id, _ref: extRef })
      } else {
        newRows.push({ ...p, _ref: extRef || `linha ${i+1}` })
      }
    })
    setPreview({ newRows, updates, unchanged }); setStep('preview')
  }

  async function doImport() {
    let imported = 0, updated = 0
    if (preview.newRows.length) {
      const toInsert = preview.newRows.map((p: any, i: number) => {
        const { _ref, ...rest } = p
        return { ...rest, portfolio_id: portfolioId, client_id: clientId, ref: `AV-${String(i+1).padStart(4,'0')}` }
      })
      for (let i = 0; i < toInsert.length; i += 100) {
        const { error } = await supabase.from('properties').insert(toInsert.slice(i, i+100))
        if (error) { toast.error(error.message); return }
        imported += Math.min(100, toInsert.length - i)
      }
    }
    for (const p of preview.updates) {
      const { _id, _ref, ...fields } = p
      await supabase.from('properties').update(fields).eq('id', _id)
      updated++
    }
    await supabase.from('datatape_imports').insert({ portfolio_id: portfolioId, file_name: fileName, row_count: rows.length, imported_count: imported + updated })
    setResult({ imported, updated }); setStep('done')
    toast.success(`${imported} novos · ${updated} actualizados`)
    onDone()
  }

  return (
    <div className="mt-3 border border-gray-200 rounded-xl bg-gray-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Importar data-tape</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={15}/></button>
      </div>

      {step === 'upload' && (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-brand-300 transition-colors">
          <Upload size={20} className="text-gray-300 mb-2"/>
          <p className="text-xs text-gray-500">Clica para seleccionar o Excel</p>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile}/>
        </label>
      )}

      {step === 'map' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{fileName} · {rows.length} linhas · {Object.values(mapping).filter(Boolean).length} mapeadas</p>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Precário (honorários automáticos)</label>
            <select className="input text-xs" value={feeScheduleId} onChange={e => setFeeScheduleId(e.target.value)}>
              <option value="">Sem cálculo automático</option>
              {feeSchedules.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5 border border-gray-200 rounded-lg bg-white p-2">
            {headers.map(h => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono w-36 truncate">{h}</span>
                <select className="input flex-1 text-xs py-0.5" value={mapping[h]||''} onChange={e => setMapping(prev => ({...prev,[h]:e.target.value}))}>
                  <option value="">(ignorar)</option>
                  {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {mapping[h] ? <CheckCircle size={12} className="text-emerald-400 flex-shrink-0"/> : <AlertCircle size={12} className="text-gray-200 flex-shrink-0"/>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn text-xs py-1" onClick={() => setStep('upload')}>← Voltar</button>
            <button className="btn btn-primary text-xs py-1" onClick={buildPreview}>Verificar →</button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-emerald-50 rounded-lg p-2"><p className="text-lg font-semibold text-emerald-600">{preview.newRows.length}</p><p className="text-xs text-gray-500">Novos</p></div>
            <div className="bg-amber-50 rounded-lg p-2"><p className="text-lg font-semibold text-amber-600">{preview.updates.length}</p><p className="text-xs text-gray-500">Actualizados</p></div>
            <div className="bg-gray-50 rounded-lg p-2"><p className="text-lg font-semibold text-gray-400">{preview.unchanged.length}</p><p className="text-xs text-gray-500">Sem alteração</p></div>
          </div>
          <div className="flex gap-2">
            <button className="btn text-xs py-1" onClick={() => setStep('map')}>← Voltar</button>
            <button className="btn btn-primary text-xs py-1" onClick={doImport} disabled={preview.newRows.length + preview.updates.length === 0}>
              Confirmar importação
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-3">
          <CheckCircle size={28} className="text-emerald-500 mx-auto mb-2"/>
          <p className="text-sm font-medium">{result.imported} novos · {result.updated} actualizados</p>
          <div className="flex justify-center gap-2 mt-3">
            <button className="btn text-xs py-1" onClick={() => { setStep('upload'); setRows([]); setHeaders([]); setMapping({}) }}>Nova importação</button>
            <Link to="/properties" className="btn btn-primary text-xs py-1">Ver imóveis →</Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Portfolios() {
  const qc = useQueryClient()
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState({ client_id:'', name:'', description:'', deadline:'', status:'active' })
  const [openImport, setOpenImport] = useState<string|null>(null)

  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const { data } = await supabase.from('portfolios').select('*, clients(name, id), properties(count)').order('created_at', { ascending:false })
      return (data||[]) as any[]
    }
  })
  const { data: clients = [] } = useQuery({
    queryKey: ['clients-simple'],
    queryFn: async () => { const {data} = await supabase.from('clients').select('id, name').order('name'); return (data||[]) as any[] }
  })

  const create = useMutation({
    mutationFn: async () => { const {error} = await supabase.from('portfolios').insert(form); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey:['portfolios'] }); toast.success('Portfólio criado'); setModal(false); setForm({ client_id:'', name:'', description:'', deadline:'', status:'active' }) },
    onError: (e: any) => toast.error(e.message)
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id:string; status:string }) => {
      const { error } = await supabase.from('portfolios').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey:['portfolios'] }); toast.success('Estado actualizado') },
    onError: (e: any) => toast.error(e.message)
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data: props } = await supabase.from('properties').select('id').eq('portfolio_id', id)
      const ids = (props||[]).map((p: any) => p.id)
      if (ids.length) {
        const { data: photos } = await supabase.from('property_photos').select('storage_path').in('property_id', ids)
        if (photos?.length) await supabase.storage.from('photos').remove(photos.map((p: any) => p.storage_path))
        await supabase.from('property_photos').delete().in('property_id', ids)
        await supabase.from('market_comps').delete().in('property_id', ids)
        await supabase.from('properties').delete().in('id', ids)
      }
      await supabase.from('datatape_imports').delete().eq('portfolio_id', id)
      const { error } = await supabase.from('portfolios').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey:['portfolios'] }); toast.success('Portfólio eliminado') },
    onError: (e: any) => toast.error(e.message)
  })

  return (
    <div>
      <PageHeader title="Portfólios" subtitle="Mandatos e data-tapes por cliente"
        actions={<button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={15}/> Novo portfólio</button>}
      />
      <div className="p-6">
        {isLoading ? <p className="text-sm text-gray-400">A carregar…</p>
          : portfolios.length === 0 ? <EmptyState message="Sem portfólios criados ainda."/>
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {portfolios.map((p: any) => {
                const statusInfo = STATUS_MAP[p.status] || STATUS_MAP['active']
                return (
                  <div key={p.id} className="card flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.clients?.name}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={statusInfo.badge as any}>{statusInfo.label}</Badge>
                        <button className="btn p-1.5 text-red-400 hover:bg-red-50 border-0 ml-1"
                          onClick={() => { if (confirm(`Eliminar "${p.name}" e todos os imóveis?`)) del.mutate(p.id) }}>
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </div>

                    {p.description && <p className="text-xs text-gray-500">{p.description}</p>}

                    {/* Status selector */}
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Estado do portfólio</label>
                      <select
                        className="input text-xs py-1.5"
                        value={p.status || 'active'}
                        onChange={e => updateStatus.mutate({ id: p.id, status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
                      <span>{p.properties?.[0]?.count || 0} imóveis</span>
                      {p.deadline && <span>Prazo: {p.deadline}</span>}
                      <Link to={`/properties?portfolio=${p.id}`} className="text-brand-500 flex items-center gap-0.5 hover:underline">
                        Ver imóveis <ChevronRight size={11}/>
                      </Link>
                    </div>

                    {openImport === p.id ? (
                      <ImportPanel
                        portfolioId={p.id}
                        clientId={p.clients?.id || ''}
                        onClose={() => setOpenImport(null)}
                        onDone={() => { qc.invalidateQueries({ queryKey:['portfolios'] }); setOpenImport(null) }}
                      />
                    ) : (
                      <button className="btn text-xs w-full flex items-center justify-center gap-1.5 border-dashed"
                        onClick={() => setOpenImport(p.id)}>
                        <Upload size={13}/> Importar / actualizar data-tape
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold mb-5">Novo portfólio</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Cliente *</label>
                <select className="input" value={form.client_id} onChange={e => setForm(f => ({...f, client_id:e.target.value}))}>
                  <option value="">Seleccionar…</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))}/></div>
              <div><label className="label">Descrição</label><input className="input" value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))}/></div>
              <div><label className="label">Prazo</label><input type="date" className="input" value={form.deadline} onChange={e => setForm(f => ({...f, deadline:e.target.value}))}/></div>
              <div>
                <label className="label">Estado</label>
                <select className="input" value={form.status} onChange={e => setForm(f => ({...f, status:e.target.value}))}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => create.mutate()} disabled={!form.client_id || !form.name || create.isPending}>
                {create.isPending ? 'A criar…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
