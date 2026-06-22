import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, KpiCard, VisitBadge, BillingBadge } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Link } from 'react-router-dom'
import type { Property } from '@/types/database'

function useStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [propsRes, recentRes] = await Promise.all([
        supabase.from('properties').select('visit_status, billing_status, fee_amount'),
        supabase.from('properties')
          .select('id, ref, address, municipality, property_type, typology, visit_status, billing_status, fee_amount, updated_at')
          .order('updated_at', { ascending: false })
          .limit(8),
      ])
      return {
        properties: propsRes.data ?? [],
        recent: recentRes.data ?? [],
      }
    }
  })
}

export default function Dashboard() {
  const { data, isLoading } = useStats()

  const total    = data?.properties.length ?? 0
  const visited  = data?.properties.filter(p => p.visit_status !== 'pending').length ?? 0
  const reportOk = data?.properties.filter(p => p.visit_status === 'report_done').length ?? 0

  const toReceive = data?.properties
    .filter(p => ['awaiting_po','po_received','invoice_pending','invoice_issued'].includes(p.billing_status))
    .reduce((s, p) => s + (p.fee_amount ?? 0), 0) ?? 0

  const pct = total > 0 ? Math.round((visited / total) * 100) : 0

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral do portfólio" />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Total portfólio"      value={total}           sub="imóveis" />
          <KpiCard label="Visitados"             value={`${pct}%`}       sub={`${visited} de ${total}`} color="green" />
          <KpiCard label="Reports concluídos"   value={reportOk}        sub="imóveis" color="green" />
          <KpiCard label="A receber"             value={formatCurrency(toReceive)} sub="PO + faturas"  color={toReceive > 0 ? 'amber' : 'default'} />
        </div>

        {/* Progresso */}
        <div className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 font-medium">Progresso do portfólio</span>
            <span className="text-gray-500">{visited} / {total} visitados</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-400 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Últimos processos */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Últimos processos</h2>
            <Link to="/properties" className="text-xs text-brand-600 hover:underline">Ver todos →</Link>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 py-4 text-center">A carregar…</p>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Ref.</th>
                  <th>Localização</th>
                  <th>Tipo</th>
                  <th>Visita</th>
                  <th>Financeiro</th>
                  <th>Honorário</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {data?.recent.map((p: Property) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/properties/${p.id}`} className="text-brand-600 hover:underline font-medium">
                        {p.ref}
                      </Link>
                    </td>
                    <td className="text-gray-600">{p.municipality ?? p.address ?? '—'}</td>
                    <td className="text-gray-600">{[p.property_type, p.typology].filter(Boolean).join(' ') || '—'}</td>
                    <td><VisitBadge status={p.visit_status} /></td>
                    <td><BillingBadge status={p.billing_status} /></td>
                    <td className="text-gray-600">{p.fee_amount ? formatCurrency(p.fee_amount) : '—'}</td>
                    <td className="text-gray-400">{formatDate(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
