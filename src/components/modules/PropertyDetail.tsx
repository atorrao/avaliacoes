import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { VisitBadge, BillingBadge } from '@/components/ui'
import { ArrowLeft, Upload, Trash2, FileSpreadsheet, MapPin, Loader2, FileText, ExternalLink } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { compressPhoto, generateReport } from '@/lib/excel'
import { formatCurrency, formatDate } from '@/lib/utils'
import { geocodeAddress } from '@/lib/geocode'
import toast from 'react-hot-toast'
import { VISIT_STATUS_LABELS, BILLING_STATUS_LABELS } from '@/types/database'

declare global { interface Window { L: any } }

function useLeaflet(cb: () => void, deps: any[]) {
  useEffect(() => {
    if (window.L) { cb(); return }
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = cb
    document.head.appendChild(script)
  }, deps)
}

const TABS = ['info','map','photos','prev','comps','billing'] as const
type Tab = typeof TABS[number]
const TAB_LABELS: Record<Tab, string> = {
  info: 'Informação', map: 'Mapa', photos: 'Fotos',
  prev: 'Aval. anterior', comps: 'Comparáveis', billing: 'Faturação'
}
const PHOTO_SLOTS = [1,2,3,4,5]

export default function PropertyDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab]         = useState<Tab>('info')
  const [uploading, setUploading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const mapRef  = useRef<HTMLDivElement>(null)
  const mapInst = useRef<any>(null)
  const markerRef = useRef<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const [pR, phR, cR] = await Promise.all([
        supabase.from('properties').select('*, portfolios(name)').eq('id', id as string).single(),
        supabase.from('property_photos').select('*').eq('property_id', id as string).order('slot').order('sort_order'),
        supabase.from('market_comps').select('*').eq('property_id', id as string).order('created_at', { ascending: false }),
      ])
      return { property: pR.data as any, photos: (phR.data || []) as any[], comps: (cR.data || []) as any[] }
    }
  })

  const property = data?.property
  const photos   = data?.photos || []
  const comps    = data?.comps  || []

  const update = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from('properties').update(patch).eq('id', id as string)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', id] }); toast.success('Guardado') },
    onError: (e: any) => toast.error(e.message)
  })

  // ── Geocoding ────────────────────────────────────────────────
  async function handleGeocode() {
    if (!property) return
    const addr = [property.address, property.municipality, property.district].filter(Boolean).join(', ')
    setGeocoding(true)
    const result = await geocodeAddress(addr)
    setGeocoding(false)
    if (!result) { toast.error('Morada não encontrada. Tenta ser mais específico.'); return }
    update.mutate({ latitude: result.lat, longitude: result.lon })
    toast.success(`Coordenadas obtidas: ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}`)
  }

  // ── Map ──────────────────────────────────────────────────────
  useLeaflet(() => {
    if (tab !== 'map' || !mapRef.current || !property) return
    setTimeout(() => {
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
      const L = window.L
      const lat = property.latitude || 39.5
      const lon = property.longitude || -8.0
      const zoom = property.latitude ? 15 : 7
      mapInst.current = L.map(mapRef.current).setView([lat, lon], zoom)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19
      }).addTo(mapInst.current)
      if (property.latitude && property.longitude) {
        markerRef.current = L.marker([property.latitude, property.longitude], {
          draggable: true,
          icon: L.divIcon({
            className: '',
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#1D9E75;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
            iconSize: [16,16], iconAnchor: [8,8]
          })
        }).addTo(mapInst.current)
          .bindPopup(`<b>${property.ref}</b><br>${property.address || ''}`)
          .openPopup()
        markerRef.current.on('dragend', (e: any) => {
          const pos = e.target.getLatLng()
          update.mutate({ latitude: pos.lat, longitude: pos.lng })
        })
      }
    }, 100)
  }, [tab, property?.latitude, property?.longitude])

  // ── Photos ───────────────────────────────────────────────────
  const onDrop = useCallback(async (files: File[]) => {
    if (!property) return
    setUploading(true)
    for (const file of files) {
      try {
        const compressed = await compressPhoto(file)
        const path = `${property.id}/${Date.now()}_${file.name}`
        const { error: upErr } = await supabase.storage.from('photos').upload(path, compressed)
        if (upErr) throw upErr
        // Find next available slot
        const usedSlots = photos.map((p: any) => p.slot).filter(Boolean)
        const nextSlot  = PHOTO_SLOTS.find(s => !usedSlots.includes(s)) || null
        await supabase.from('property_photos').insert({
          property_id: property.id, storage_path: path,
          original_name: file.name, size_bytes: compressed.size,
          sort_order: photos.length, slot: nextSlot,
        })
      } catch (e: any) { toast.error(`Erro: ${e.message}`) }
    }
    qc.invalidateQueries({ queryKey: ['property', id] })
    setUploading(false)
    toast.success('Fotos guardadas')
  }, [property, photos, id, qc])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [] }, maxSize: 5_000_000
  })

  const deletePhoto = useMutation({
    mutationFn: async (photoId: string) => {
      const photo = photos.find((p: any) => p.id === photoId)
      if (photo) await supabase.storage.from('photos').remove([photo.storage_path])
      await supabase.from('property_photos').delete().eq('id', photoId)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', id] }); toast.success('Foto eliminada') }
  })

  // ── Prev report upload ───────────────────────────────────────
  const uploadPrevReport = useCallback(async (files: File[]) => {
    const file = files[0]; if (!file || !property) return
    const path = `${property.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('prev-reports').upload(path, file)
    if (error) { toast.error(error.message); return }
    update.mutate({ prev_valuation_report_path: path })
    toast.success('Relatório anterior carregado')
  }, [property])

  const { getRootProps: getPrevProps, getInputProps: getPrevInput } = useDropzone({
    onDrop: uploadPrevReport, accept: { 'application/pdf': [] }, maxFiles: 1
  })

  if (isLoading) return <div className="p-8 text-gray-400">A carregar…</div>
  if (!property) return <div className="p-8 text-gray-400">Imóvel não encontrado.</div>

  const tabLabels = {
    ...TAB_LABELS,
    photos: `Fotos (${photos.length})`,
    comps:  `Comparáveis (${comps.length})`,
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 bg-white">
        <Link to="/properties" className="text-gray-400 hover:text-gray-700"><ArrowLeft size={18}/></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-gray-900">{property.ref}</h1>
            <VisitBadge status={property.visit_status} />
            <BillingBadge status={property.billing_status} />
            {property.latitude && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <MapPin size={11}/> Georreferenciado
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{property.address || ''}{property.municipality ? `, ${property.municipality}` : ''}</p>
        </div>
        <button className="btn" onClick={() => generateReport(property, photos)}>
          <FileSpreadsheet size={15}/> Gerar report
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white px-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t ? 'border-brand-400 text-brand-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            onClick={() => setTab(t)}>{(tabLabels as any)[t]}</button>
        ))}
      </div>

      <div className="p-6">

        {/* ── INFO ── */}
        {tab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Localização</h3>
              {[['Morada', property.address],['Freguesia', property.parish],['Concelho', property.municipality],
                ['Distrito', property.district],['Código Postal', property.postal_code]].map(([l,v]) => v && (
                <div key={l as string} className="flex justify-between text-sm">
                  <span className="text-gray-500">{l}</span><span className="text-gray-900">{v}</span>
                </div>
              ))}
            </div>
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Características</h3>
              {[['Tipo', property.property_type],['Tipologia', property.typology],
                ['Área bruta', property.gross_area ? `${property.gross_area} m²` : null],
                ['Área útil', property.useful_area ? `${property.useful_area} m²` : null],
                ['Área terreno', property.land_area ? `${property.land_area} m²` : null],
                ['Piso', property.floor != null ? String(property.floor) : null],
                ['Ano construção', property.year_built ? String(property.year_built) : null],
                ['Estado', property.condition]].map(([l,v]) => v && (
                <div key={l as string} className="flex justify-between text-sm">
                  <span className="text-gray-500">{l}</span><span className="text-gray-900">{v}</span>
                </div>
              ))}
            </div>
            <div className="card md:col-span-2 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Estado da visita</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="label">Estado</label>
                  <select className="input w-48" value={property.visit_status} onChange={e => update.mutate({ visit_status: e.target.value })}>
                    {Object.entries(VISIT_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Data da visita</label>
                  <input type="date" className="input w-44" defaultValue={property.visit_date || ''}
                    onBlur={e => e.target.value && update.mutate({ visit_date: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MAP ── */}
        {tab === 'map' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="label">Latitude</label>
                <input type="number" step="0.000001" className="input w-40"
                  defaultValue={property.latitude || ''} key={property.latitude}
                  onBlur={e => e.target.value && update.mutate({ latitude: parseFloat(e.target.value) })} />
              </div>
              <div>
                <label className="label">Longitude</label>
                <input type="number" step="0.000001" className="input w-40"
                  defaultValue={property.longitude || ''} key={property.longitude}
                  onBlur={e => e.target.value && update.mutate({ longitude: parseFloat(e.target.value) })} />
              </div>
              <div className="flex items-end pb-0.5">
                <button className="btn btn-primary" onClick={handleGeocode} disabled={geocoding}>
                  {geocoding ? <Loader2 size={14} className="animate-spin"/> : <MapPin size={14}/>}
                  {geocoding ? 'A geocodificar…' : 'Obter coordenadas da morada'}
                </button>
              </div>
            </div>
            {!property.latitude && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Sem coordenadas. Clica em "Obter coordenadas" para geocodificar automaticamente ou introduz manualmente. O marcador é arrastável no mapa.
              </p>
            )}
            <div ref={mapRef} style={{ height: '460px', borderRadius: '12px', border: '0.5px solid #e5e7eb' }} />
          </div>
        )}

        {/* ── PHOTOS ── */}
        {tab === 'photos' && (
          <div className="space-y-5">
            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}>
              <input {...getInputProps()} />
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">{uploading ? 'A processar fotos…' : 'Arrasta fotos aqui ou clica para seleccionar'}</p>
              <p className="text-xs text-gray-400 mt-1">Máximo 5 fotos · Comprimidas automaticamente para ≤ 1 MB</p>
            </div>

            {/* 5 slots */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {PHOTO_SLOTS.map(slot => {
                const photo = photos.find((p: any) => p.slot === slot) || photos[slot - 1] || null
                if (photo) {
                  const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(photo.storage_path)
                  return (
                    <div key={slot} className="relative group rounded-xl overflow-hidden border border-gray-100 aspect-[4/3] bg-gray-50">
                      <img src={publicUrl} alt={`Foto ${slot}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <span className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">{slot}</span>
                      {photo.size_bytes && (
                        <span className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/50 text-white px-2 py-1 text-center">
                          {(photo.size_bytes/1024).toFixed(0)} KB
                        </span>
                      )}
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

        {/* ── AVALIAÇÃO ANTERIOR ── */}
        {tab === 'prev' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Dados da avaliação anterior</h3>
              {[
                ['Data avaliação anterior', 'prev_valuation_date',        'date'],
                ['Valor de mercado (€)',    'prev_valuation_value',       'number'],
                ['VVI (€)',                 'prev_valuation_vvi',         'number'],
                ['Método de avaliação',     'prev_valuation_method',      'text'],
                ['Perito avaliador',        'prev_valuation_expert',      'text'],
                ['Entidade avaliadora',     'prev_valuation_entity',      'text'],
                ['Condicionalismos',        'prev_valuation_conditions',  'text'],
              ].map(([label, field, type]) => (
                <div key={field}>
                  <label className="label">{label}</label>
                  <input type={type} className="input" defaultValue={(property as any)[field] || ''}
                    key={(property as any)[field]}
                    onBlur={e => {
                      const v = e.target.value
                      if (!v) return
                      update.mutate({ [field]: type === 'number' ? parseFloat(v) : v })
                    }} />
                </div>
              ))}
            </div>

            <div className="space-y-4">
              {/* Dados extra da data-tape (coluna Y em diante) */}
              {property.datatape_data && Object.keys(property.datatape_data).length > 0 && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Dados da data-tape</h3>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {Object.entries(property.datatape_data as Record<string, any>).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-1 border-b border-gray-50">
                        <span className="text-gray-500 font-mono truncate max-w-[45%]">{k}</span>
                        <span className="text-gray-700 truncate max-w-[50%] text-right">{String(v ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload relatório anterior */}
              <div className="card space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Relatório anterior (PDF)</h3>
                {property.prev_valuation_report_path ? (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <FileText size={18} className="text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800 truncate">
                        {property.prev_valuation_report_path.split('/').pop()}
                      </p>
                    </div>
                    <button
                      className="btn text-xs py-1"
                      onClick={async () => {
                        const { data } = await supabase.storage.from('prev-reports').createSignedUrl(property.prev_valuation_report_path, 3600)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}
                    >
                      <ExternalLink size={12}/> Abrir
                    </button>
                  </div>
                ) : (
                  <div {...getPrevProps()} className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-brand-300 transition-colors">
                    <input {...getPrevInput()} />
                    <FileText size={24} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">Arrasta o PDF do relatório anterior</p>
                    <p className="text-xs text-gray-400 mt-1">Máximo 20 MB</p>
                  </div>
                )}
                {property.prev_valuation_report_path && (
                  <button className="btn text-xs text-red-500 hover:bg-red-50 w-full"
                    onClick={() => update.mutate({ prev_valuation_report_path: null })}>
                    Remover relatório
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── COMPARÁVEIS ── */}
        {tab === 'comps' && (
          <div className="space-y-4">
            <CompForm propertyId={property.id} municipality={property.municipality}
              onSaved={() => qc.invalidateQueries({ queryKey: ['property', id] })} />
            {comps.length > 0 && (
              <div className="card overflow-auto">
                <table className="table-base">
                  <thead><tr><th>Portal</th><th>Ref.</th><th>Tipologia</th><th>Área</th><th>Preço</th><th>€/m²</th><th>Data</th></tr></thead>
                  <tbody>
                    {comps.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-medium">{c.portal}</td>
                        <td className="text-gray-500">{c.listing_ref || '—'}</td>
                        <td>{c.typology || '—'}</td>
                        <td>{c.area_m2 ? `${c.area_m2} m²` : '—'}</td>
                        <td>{c.price ? formatCurrency(c.price) : '—'}</td>
                        <td className="font-medium text-brand-600">{c.price_per_m2 ? `€ ${c.price_per_m2}` : '—'}</td>
                        <td className="text-gray-400">{c.listing_date ? formatDate(c.listing_date) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comps.length > 1 && (
                  <div className="mt-3 pt-3 border-t border-gray-50 text-sm text-gray-600">
                    Mediana €/m²: <strong className="text-brand-600">€ {median(comps.map((c: any) => c.price_per_m2).filter(Boolean))}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── FATURAÇÃO ── */}
        {tab === 'billing' && (
          <div className="card max-w-lg space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Gestão financeira</h3>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={property.billing_status} onChange={e => update.mutate({ billing_status: e.target.value })}>
                {Object.entries(BILLING_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {[
              ['Honorário (€)',   'fee_amount',      'number', property.fee_amount],
              ['Número PO',       'po_number',       'text',   property.po_number],
              ['Data PO',         'po_date',         'date',   property.po_date],
              ['Nº fatura',       'invoice_number',  'text',   property.invoice_number],
              ['Data fatura',     'invoice_date',    'date',   property.invoice_date],
              ['Data pagamento',  'payment_date',    'date',   property.payment_date],
            ].map(([label, field, type, val]) => (
              <div key={field as string}>
                <label className="label">{label}</label>
                <input type={type as string} className="input" defaultValue={(val as any) || ''}
                  key={val as any}
                  onBlur={e => { const v = e.target.value; if (!v) return; update.mutate({ [field as string]: type === 'number' ? parseFloat(v) : v }) }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CompForm({ propertyId, municipality, onSaved }: { propertyId: string; municipality?: string; onSaved: () => void }) {
  const [f, setF] = useState({ portal: 'Idealista', listing_ref: '', typology: '', area_m2: '', price: '', listing_date: '' })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('market_comps').insert({
        property_id: propertyId, portal: f.portal,
        listing_ref: f.listing_ref || null, typology: f.typology || null,
        area_m2: f.area_m2 ? parseFloat(f.area_m2) : null,
        price: f.price ? parseFloat(f.price) : null,
        listing_date: f.listing_date || null,
      })
      if (error) throw error
    },
    onSuccess: () => { onSaved(); toast.success('Comparável adicionado'); setF({ portal: 'Idealista', listing_ref: '', typology: '', area_m2: '', price: '', listing_date: '' }) },
    onError: (e: any) => toast.error(e.message)
  })
  return (
    <div className="card">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Adicionar comparável</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Portal</label>
          <select className="input" value={f.portal} onChange={e => setF(p => ({ ...p, portal: e.target.value }))}>
            {['Idealista','Imovirtual','Casa Sapo','ERA','Remax','Outro'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">Ref.</label><input className="input" value={f.listing_ref} onChange={e => setF(p => ({ ...p, listing_ref: e.target.value }))}/></div>
        <div><label className="label">Tipologia</label><input className="input" placeholder="T2" value={f.typology} onChange={e => setF(p => ({ ...p, typology: e.target.value }))}/></div>
        <div><label className="label">Área (m²)</label><input type="number" className="input" value={f.area_m2} onChange={e => setF(p => ({ ...p, area_m2: e.target.value }))}/></div>
        <div><label className="label">Preço (€)</label><input type="number" className="input" value={f.price} onChange={e => setF(p => ({ ...p, price: e.target.value }))}/></div>
        <div><label className="label">Data anúncio</label><input type="date" className="input" value={f.listing_date} onChange={e => setF(p => ({ ...p, listing_date: e.target.value }))}/></div>
        <div className="md:col-span-2 flex items-end">
          <button className="btn btn-primary w-full" onClick={() => save.mutate()} disabled={!f.price || save.isPending}>
            {save.isPending ? 'A guardar…' : '+ Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function median(arr: number[]) {
  if (!arr.length) return 0
  const s = [...arr].sort((a,b) => a-b)
  const m = Math.floor(s.length/2)
  return s.length % 2 !== 0 ? Math.round(s[m]) : Math.round((s[m-1]+s[m])/2)
}
