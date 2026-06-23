import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { VisitBadge, BillingBadge, VISIT_STATUS_LABELS, BILLING_STATUS_LABELS } from '@/components/ui'
import { ArrowLeft, Upload, Trash2, FileSpreadsheet, MapPin, Loader2, FileText, ExternalLink, Save, Link as LinkIcon } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { compressPhoto, generateReport } from '@/lib/excel'
import { formatCurrency, formatDate } from '@/lib/utils'
import { geocodeAddress } from '@/lib/geocode'
import toast from 'react-hot-toast'

declare global { interface Window { L: any } }

const TABS = ['info','location','map','photos','prev','comps','billing','notes'] as const
type Tab = typeof TABS[number]
const TAB_LABELS: Record<Tab,string> = {
  info:'Identificação', location:'Localização', map:'Mapa',
  photos:'Fotos', prev:'Aval. anterior', comps:'Comparáveis', billing:'Faturação', notes:'Notas'
}
const SLOTS = [1,2,3,4,5]

function useLeaflet(active: boolean, cb: () => void) {
  useEffect(() => {
    if (!active) return
    if (window.L) { cb(); return }
    const css = document.createElement('link'); css.rel='stylesheet'; css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css)
    const s = document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=cb; document.head.appendChild(s)
  }, [active])
}

function EditField({ label, value, field, type='text', onSave }: { label:string; value:any; field:string; type?:string; onSave:(p:any)=>void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value ?? '')
  useEffect(() => setVal(value ?? ''), [value])
  function save() { onSave({ [field]: type==='number' ? (val ? parseFloat(val) : null) : (val||null) }); setEditing(false); toast.success('Guardado') }
  return (
    <div className="flex flex-col gap-0.5">
      <label className="label">{label}</label>
      {editing ? (
        <div className="flex gap-1">
          <input type={type} className="input flex-1 py-1 text-sm" value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') save(); if (e.key==='Escape') setEditing(false) }} autoFocus/>
          <button className="btn btn-primary py-1 px-2" onClick={save}><Save size={13}/></button>
          <button className="btn py-1 px-2" onClick={() => { setVal(value??''); setEditing(false) }}>✕</button>
        </div>
      ) : (
        <div className="flex items-center gap-1 cursor-pointer" onClick={() => setEditing(true)}>
          <span className={`text-sm px-2 py-1 rounded hover:bg-gray-100 flex-1 min-h-[30px] ${val ? 'text-gray-900' : 'text-gray-300 italic'}`}>
            {val || 'Clica para editar'}
          </span>
        </div>
      )}
    </div>
  )
}

