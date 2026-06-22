import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { VisitBadge, BillingBadge } from '@/components/ui'
import { ArrowLeft, Upload, Trash2, FileSpreadsheet } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { compressPhoto, generateReport } from '@/lib/excel'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { VisitStatus, BillingStatus } from '@/types/database'
import { VISIT_STATUS_LABELS, BILLING_STATUS_LABELS } from '@/types/database'

function useProperty(id: string) {
  return useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const [propRes, photosRes, compsRes] = await Promise.all([
        supabase.from('properties').select('*, portfolios(name, client_id, clients(name, client_templates(*)))').eq('id', id).single(),
        supabase.from('property_photos').select('*').eq('property_id', id).order('sort_order'),
        supabase.from('market_comps').select('*').eq('property_id', id).order('created_at', { ascending: false }),
      ])
      return {
        property: propRes.data,
        photos:   photosRes.data ?? [],
        comps:    compsRes.data ?? [],
      }
    }
  })
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { data, isLoading } = useProperty(id!)
  const property = data?.property
  const photos   = data?.photos ?? []
  const comps    = data?.comps ?? []

  const [tab, setTab] = useState<'info'|'photos'|'comps'|'billing'>('info')
  const [uploading, setUploading] = useState(false)

  // ── Photo upload ────────────────────────────────────────────
  const onDrop = useCallback(async (files: File[]) => {
    if (!property) return
    setUploading(true)
    for (const file of files) {
      try {
        const compressed = await compressPhoto(file)
        const path = `${property.id}/${Date.now()}_${file.name}`
        const { error: upErr } = await supabase.storage.from('photos').upload(path, compressed)
        if (upErr) throw upErr
        await supabase.from('property_photos').insert({
          property_id:   property.id,
          storage_path:  path,
          original_name: file.name,
          size_bytes:    compressed.size,
          sort_order:    photos.length,
        })
      } catch (e: any) {
        toast.error(`Erro: ${e.message}`)
      }
    }
    qc.invalidateQueries({ queryKey: ['property', id] })
    setUploading(false)
    toast.success('Fotos guardadas')
  }, [property, photos.length, id, qc])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [] }, maxSize: 5_000_000
  })

  // ── Status updates ──────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async (patch: Partial<{ visit_status: VisitStatus; billing_status: BillingStatus; visit_date: string; fee_amount: number; po_number: string; invoice_number: string; invoice_date: string; payment_date: string }>) => {
      const { error } = await supabase.from('properties').update(patch).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', id] }); toast.success('Guardado') },
    onError:   (e: Error) => toast.error(e.message)
  })

  // ── Delete photo ────────────────────────────────────────────
  const deletePhoto = useMutation({
    mutationFn: async (photoId: string) => {
      const photo = photos.find(p => p.id === photoId)
      if (photo) await supabase.storage.from('photos').remove([photo.storage_path])
      await supabase.from('property_photos').delete().eq('id', photoId)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['property', id] })
  })

  if (isLoading) return <div className="p-8 text-gray-400">A carregar…</div>
  if (!property) return <div className="p-8 text-gray-400">Imóvel não encontrado.</div>

  const tabs = ['info', 'photos', 'comps', 'billing'] as const
  const tabLabel: Record<typeof tabs[number], string> = {
    info: 'Informação', photos: `Fotos (${photos.length})`, comps: `Comparáveis (${comps.length})`, billing: 'Faturação'
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 bg-white">
        <Link to="/properties" className="text-gray-400 hover:text-gray-700"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900">{property.ref}</h1>
            <VisitBadge status={property.visit_status} />
            <BillingBadge status={property.billing_status} />
          </div>
          <p className="text-sm text-gray-500">{property.address ?? ''}{property.municipality ? `, ${property.municipality}` : ''}</p>
        </div>
        <button
          className="btn"
          onClick={() => generateReport(property, photos)}
        >
          <FileSpreadsheet size={15} /> Gerar report Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-100 bg-white px-6">
        {tabs.map(t => (
          <button
            key={t}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${tab === t ? 'border-brand-400 text-brand-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            onClick={() => setTab(t)}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* ── Info ── */}
        {tab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Localização</h3>
              {[
                ['Morada',      property.address],
                ['Freguesia',   property.parish],
                ['Concelho',    property.municipality],
                ['Distrito',    property.district],
                ['Código Postal', property.postal_code],
              ].map(([l, v]) => v && (
                <div key={l as string} className="flex justify-between text-sm">
                  <span className="text-gray-500">{l}</span>
                  <span className="text-gray-900">{v}</span>
                </div>
              ))}
            </div>
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Características</h3>
              {[
                ['Tipo',           property.property_type],
                ['Tipologia',      property.typology],
                ['Área bruta',     property.gross_area ? `${property.gross_area} m²` : null],
                ['Área útil',      property.useful_area ? `${property.useful_area} m²` : null],
                ['Área terreno',   property.land_area   ? `${property.land_area} m²`   : null],
                ['Piso',           property.floor],
                ['Ano construção', property.year_built],
                ['Estado',         property.condition],
              ].map(([l, v]) => v !== null && v !== undefined && (
                <div key={l as string} className="flex justify-between text-sm">
                  <span className="text-gray-500">{l}</span>
                  <span className="text-gray-900">{v}</span>
                </div>
              ))}
            </div>
            <div className="card md:col-span-2 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Estado da visita</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="label">Estado</label>
                  <select
                    className="input w-48"
                    value={property.visit_status}
                    onChange={e => updateStatus.mutate({ visit_status: e.target.value as VisitStatus })}
                  >
                    {Object.entries(VISIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Data da visita</label>
                  <input
                    type="date"
                    className="input w-44"
                    defaultValue={property.visit_date ?? ''}
                    onBlur={e => e.target.value && updateStatus.mutate({ visit_date: e.target.value })}
                  />
                </div>
              </div>
              {property.visit_notes && <p className="text-sm text-gray-500">{property.visit_notes}</p>}
            </div>
          </div>
        )}

        {/* ── Photos ── */}
        {tab === 'photos' && (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}
            >
              <input {...getInputProps()} />
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">
                {uploading ? 'A processar fotos…' : 'Arrasta fotos aqui ou clica para seleccionar'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Comprimidas automaticamente para ≤ 1 MB</p>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {photos.map((photo: any) => {
                const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(photo.storage_path)
                return (
                  <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-gray-100 aspect-square">
                    <img src={publicUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deletePhoto.mutate(photo.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                    {photo.size_bytes && (
                      <span className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/50 text-white px-1 py-0.5 text-center">
                        {(photo.size_bytes / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Comps ── */}
        {tab === 'comps' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Introduz manualmente os comparáveis de mercado. A integração com portais será adicionada futuramente.</p>
            <CompForm propertyId={property.id} onSaved={() => qc.invalidateQueries({ queryKey: ['property', id] })} />
            {comps.length > 0 && (
              <div className="card overflow-auto">
                <table className="table-base">
                  <thead><tr><th>Portal</th><th>Ref.</th><th>Tipologia</th><th>Área</th><th>Preço</th><th>€/m²</th><th>Data</th></tr></thead>
                  <tbody>
                    {comps.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-medium">{c.portal}</td>
                        <td className="text-gray-500">{c.listing_ref ?? '—'}</td>
                        <td>{c.typology ?? '—'}</td>
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

        {/* ── Billing ── */}
        {tab === 'billing' && (
          <div className="card max-w-lg space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Gestão financeira</h3>
            <div>
              <label className="label">Estado</label>
              <select
                className="input"
                value={property.billing_status}
                onChange={e => updateStatus.mutate({ billing_status: e.target.value as BillingStatus })}
              >
                {Object.entries(BILLING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Honorário (€)</label>
              <input
                type="number"
                className="input"
                defaultValue={property.fee_amount ?? ''}
                onBlur={e => e.target.value && updateStatus.mutate({ fee_amount: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Número PO</label>
              <input className="input" defaultValue={property.po_number ?? ''} onBlur={e => updateStatus.mutate({ po_number: e.target.value })} />
            </div>
            <div>
              <label className="label">Data PO</label>
              <input type="date" className="input" defaultValue={property.po_date ?? ''} onBlur={e => e.target.value && updateStatus.mutate({ po_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Nº fatura</label>
              <input className="input" defaultValue={property.invoice_number ?? ''} onBlur={e => updateStatus.mutate({ invoice_number: e.target.value })} />
            </div>
            <div>
              <label className="label">Data fatura</label>
              <input type="date" className="input" defaultValue={property.invoice_date ?? ''} onBlur={e => e.target.value && updateStatus.mutate({ invoice_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Data pagamento</label>
              <input type="date" className="input" defaultValue={property.payment_date ?? ''} onBlur={e => e.target.value && updateStatus.mutate({ payment_date: e.target.value })} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Comp form ────────────────────────────────────────────────
function CompForm({ propertyId, onSaved }: { propertyId: string; onSaved: () => void }) {
  const [f, setF] = useState({ portal: 'Idealista', listing_ref: '', typology: '', area_m2: '', price: '', listing_date: '', notes: '' })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('market_comps').insert({
        property_id: propertyId,
        portal:      f.portal,
        listing_ref: f.listing_ref || null,
        typology:    f.typology    || null,
        area_m2:     f.area_m2     ? parseFloat(f.area_m2)  : null,
        price:       f.price       ? parseFloat(f.price)    : null,
        listing_date:f.listing_date || null,
        notes:       f.notes       || null,
      })
      if (error) throw error
    },
    onSuccess: () => { onSaved(); toast.success('Comparável adicionado'); setF({ portal: 'Idealista', listing_ref: '', typology: '', area_m2: '', price: '', listing_date: '', notes: '' }) },
    onError:   (e: Error) => toast.error(e.message)
  })

  return (
    <div className="card">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Adicionar comparável</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Portal</label>
          <select className="input" value={f.portal} onChange={e => setF(p => ({ ...p, portal: e.target.value }))}>
            {['Idealista', 'Imovirtual', 'Casa Sapo', 'ERA', 'Remax', 'Outro'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">Ref. anúncio</label><input className="input" value={f.listing_ref} onChange={e => setF(p => ({ ...p, listing_ref: e.target.value }))} /></div>
        <div><label className="label">Tipologia</label><input className="input" placeholder="T2" value={f.typology} onChange={e => setF(p => ({ ...p, typology: e.target.value }))} /></div>
        <div><label className="label">Área (m²)</label><input type="number" className="input" value={f.area_m2} onChange={e => setF(p => ({ ...p, area_m2: e.target.value }))} /></div>
        <div><label className="label">Preço (€)</label><input type="number" className="input" value={f.price} onChange={e => setF(p => ({ ...p, price: e.target.value }))} /></div>
        <div><label className="label">Data anúncio</label><input type="date" className="input" value={f.listing_date} onChange={e => setF(p => ({ ...p, listing_date: e.target.value }))} /></div>
        <div className="md:col-span-2 flex items-end">
          <button className="btn btn-primary w-full" onClick={() => save.mutate()} disabled={!f.portal || !f.price || save.isPending}>
            {save.isPending ? 'A guardar…' : '+ Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function median(arr: number[]) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? Math.round(s[m]) : Math.round((s[m - 1] + s[m]) / 2)
}
