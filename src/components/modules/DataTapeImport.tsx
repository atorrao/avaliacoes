import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui'
import { FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

// Extended column aliases including new fields
const ALIASES: Record<string, string> = {
  // identification
  'referencia':'external_ref','ref':'external_ref','id':'external_ref','codigo':'external_ref','bem':'external_ref','n bem':'external_ref','nr bem':'external_ref',
  // location
  'rua':'street','rue':'street','street':'street',
  'numero':'number','n':'number','num':'number',
  'bloco':'block','block':'block',
  'piso':'floor','andar':'floor','floor':'floor',
  'letra':'floor_letter','fraccao':'fracao','fracao':'fracao','fraction':'fracao',
  'morada':'address','endereco':'address','address':'address',
  'freguesia':'parish','parish':'parish',
  'concelho':'municipality','municipio':'municipality','municipality':'municipality',
  'distrito':'district','district':'district',
  'codigo postal':'postal_code','cp':'postal_code','cod postal':'postal_code','postal_code':'postal_code',
  // type
  'tipo de bem':'property_type','tipo':'property_type','type':'property_type',
  'subtipo':'property_subtype','subtipo de bem':'property_subtype',
  'uso':'use_type','uso do bem':'use_type',
  'subuso':'use_subtype','subuso do bem':'use_subtype',
  'estado do bem':'property_state','estado':'property_state',
  'tipologia':'typology','typology':'typology',
  // areas
  'm2':'area_m2','area m2':'area_m2','area':'area_m2','area bruta':'gross_area',
  'm2 garagem':'area_garage_m2','garagem m2':'area_garage_m2','area garagem':'area_garage_m2',
  'm2 anexo':'area_annex_m2','anexo m2':'area_annex_m2','area anexo':'area_annex_m2',
  'area util':'useful_area','area_util':'useful_area',
  'area terreno':'land_area',
  // responsible
  'perito avaliador':'perito_avaliador','perito':'perito_avaliador','avaliador':'perito_avaliador','responsavel':'perito_avaliador',
  // financial
  'honorario':'fee_amount','fee':'fee_amount','valor':'fee_amount','honorários':'fee_amount',
  // registration
  'id registo predial':'id_registo_predial','registo predial':'id_registo_predial','crp':'id_registo_predial',
  'id registo matricial':'id_registo_matricial','registo matricial':'id_registo_matricial','artigo':'id_registo_matricial',
}

const NUMERIC = ['area_m2','gross_area','useful_area','land_area','area_garage_m2','area_annex_m2','floor','year_built','fee_amount','prev_valuation_value','prev_valuation_vvi']

const FIELDS = [
  'external_ref','street','number','block','floor_letter','fracao',
  'address','parish','municipality','district','postal_code',
  'property_type','property_subtype','use_type','use_subtype','property_state','typology',
  'area_m2','gross_area','useful_area','land_area','area_garage_m2','area_annex_m2',
  'year_built','condition','fee_amount','perito_avaliador',
  'id_registo_predial','id_registo_matricial',
  'prev_valuation_date','prev_valuation_value','prev_valuation_vvi',
  'prev_valuation_method','prev_valuation_expert','prev_valuation_entity',
]

function norm(s: string) { return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'') }

