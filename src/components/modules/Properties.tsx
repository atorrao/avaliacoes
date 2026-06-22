import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, VisitBadge, BillingBadge, EmptyState } from '@/components/ui'
import { Link, useSearchParams } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import type { Property, VisitStatus, BillingStatus } from '@/types/database'
import { VISIT_STATUS_LABELS, BILLING_STATUS_LABELS } from '@/types/database'

export default function Properties() {
  const [params] = useSearchParams()
  const [visitFilter,   setVisitFilter]   = useState<VisitStatus | ''>('')
  const [billingFilter, setBillingFilter] = useState<BillingStatus | ''>('')
  const [search, setSearch] = useState('')

  const portfolioId = params.get('portfolio') ?? undefined

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties', portfolioId, visitFilter, billingFilter],
    queryFn: async () => {
      let q = supabase
        .from('properties')
        .select('*, portfolios(name), clients(name)')
        .order('ref')

      if (portfolioId)  q = q.eq('portfolio_id', portfolioId)
      if (visitFilter)  q = q.eq('visit_status', visitFilter)
      if (billingFilter)q = q.eq('billing_status', billingFilter)

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    }
  })

  const filtered = search
    ? properties.filter((p: any) =>
        [p.ref, p.address, p.municipality, p.district, p.typology, p.property_type]
          .some(v => v?.toLowerCase().includes(search.toLowerCase()))
      )
    : properties

  return (
    <div>
      <PageHeader
        title="Imóveis"
        subtitle={`${properties.length} registos`}
        actions={
          <Link to="/import" className="btn btn-primary">Importar data-tape</Link>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 px-6 py-3 bg-white border-b border-gray-100">
        <input
          className="input max-w-xs"
          placeholder="Pesquisar ref, morada, concelho…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input max-w-[180px]" value={visitFilter} onChange={e => setVisitFilter(e.target.value as VisitStatus | '')}>
          <option value="">Todos os estados</option>
          {Object.entries(VISIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-[200px]" value={billingFilter} onChange={e => setBillingFilter(e.target.value as BillingStatus | '')}>
          <option value="">Todos (financeiro)</option>
          {Object.entries(BILLING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="p-6">
        {isLoading ? (
          <p className="text-sm text-gray-400">A carregar…</p>
        ) : filtered.length === 0 ? (
          <EmptyState message="Nenhum imóvel encontrado. Importa uma data-tape para começar." />
        ) : (
          <div className="card overflow-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Ref.</th>
                  <th>Portfólio</th>
                  <th>Morada</th>
                  <th>Concelho</th>
                  <th>Tipo</th>
                  <th>Tipologia</th>
                  <th>Área (m²)</th>
                  <th>Visita</th>
                  <th>Financeiro</th>
                  <th>Honorário</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/properties/${p.id}`} className="text-brand-600 hover:underline font-medium">
                        {p.ref}
                      </Link>
                    </td>
                    <td className="text-gray-500 text-xs">{p.portfolios?.name ?? '—'}</td>
                    <td className="text-gray-600 max-w-[200px] truncate">{p.address ?? '—'}</td>
                    <td className="text-gray-600">{p.municipality ?? '—'}</td>
                    <td className="text-gray-600">{p.property_type ?? '—'}</td>
                    <td className="text-gray-600">{p.typology ?? '—'}</td>
                    <td className="text-gray-600">{p.gross_area ?? '—'}</td>
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
    </div>
  )
}
