import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/ui'
import { Plus, Pencil, Trash2, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface FormState {
  name: string; nif: string; email: string
  phone: string; address: string; notes: string
}
const empty: FormState = { name: '', nif: '', email: '', phone: '', address: '', notes: '' }

export default function Clients() {
  const qc = useQueryClient()
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, client_templates(count), portfolios(count)')
        .order('name')
      if (error) throw error
      return (data ?? []) as any[]
    }
  })

  const [modal, setModal]   = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm]     = useState<FormState>(empty)

  const upsert = useMutation({
    mutationFn: async (f: FormState) => {
      if (editing) {
        const { error } = await supabase.from('clients').update(f).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clients').insert(f)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(editing ? 'Cliente actualizado' : 'Cliente criado')
      setModal(null); setEditing(null); setForm(empty)
    },
    onError: (e: any) => toast.error(e.message)
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast.success('Cliente eliminado') },
    onError: (e: any) => toast.error(e.message)
  })

  function openCreate() { setEditing(null); setForm(empty); setModal('create') }
  function openEdit(c: any) {
    setEditing(c)
    setForm({ name: c.name, nif: c.nif ?? '', email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', notes: c.notes ?? '' })
    setModal('edit')
  }

  const fields: [keyof FormState, string, string][] = [
    ['name',    'Nome *',         'text' ],
    ['nif',     'NIF',            'text' ],
    ['email',   'Email',          'email'],
    ['phone',   'Telefone',       'text' ],
    ['address', 'Morada',         'text' ],
    ['notes',   'Notas internas', 'text' ],
  ]

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Empresas e entidades que encomendam avaliações"
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={15} /> Novo cliente
          </button>
        }
      />

      <div className="p-6">
        {isLoading ? (
          <p className="text-sm text-gray-400">A carregar…</p>
        ) : clients.length === 0 ? (
          <EmptyState message="Sem clientes. Cria o primeiro." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((c: any) => (
              <div key={c.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    {c.nif && <p className="text-xs text-gray-400">NIF {c.nif}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button className="btn p-1.5" onClick={() => openEdit(c)}><Pencil size={13} /></button>
                    <button
                      className="btn p-1.5 text-red-500 hover:bg-red-50"
                      onClick={() => { if (confirm('Eliminar cliente?')) del.mutate(c.id) }}
                    ><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  {c.email   && <p>{c.email}</p>}
                  {c.phone   && <p>{c.phone}</p>}
                  {c.address && <p>{c.address}</p>}
                </div>
                <div className="flex gap-3 mt-auto pt-2 border-t border-gray-50 text-xs text-gray-400">
                  <span>{c.portfolios?.[0]?.count ?? 0} portfólios</span>
                  <span>{c.client_templates?.[0]?.count ?? 0} templates</span>
                  <a href={`/portfolios?client=${c.id}`} className="ml-auto text-brand-500 flex items-center gap-0.5 hover:underline">
                    Ver <ChevronRight size={11} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold mb-5">{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
            <div className="space-y-3">
              {fields.map(([key, label, type]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    type={type}
                    className="input"
                    value={form[key]}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="btn" onClick={() => { setModal(null); setEditing(null) }}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => upsert.mutate(form)}
                disabled={!form.name || upsert.isPending}
              >
                {upsert.isPending ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