function EditSelect({ label, field, value, options, onSave }: { label:string; field:string; value:any; options:[string,string][]; onSave:(p:any)=>void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input text-sm" value={value||''} onChange={e => { onSave({ [field]: e.target.value }); toast.success('Guardado') }}>
        <option value="">—</option>
        {options.map(([k,v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  )
}

export default function PropertyDetail() {
  const { id }  = useParams()
  const qc      = useQueryClient()
  const [tab, setTab]           = useState<Tab>('info')
  const [uploading, setUploading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [mapReady, setMapReady]   = useState(false)
  const mapRef  = useRef<HTMLDivElement>(null)
  const mapInst = useRef<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const [pR, phR, cR] = await Promise.all([
        supabase.from('properties').select('*, portfolios(name, clients(name))').eq('id', id as string).single(),
        supabase.from('property_photos').select('*').eq('property_id', id as string).order('slot').order('sort_order'),
        supabase.from('market_comps').select('*').eq('property_id', id as string).order('created_at', { ascending:false }),
      ])
      return { property: pR.data as any, photos: (phR.data||[]) as any[], comps: (cR.data||[]) as any[] }
    }
  })

  const property = data?.property
  const photos   = data?.photos || []
  const comps    = data?.comps  || []

  const update = useMutation({
    mutationFn: async (patch: any) => { const {error} = await supabase.from('properties').update(patch).eq('id', id as string); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['property', id] }),
    onError: (e: any) => toast.error(e.message)
  })
  function save(patch: any) { update.mutate(patch) }

  async function handleGeocode() {
    if (!property) return
    setGeocoding(true)
    const addr = [property.street, property.number, property.address].filter(Boolean).join(' ')
    const result = await geocodeAddress(addr, property.postal_code, property.municipality, property.district)
    setGeocoding(false)
    if (!result) { toast.error('Morada não encontrada. Tenta com o código postal.'); return }
    update.mutate({ latitude: result.lat, longitude: result.lon })
    toast.success(`Coordenadas: ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}`)
  }

  useLeaflet(tab === 'map', () => setMapReady(true))
  useEffect(() => {
    if (!mapReady || !mapRef.current || tab !== 'map' || !property) return
    setTimeout(() => {
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
      const L = window.L
      const lat = property.latitude || 39.5, lon = property.longitude || -8.0
      mapInst.current = L.map(mapRef.current).setView([lat, lon], property.latitude ? 16 : 7)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(mapInst.current)
      if (property.latitude) {
        const marker = L.marker([property.latitude, property.longitude], {
          draggable:true,
          icon: L.divIcon({ className:'', html:`<div style="width:16px;height:16px;border-radius:50%;background:#1D9E75;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`, iconSize:[16,16], iconAnchor:[8,8] })
        }).addTo(mapInst.current).bindPopup(`<b>${property.ref}</b><br>${property.street||property.address||''}`).openPopup()
        marker.on('dragend', (e: any) => { const p=e.target.getLatLng(); update.mutate({ latitude:p.lat, longitude:p.lng }) })
      }
    }, 150)
  }, [mapReady, tab, property?.latitude, property?.longitude])

  const onDrop = useCallback(async (files: File[]) => {
    if (!property) return
    setUploading(true)
    for (const file of files) {
      try {
        const c = await compressPhoto(file)
        const path = `${property.id}/${Date.now()}_${file.name}`
        const { error } = await supabase.storage.from('photos').upload(path, c)
        if (error) throw error
        const used = photos.map((p: any) => p.slot).filter(Boolean)
        const slot = SLOTS.find(s => !used.includes(s)) || null
        await supabase.from('property_photos').insert({ property_id:property.id, storage_path:path, original_name:file.name, size_bytes:c.size, sort_order:photos.length, slot })
      } catch (e: any) { toast.error(e.message) }
    }
    qc.invalidateQueries({ queryKey:['property',id] })
    setUploading(false); toast.success('Fotos guardadas')
  }, [property, photos, id, qc])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept:{'image/*':[]}, maxSize:5_000_000 })

  const deletePhoto = useMutation({
    mutationFn: async (photoId: string) => {
      const photo = photos.find((p: any) => p.id === photoId)
      if (photo) await supabase.storage.from('photos').remove([photo.storage_path])
      const {error} = await supabase.from('property_photos').delete().eq('id', photoId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey:['property',id] }); toast.success('Foto eliminada') }
  })

  const uploadPrevReport = useCallback(async (files: File[]) => {
    const file = files[0]; if (!file || !property) return
    const path = `${property.id}/${Date.now()}_${file.name}`
    const {error} = await supabase.storage.from('prev-reports').upload(path, file)
    if (error) { toast.error(error.message); return }
    update.mutate({ prev_valuation_report_path: path }); toast.success('Relatório carregado')
  }, [property])
  const { getRootProps: getPrevProps, getInputProps: getPrevInput } = useDropzone({ onDrop:uploadPrevReport, accept:{'application/pdf':[]}, maxFiles:1 })

  if (isLoading) return <div className="p-8 text-gray-400">A carregar…</div>
  if (!property) return <div className="p-8 text-gray-400">Imóvel não encontrado.</div>

  const tabLabels = { ...TAB_LABELS, photos:`Fotos (${photos.length})`, comps:`Comparáveis (${comps.length})` }

  return (
    <div>
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 bg-white">
        <Link to="/properties" className="text-gray-400 hover:text-gray-700"><ArrowLeft size={18}/></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold">{property.ref}</h1>
            <VisitBadge status={property.visit_status}/>
            <BillingBadge status={property.billing_status}/>
            {property.latitude && <span className="text-xs text-emerald-600 flex items-center gap-1"><MapPin size={11}/>Georreferenciado</span>}
          </div>
          <p className="text-sm text-gray-500">{[property.street, property.number, property.municipality, property.district].filter(Boolean).join(', ') || property.address || ''}</p>
          {property.perito_avaliador && <p className="text-xs text-gray-400 mt-0.5">Perito: {property.perito_avaliador}</p>}
        </div>
        <button className="btn" onClick={() => generateReport(property, photos)}><FileSpreadsheet size={15}/> Gerar report</button>
      </div>

      <div className="flex border-b border-gray-100 bg-white px-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${tab===t?'border-brand-400 text-brand-600 font-medium':'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {(tabLabels as any)[t]}
          </button>
        ))}
      </div>

      <div className="p-6">

        {tab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Dados do processo</h3>
              <EditField label="Referência externa"   field="external_ref"          value={property.external_ref}         onSave={save}/>
              <EditField label="ID Registo Predial"   field="id_registo_predial"    value={property.id_registo_predial}   onSave={save}/>
              <EditField label="ID Registo Matricial" field="id_registo_matricial"  value={property.id_registo_matricial} onSave={save}/>
              <EditField label="Fracção"              field="fracao"                value={property.fracao}               onSave={save}/>
              <EditField label="Perito Avaliador"     field="perito_avaliador"      value={property.perito_avaliador}     onSave={save}/>
            </div>
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Tipo e uso</h3>
              <EditField label="Tipo de Bem"    field="property_type"    value={property.property_type}    onSave={save}/>
              <EditField label="Subtipo de Bem" field="property_subtype" value={property.property_subtype} onSave={save}/>
              <EditField label="Uso do Bem"     field="use_type"         value={property.use_type}         onSave={save}/>
              <EditField label="Subuso do Bem"  field="use_subtype"      value={property.use_subtype}      onSave={save}/>
              <EditField label="Estado do Bem"  field="property_state"   value={property.property_state}   onSave={save}/>
              <EditField label="Tipologia"      field="typology"         value={property.typology}         onSave={save}/>
            </div>
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Áreas</h3>
              <EditField label="m² (col. N)"       field="area_m2"        value={property.area_m2}        type="number" onSave={save}/>
              <EditField label="m² Garagem (col. O)" field="area_garage_m2" value={property.area_garage_m2} type="number" onSave={save}/>
              <EditField label="m² Anexo (col. P)" field="area_annex_m2"  value={property.area_annex_m2}  type="number" onSave={save}/>
              <EditField label="Área bruta"        field="gross_area"     value={property.gross_area}     type="number" onSave={save}/>
              <EditField label="Área útil"         field="useful_area"    value={property.useful_area}    type="number" onSave={save}/>
              <EditField label="Área terreno"      field="land_area"      value={property.land_area}      type="number" onSave={save}/>
            </div>
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Estado e visita</h3>
              <EditField label="Ano de construção" field="year_built"    value={property.year_built}  type="number" onSave={save}/>
              <EditField label="Condição"          field="condition"     value={property.condition}                onSave={save}/>
              <EditSelect label="Estado visita" field="visit_status" value={property.visit_status}
                options={Object.entries(VISIT_STATUS_LABELS) as [string,string][]} onSave={save}/>
              <EditField label="Data da visita" field="visit_date" value={property.visit_date} type="date" onSave={save}/>
            </div>
          </div>
        )}

        {tab === 'location' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Endereço</h3>
              <EditField label="Rua"          field="street"       value={property.street}       onSave={save}/>
              <EditField label="Número"       field="number"       value={property.number}       onSave={save}/>
              <EditField label="Bloco"        field="block"        value={property.block}        onSave={save}/>
              <EditField label="Piso / Letra" field="floor_letter" value={property.floor_letter} onSave={save}/>
              <EditField label="Código Postal" field="postal_code" value={property.postal_code}  onSave={save}/>
              <EditField label="Localidade"   field="address"      value={property.address}      onSave={save}/>
            </div>
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Divisão administrativa</h3>
              <EditField label="Freguesia" field="parish"       value={property.parish}       onSave={save}/>
              <EditField label="Concelho"  field="municipality" value={property.municipality} onSave={save}/>
              <EditField label="Distrito"  field="district"     value={property.district}     onSave={save}/>
            </div>
            <div className="card md:col-span-2 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Confrontações</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <EditField label="Norte" field="conf_norte" value={property.conf_norte} onSave={save}/>
                <EditField label="Sul"   field="conf_sul"   value={property.conf_sul}   onSave={save}/>
                <EditField label="Este"  field="conf_este"  value={property.conf_este}  onSave={save}/>
                <EditField label="Oeste" field="conf_oeste" value={property.conf_oeste} onSave={save}/>
              </div>
            </div>
          </div>
        )}

        {tab === 'map' && (
          <div className="space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="label">Latitude</label>
                <input type="number" step="0.000001" className="input w-40" defaultValue={property.latitude||''} key={`lat-${property.latitude}`}
                  onBlur={e => e.target.value && update.mutate({ latitude: parseFloat(e.target.value) })}/>
              </div>
              <div>
                <label className="label">Longitude</label>
                <input type="number" step="0.000001" className="input w-40" defaultValue={property.longitude||''} key={`lon-${property.longitude}`}
                  onBlur={e => e.target.value && update.mutate({ longitude: parseFloat(e.target.value) })}/>
              </div>
              <button className="btn btn-primary" onClick={handleGeocode} disabled={geocoding}>
                {geocoding ? <Loader2 size={14} className="animate-spin"/> : <MapPin size={14}/>}
                {geocoding ? 'A geocodificar…' : 'Obter coordenadas'}
              </button>
            </div>
            {!property.latitude && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Sem coordenadas. Usa morada + código postal como fallback.</p>}
            <div ref={mapRef} style={{ height:'460px', borderRadius:'12px', border:'0.5px solid #e5e7eb' }}/>
          </div>
        )}

        {tab === 'photos' && (
          <div className="space-y-5">
            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive?'border-brand-400 bg-brand-50':'border-gray-200 hover:border-brand-300'}`}>
              <input {...getInputProps()}/>
              <Upload size={24} className="mx-auto text-gray-400 mb-2"/>
              <p className="text-sm text-gray-500">{uploading?'A processar fotos…':'Arrasta fotos aqui ou clica para seleccionar'}</p>
              <p className="text-xs text-gray-400 mt-1">5 fotos · comprimidas automaticamente para ≤ 1 MB</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {SLOTS.map(slot => {
                const photo = photos.find((p: any) => p.slot === slot) || (photos[slot-1]||null)
                if (photo) {
                  const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(photo.storage_path)
                  return (
                    <div key={slot} className="relative group rounded-xl overflow-hidden border border-gray-100 aspect-[4/3] bg-gray-50">
                      <img src={publicUrl} alt={`Foto ${slot}`} className="w-full h-full object-cover"/>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"/>
                      <span className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">{slot}</span>
                      {photo.size_bytes && <span className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/50 text-white px-2 py-1 text-center">{(photo.size_bytes/1024).toFixed(0)} KB</span>}
                      <button className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deletePhoto.mutate(photo.id)}><Trash2 size={11}/></button>
                    </div>
                  )
                }
                return (
                  <div key={slot} className="rounded-xl border-2 border-dashed border-gray-200 aspect-[4/3] flex flex-col items-center justify-center gap-1 bg-gray-50 text-gray-300">
                    <span className="text-2xl font-light">{slot}</span>
                    <span className="text-xs">Foto {slot}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'prev' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Dados da avaliação anterior</h3>
              <EditField label="Data avaliação anterior" field="prev_valuation_date"       value={property.prev_valuation_date}       type="date"   onSave={save}/>
              <EditField label="Valor de mercado (€)"    field="prev_valuation_value"      value={property.prev_valuation_value}      type="number" onSave={save}/>
              <EditField label="VVI (€)"                 field="prev_valuation_vvi"        value={property.prev_valuation_vvi}        type="number" onSave={save}/>
              <EditField label="Método de avaliação"     field="prev_valuation_method"     value={property.prev_valuation_method}                   onSave={save}/>
              <EditField label="Perito avaliador"        field="prev_valuation_expert"     value={property.prev_valuation_expert}                   onSave={save}/>
              <EditField label="Entidade avaliadora"     field="prev_valuation_entity"     value={property.prev_valuation_entity}                   onSave={save}/>
              <EditField label="Condicionalismos"        field="prev_valuation_conditions" value={property.prev_valuation_conditions}                onSave={save}/>
            </div>
            <div className="space-y-4">
              {property.datatape_data && Object.keys(property.datatape_data).length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados adicionais da data-tape</h3>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {Object.entries(property.datatape_data as any).map(([k,v]) => (
                      <div key={k} className="flex justify-between text-xs py-1 border-b border-gray-50">
                        <span className="text-gray-400 font-mono truncate max-w-[45%]">{k}</span>
                        <span className="text-gray-700 truncate max-w-[50%] text-right">{String(v??'—')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Relatório anterior (PDF)</h3>
                {property.prev_valuation_report_path ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                      <FileText size={18} className="text-emerald-600 flex-shrink-0"/>
                      <p className="text-sm font-medium text-emerald-800 truncate flex-1">{property.prev_valuation_report_path.split('/').pop()}</p>
                      <button className="btn text-xs py-1" onClick={async () => {
                        const {data} = await supabase.storage.from('prev-reports').createSignedUrl(property.prev_valuation_report_path, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}><ExternalLink size={12}/> Abrir</button>
                    </div>
                    <button className="btn text-xs text-red-500 hover:bg-red-50 w-full" onClick={() => update.mutate({ prev_valuation_report_path: null })}>Remover</button>
                  </div>
                ) : (
                  <div {...getPrevProps()} className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-brand-300 transition-colors">
                    <input {...getPrevInput()}/>
                    <FileText size={24} className="mx-auto text-gray-300 mb-2"/>
                    <p className="text-sm text-gray-500">Arrasta o PDF do relatório anterior</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'comps' && (
          <div className="space-y-4">
            <CompForm propertyId={property.id} onSaved={() => qc.invalidateQueries({ queryKey:['property',id] })}/>
            {comps.length > 0 && (
              <div className="card overflow-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Comparáveis registados</h3>
                  {comps.length > 1 && (
                    <span className="text-sm text-gray-600">Mediana €/m²: <strong className="text-brand-600">€ {median(comps.map((c: any) => c.price_per_m2).filter(Boolean))}</strong></span>
                  )}
                </div>
                <table className="table-base">
                  <thead><tr>
                    <th>Portal</th><th>Ref.</th><th>Link</th><th>Tipologia</th>
                    <th>Área</th><th>Preço</th><th>€/m²</th><th>Data</th><th>Notas</th><th></th>
                  </tr></thead>
                  <tbody>
                    {comps.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-medium">{c.portal}</td>
                        <td className="text-gray-500">{c.listing_ref||'—'}</td>
                        <td>
                          {c.url
                            ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline flex items-center gap-1 text-xs"><ExternalLink size={11}/> Abrir</a>
                            : '—'}
                        </td>
                        <td>{c.typology||'—'}</td>
                        <td>{c.area_m2?`${c.area_m2} m²`:'—'}</td>
                        <td>{c.price?formatCurrency(c.price):'—'}</td>
                        <td className="font-medium text-brand-600">{c.price_per_m2?`€ ${c.price_per_m2}`:'—'}</td>
                        <td className="text-gray-400">{c.listing_date?formatDate(c.listing_date):'—'}</td>
                        <td className="text-gray-500 max-w-[140px] truncate text-xs">{c.notes||'—'}</td>
                        <td>
                          <button className="text-red-400 hover:text-red-600" onClick={async () => {
                            await supabase.from('market_comps').delete().eq('id', c.id)
                            qc.invalidateQueries({ queryKey:['property',id] })
                          }}><Trash2 size={13}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'billing' && (
          <div className="card max-w-lg space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Gestão financeira</h3>
            <EditSelect label="Estado" field="billing_status" value={property.billing_status}
              options={Object.entries(BILLING_STATUS_LABELS) as [string,string][]} onSave={save}/>
            <EditField label="Honorário (€)"  field="fee_amount"     value={property.fee_amount}     type="number" onSave={save}/>
            <EditField label="Número PO"      field="po_number"      value={property.po_number}                    onSave={save}/>
            <EditField label="Data PO"        field="po_date"        value={property.po_date}        type="date"   onSave={save}/>
            <EditField label="Nº fatura"      field="invoice_number" value={property.invoice_number}              onSave={save}/>
            <EditField label="Data fatura"    field="invoice_date"   value={property.invoice_date}   type="date"   onSave={save}/>
            <EditField label="Data pagamento" field="payment_date"   value={property.payment_date}   type="date"   onSave={save}/>
          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-4 max-w-2xl">
            <div className="card space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Notas da visita</h3>
              <textarea className="input min-h-[120px] resize-y text-sm" placeholder="Observações da visita, estado do imóvel, acessos…"
                defaultValue={property.visit_notes||''} key={`vn-${property.id}`}
                onBlur={e => update.mutate({ visit_notes: e.target.value })}/>
            </div>
            <div className="card space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Notas internas</h3>
              <textarea className="input min-h-[200px] resize-y text-sm" placeholder="Notas livres, comentários internos, follow-ups…"
                defaultValue={property.notes_free||''} key={`nf-${property.id}`}
                onBlur={e => update.mutate({ notes_free: e.target.value })}/>
              <p className="text-xs text-gray-400">Guardado automaticamente ao sair do campo</p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function CompForm({ propertyId, onSaved }: { propertyId:string; onSaved:()=>void }) {
  const [f, setF] = useState({ portal:'Idealista', listing_ref:'', url:'', typology:'', area_m2:'', price:'', listing_date:'', notes:'' })
  const save = useMutation({
    mutationFn: async () => {
      const {error} = await supabase.from('market_comps').insert({
        property_id:propertyId, portal:f.portal,
        listing_ref:f.listing_ref||null, url:f.url||null,
        typology:f.typology||null, area_m2:f.area_m2?parseFloat(f.area_m2):null,
        price:f.price?parseFloat(f.price):null, listing_date:f.listing_date||null, notes:f.notes||null,
      })
      if (error) throw error
    },
    onSuccess: () => { onSaved(); toast.success('Comparável adicionado'); setF({ portal:'Idealista', listing_ref:'', url:'', typology:'', area_m2:'', price:'', listing_date:'', notes:'' }) },
    onError: (e: any) => toast.error(e.message)
  })
  return (
    <div className="card">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Adicionar comparável</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Portal</label>
          <select className="input" value={f.portal} onChange={e => setF(p => ({...p,portal:e.target.value}))}>
            {['Idealista','Imovirtual','Casa Sapo','ERA','Remax','Outro'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">Ref. anúncio</label><input className="input" value={f.listing_ref} onChange={e => setF(p => ({...p,listing_ref:e.target.value}))}/></div>
        <div className="md:col-span-2">
          <label className="label flex items-center gap-1"><LinkIcon size={11}/> Link do anúncio</label>
          <input className="input" placeholder="https://…" value={f.url} onChange={e => setF(p => ({...p,url:e.target.value}))}/>
        </div>
        <div><label className="label">Tipologia</label><input className="input" placeholder="T2" value={f.typology} onChange={e => setF(p => ({...p,typology:e.target.value}))}/></div>
        <div><label className="label">Área (m²)</label><input type="number" className="input" value={f.area_m2} onChange={e => setF(p => ({...p,area_m2:e.target.value}))}/></div>
        <div><label className="label">Preço (€)</label><input type="number" className="input" value={f.price} onChange={e => setF(p => ({...p,price:e.target.value}))}/></div>
        <div><label className="label">Data</label><input type="date" className="input" value={f.listing_date} onChange={e => setF(p => ({...p,listing_date:e.target.value}))}/></div>
        <div className="md:col-span-3"><label className="label">Notas</label><input className="input" placeholder="Observações…" value={f.notes} onChange={e => setF(p => ({...p,notes:e.target.value}))}/></div>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" onClick={() => save.mutate()} disabled={!f.price||save.isPending}>
            {save.isPending?'A guardar…':'+ Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function median(arr: number[]) {
  if (!arr.length) return 0
  const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2)
  return s.length%2!==0 ? Math.round(s[m]) : Math.round((s[m-1]+s[m])/2)
}
