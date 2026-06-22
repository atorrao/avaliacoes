import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState, Badge } from '@/components/ui'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function Portfolios() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState({ client_id: '', name: '', description: '', deadline: '', status: 'active' })

  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => {
      const { data } = await supabase.from('portfolios').select('*, clients(name), properties(count)').order('created_at', { ascending: false })
      return (data || []) as any[]
    }
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name').order('name')
      return (data || []) as any[]
    }
  })

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('portfolios').insert(form)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success('Portfólio criado')
      setModal(false)
      setForm({ client_id: '', name: '', description: '', deadline: '', status: 'active' })
    },
    onError: (e: any) => toast.error(e.message)
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('portfolios').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      toast.success('Eliminado')
    },
    onError: (e: any) => toast.error(e.message)
  })

  const statusLabel: any = { active: 'Activo', completed: 'Concluído', archived: 'Arquivado' }
  const statusBadge: any = { active: 'green', completed: 'blue', archived: 'gray' }

  return (
    <div>
      <PageHeader title="Portfólios" subtitle="Conjunto de imóveis por mandato ou cliente"
        actions={<button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={15}/> Novo portfólio</button>}
      />
      <div className="p-6">
        {isLoading ? <p className="text-sm text-gray-400">A carregar…</p>
          : portfolios.length === 0 ? <EmptyState message="Sem portfólios criados ainda." />
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {portfolios.map((p: any) => (
                <div key={p.id} className="card flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.clients?.name}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={statusBadge[p.status]}>{statusLabel[p.status]}</Badge>
                      <button className="btn p-1.5 text-red-500 hover:bg-red-50 ml-1"
                        onClick={() => { if (confirm('Eliminar portfólio?')) del.mutate(p.id) }}>
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>
                  {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50 text-xs text-gray-400">
                    <span>{p.properties?.[0]?.count || 0} imóveis</span>
                    {p.deadline && <span>Prazo: {p.deadline}</span>}
                    <Link to={`/properties?portfolio=${p.id}`} className="text-brand-500 flex items-center gap-0.5 hover:underline">
                      Ver imóveis <ChevronRight size={11}/>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold mb-5">Novo portfólio</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Cliente *</label>
                <select className="input" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                  <option value="">Seleccionar…</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Nome *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Descrição</label>
                <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="label">Prazo</label>
                <input type="date" className="input" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => create.mutate()} disabled={!form.client_id || !form.name || create.isPending}>
                {create.isPending ? 'A criar…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
