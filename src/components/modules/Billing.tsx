import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, BillingBadge, VisitBadge } from '@/components/ui'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { BillingStatus } from '@/types/database'
import { BILLING_STATUS_LABELS } from '@/types/database'

const STAGES: BillingStatus[] = ['no_po','awaiting_po','po_received','invoice_pending','invoice_issued','paid']

export default function Billing() {
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['billing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, ref, address, municipality, visit_status, billing_status, fee_amount, po_number, invoice_number, payment_date, clients(name)')
        .order('ref')
      if (error) throw error
      return data ?? []
    }
  })

  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = properties.filter((p: any) => p.billing_status === s)
    return acc
  }, {} as Record<BillingStatus, any[]>)

  const total    = properties.reduce((s: number, p: any) => s + (p.fee_amount ?? 0), 0)
  const received = properties.filter((p: any) => p.billing_status === 'paid').reduce((s: number, p: any) => s + (p.fee_amount ?? 0), 0)
  const pending  = total - received

  return (
    <div>
      <PageHeader title="Faturação" subtitle="Pipeline financeiro por processo" />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 bg-white border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-500 mb-1">Total honorários</p>
          <p className="text-xl font-semibold text-gray-900">{formatCurrency(total)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Recebido</p>
          <p className="text-xl font-semibold text-emerald-600">{formatCurrency(received)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Por receber</p>
          <p className="text-xl font-semibold text-amber-600">{formatCurrency(pending)}</p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {isLoading ? <p className="text-gray-400 text-sm">A carregar…</p> : (
          STAGES.map(stage => {
            const items = byStage[stage]
            if (!items.length) return null
            const stageTotal = items.reduce((s: number, p: any) => s + (p.fee_amount ?? 0), 0)
            return (
              <div key={stage} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BillingBadge status={stage} />
                    <span className="text-sm text-gray-500">{items.length} processos</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{formatCurrency(stageTotal)}</span>
                </div>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Ref.</th>
                      <th>Cliente</th>
                      <th>Localização</th>
                      <th>Visita</th>
                      <th>Honorário</th>
                      <th>PO</th>
                      <th>Fatura</th>
                      <th>Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/properties/${p.id}`} className="text-brand-600 hover:underline font-medium">
                            {p.ref}
                          </Link>
                        </td>
                        <td className="text-gray-500 text-xs">{p.clients?.name ?? '—'}</td>
                        <td className="text-gray-600">{p.municipality ?? p.address ?? '—'}</td>
                        <td><VisitBadge status={p.visit_status} /></td>
                        <td className="font-medium">{p.fee_amount ? formatCurrency(p.fee_amount) : '—'}</td>
                        <td className="text-gray-500">{p.po_number ?? '—'}</td>
                        <td className="text-gray-500">{p.invoice_number ?? '—'}</td>
                        <td className="text-gray-400">{p.payment_date ? formatDate(p.payment_date) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
