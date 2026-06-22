import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/ui'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const COLUMN_ALIASES: Record<string, string> = {
  'referencia': 'external_ref', 'ref': 'external_ref', 'id': 'external_ref', 'codigo': 'external_ref',
  'morada': 'address', 'endereco': 'address', 'address': 'address', 'rua': 'address',
  'concelho': 'municipality', 'municipio': 'municipality', 'municipality': 'municipality',
  'distrito': 'district', 'district': 'district',
  'freguesia': 'parish', 'parish': 'parish',
  'codigo postal': 'postal_code', 'cp': 'postal_code', 'postal_code': 'postal_code',
  'tipo': 'property_type', 'type': 'property_type', 'tipologia imovel': 'property_type',
  'tipologia': 'typology', 'typology': 'typology',
  'area bruta': 'gross_area', 'area_bruta': 'gross_area',
  'area util': 'useful_area', 'area_util': 'useful_area',
  'area terreno': 'land_area',
  'piso': 'floor', 'andar': 'floor', 'floor': 'floor',
  'ano construcao': 'year_built', 'ano': 'year_built',
  'honorario': 'fee_amount', 'fee': 'fee_amount', 'valor': 'fee_amount',
}

function normalise(s: string) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function detectMapping(headers: string[]) {
  const map: Record<string, string> = {}
  for (const h of headers) {
    const norm = normalise(h)
    if (COLUMN_ALIASES[norm]) map[h] = COLUMN_ALIASES[norm]
  }
  return map
}

const PROPERTY_FIELDS = [
  'external_ref','address','parish','municipality','district','postal_code',
  'property_type','typology','gross_area','useful_area','land_area','floor','year_built','condition','fee_amount'
]

const NUMERIC_FIELDS = ['gross_area','useful_area','land_area','floor','year_built','fee_amount']

export default function DataTapeImport() {
  const qc = useQueryClient()
  const [rows, setRows]         = useState<Record<string, any>[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mapping, setMapping]   = useState<Record<string, string>>({})
  const [fileName, setFileName] = useState('')
  const [portfolioId, setPortfolioId] = useState('')
  const [step, setStep]         = useState<'upload' | 'map' | 'done'>('upload')

  const { data: portfolios = [] } = useQuery({
    queryKey: ['portfolios-simple'],
    queryFn: async () => {
      const { data } = await supabase
        .from('portfolios')
        .select('id, name, clients(name)')
        .eq('status', 'active')
        .order('name')
      return (data ?? []) as any[]
    }
  })

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const wb = XLSX.read(e.target!.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: null })
      if (!data.length) { toast.error('Ficheiro vazio'); return }
      const hdrs = Object.keys(data[0])
      setHeaders(hdrs)
      setMapping(detectMapping(hdrs))
      setRows(data)
      setStep('map')
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
      'application/vnd.ms-excel': []
    },
    maxFiles: 1
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!portfolioId) throw new Error('Selecciona um portfólio')

      const { data: portfolio } = await supabase
        .from('portfolios')
        .select('client_id')
        .eq('id', portfolioId)
        .single()

      if (!portfolio) throw new Error('Portfólio não encontrado')

      const props = rows.map((row: Record<string, any>, i: number) => {
        const p: Record<string, any> = {
          portfolio_id:  portfolioId,
          client_id:     portfolio.client_id,
          ref:           `AV-${String(i + 1).padStart(4, '0')}`,
          datatape_data: row,
        }
        for (const [col, field] of Object.entries(mapping)) {
          const v = row[col]
          if (v !== null && v !== undefined) {
            p[field] = NUMERIC_FIELDS.includes(field)
              ? parseFloat(String(v)) || null
              : String(v).trim() || null
          }
        }
        return p
      })

      let imported = 0
      for (let i = 0; i < props.length; i += 100) {
        const { error } = await supabase.from('properties').insert(props.slice(i, i + 100))
        if (error) throw error
        imported += Math.min(100, props.length - i)
      }

      await supabase.from('datatape_imports').insert({
        portfolio_id:   portfolioId,
        file_name:      fileName,
        row_count:      rows.length,
        imported_count: imported,
      })
      return imported
    },
    onSuccess: (n: number) => {
      qc.invalidateQueries({ queryKey: ['properties'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success(`${n} imóveis importados`)
      setStep('done')
    },
    onError: (e: any) => toast.error(e.message)
  })

  function reset() { setStep('upload'); setRows([]); setHeaders([]); setMapping({}) }

  return (
    <div>
      <PageHeader title="Importar data-tape" subtitle="Carrega o ficheiro Excel com o portfólio de imóveis" />
      <div className="p-6 max-w-3xl space-y-6">

        {step === 'upload' && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-600 font-medium">Arrasta o ficheiro Excel aqui</p>
            <p className="text-xs text-gray-400 mt-1">ou clica para seleccionar · .xlsx / .xls</p>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-5">
            <div className="card flex items-center gap-3">
              <FileSpreadsheet size={20} className="text-brand-400" />
              <div>
                <p className="text-sm font-medium text-gray-800">{fileName}</p>
                <p className="text-xs text-gray-500">{rows.length} linhas detectadas</p>
              </div>
            </div>

            <div>
              <label className="label">Portfólio de destino *</label>
              <select className="input max-w-sm" value={portfolioId} onChange={e => setPortfolioId(e.target.value)}>
                <option value="">Seleccionar portfólio…</option>
                {portfolios.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.clients?.name}</option>
                ))}
              </select>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                Mapeamento de colunas
                <span className="font-normal text-gray-400 ml-2">
                  ({Object.values(mapping).filter(Boolean).length} mapeadas automaticamente)
                </span>
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-40 truncate font-mono bg-gray-50 px-2 py-1 rounded">{h}</span>
                    <span className="text-gray-300">→</span>
                    <select
                      className="input flex-1 text-xs"
                      value={mapping[h] ?? ''}
                      onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))}
                    >
                      <option value="">(ignorar)</option>
                      {PROPERTY_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    {mapping[h]
                      ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                      : <AlertCircle size={14} className="text-gray-300 flex-shrink-0" />
                    }
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button className="btn" onClick={reset}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => importMutation.mutate()}
                disabled={!portfolioId || importMutation.isPending}
              >
                {importMutation.isPending ? `A importar ${rows.length} imóveis…` : `Importar ${rows.length} imóveis`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="card text-center py-10">
            <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3" />
            <p className="text-base font-semibold text-gray-900">Importação concluída</p>
            <p className="text-sm text-gray-500 mt-1">{rows.length} imóveis adicionados ao portfólio</p>
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