export default function DataTapeImport() {
  const qc = useQueryClient()
  const [rows, setRows]         = useState<any[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mapping, setMapping]   = useState<Record<string,string>>({})
  const [fileName, setFileName] = useState('')
  const [portfolioId, setPId]   = useState('')
  const [step, setStep]         = useState<'upload'|'map'|'done'>('upload')
  const [imported, setImported] = useState(0)

  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('portfolios').select('id, name, clients(name)').eq('status','active').order('name')
      return (data||[]) as any[]
    }
  })

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]; if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const wb   = XLSX.read(e.target!.result, { type:'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:null }) as any[]
      if (!data.length) { toast.error('Ficheiro vazio'); return }
      const hdrs = Object.keys(data[0])
      const map: Record<string,string> = {}
      hdrs.forEach(h => { const a = ALIASES[norm(h)]; if (a) map[h] = a })
      setHeaders(hdrs); setMapping(map); setRows(data); setStep('map')
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':[],'application/vnd.ms-excel':[]}, maxFiles:1
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!portfolioId) throw new Error('Selecciona um portfólio')
      const { data: pf } = await supabase.from('portfolios').select('client_id').eq('id', portfolioId).single()
      if (!pf) throw new Error('Portfólio não encontrado')

      const props = rows.map((row: any, i: number) => {
        const p: any = {
          portfolio_id:  portfolioId,
          client_id:     pf.client_id,
          ref:           `AV-${String(i+1).padStart(4,'0')}`,
          datatape_data: row,
        }
        Object.entries(mapping).forEach(([col, field]) => {
          const v = row[col]
          if (v !== null && v !== undefined && String(v).trim() !== '') {
            p[field] = NUMERIC.includes(field) ? (parseFloat(String(v)) || null) : String(v).trim()
          }
        })
        return p
      })

      let n = 0
      for (let i = 0; i < props.length; i += 100) {
        const { error } = await supabase.from('properties').insert(props.slice(i, i+100))
        if (error) throw error
        n += Math.min(100, props.length - i)
      }
      await supabase.from('datatape_imports').insert({ portfolio_id:portfolioId, file_name:fileName, row_count:rows.length, imported_count:n })
      return n
    },
    onSuccess: (n: number) => {
      qc.invalidateQueries({ queryKey: ['properties-all'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setImported(n); toast.success(`${n} imóveis importados`); setStep('done')
    },
    onError: (e: any) => toast.error(e.message)
  })

  function reset() { setStep('upload'); setRows([]); setHeaders([]); setMapping({}) }

  const autoMapped = Object.values(mapping).filter(Boolean).length

  return (
    <div>
      <PageHeader title="Importar data-tape" subtitle="Excel com o portfólio de imóveis"/>
      <div className="p-6 max-w-3xl space-y-6">

        {step === 'upload' && (
          <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${isDragActive?'border-brand-400 bg-brand-50':'border-gray-200 hover:border-brand-300'}`}>
            <input {...getInputProps()}/>
            <FileSpreadsheet size={32} className="mx-auto text-gray-300 mb-3"/>
            <p className="text-sm text-gray-600 font-medium">Arrasta o ficheiro Excel aqui</p>
            <p className="text-xs text-gray-400 mt-1">ou clica para seleccionar · .xlsx / .xls</p>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-5">
            <div className="card flex items-center gap-3">
              <FileSpreadsheet size={20} className="text-brand-400"/>
              <div className="flex-1">
                <p className="text-sm font-medium">{fileName}</p>
                <p className="text-xs text-gray-500">{rows.length} linhas · {autoMapped} colunas mapeadas automaticamente</p>
              </div>
            </div>

            <div>
              <label className="label">Portfólio de destino *</label>
              <select className="input max-w-sm" value={portfolioId} onChange={e => setPId(e.target.value)}>
                <option value="">Seleccionar portfólio…</option>
                {portfolios.map((p: any) => <option key={p.id} value={p.id}>{p.name} — {p.clients?.name}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Os imóveis vão aparecer agrupados como "Data Tape + {portfolios.find((p: any) => p.id === portfolioId)?.name || '[nome do portfólio]'}"</p>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Mapeamento de colunas
                <span className="font-normal text-gray-400 ml-2">({autoMapped} de {headers.length} auto-detectadas)</span>
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-44 truncate font-mono bg-gray-50 px-2 py-1 rounded">{h}</span>
                    <span className="text-gray-300 text-xs">→</span>
                    <select className="input flex-1 text-xs" value={mapping[h]||''} onChange={e => setMapping(prev => ({...prev, [h]:e.target.value}))}>
                      <option value="">(ignorar)</option>
                      {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    {mapping[h] ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0"/> : <AlertCircle size={14} className="text-gray-200 flex-shrink-0"/>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button className="btn" onClick={reset}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => importMutation.mutate()} disabled={!portfolioId||importMutation.isPending}>
                {importMutation.isPending ? `A importar ${rows.length} imóveis…` : `Importar ${rows.length} imóveis`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="card text-center py-10">
            <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3"/>
            <p className="text-base font-semibold text-gray-900">Importação concluída</p>
            <p className="text-sm text-gray-500 mt-1">{imported} imóveis adicionados</p>
            <div className="flex justify-center gap-3 mt-5">
              <button className="btn" onClick={reset}>Nova importação</button>
              <a href="/properties" className="btn btn-primary">Ver imóveis →</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
