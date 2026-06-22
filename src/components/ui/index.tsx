import type { VisitStatus, BillingStatus } from '@/types/database'
import { VISIT_STATUS_LABELS, BILLING_STATUS_LABELS } from '@/types/database'
import type { ReactNode } from 'react'

// ── Badge ────────────────────────────────────────────────────
type BadgeVariant = 'green' | 'amber' | 'blue' | 'gray' | 'red' | 'purple'
interface BadgeProps { variant?: BadgeVariant; children: ReactNode }

export function Badge({ variant = 'gray', children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

// ── Visit status badge ───────────────────────────────────────
const visitVariant: Record<VisitStatus, BadgeVariant> = {
  pending:     'gray',
  scheduled:   'blue',
  visited:     'amber',
  report_done: 'green',
}
export function VisitBadge({ status }: { status: VisitStatus }) {
  return <Badge variant={visitVariant[status]}>{VISIT_STATUS_LABELS[status]}</Badge>
}

// ── Billing status badge ─────────────────────────────────────
const billingVariant: Record<BillingStatus, BadgeVariant> = {
  no_po:           'red',
  awaiting_po:     'amber',
  po_received:     'purple',
  invoice_pending: 'blue',
  invoice_issued:  'blue',
  paid:            'green',
}
export function BillingBadge({ status }: { status: BillingStatus }) {
  return <Badge variant={billingVariant[status]}>{BILLING_STATUS_LABELS[status]}</Badge>
}

// ── Page header ──────────────────────────────────────────────
interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-white">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────
interface KpiProps {
  label: string
  value: string | number
  sub?: string
  color?: 'default' | 'green' | 'amber' | 'red'
}
export function KpiCard({ label, value, sub, color = 'default' }: KpiProps) {
  const textColor = {
    default: 'text-gray-900',
    green:   'text-emerald-600',
    amber:   'text-amber-600',
    red:     'text-red-600',
  }[color]

  return (
    <div className="card">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${textColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <p className="text-sm">{message}</p>
    </div>
  )
}
