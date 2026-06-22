import { PageHeader } from '@/components/ui'
import { ExternalLink, Info } from 'lucide-react'

const PORTALS = [
  { name: 'Idealista', url: 'https://www.idealista.pt', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { name: 'Imovirtual', url: 'https://www.imovirtual.com', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { name: 'Casa Sapo', url: 'https://casa.sapo.pt', color: 'bg-green-50 text-green-700 border-green-200' },
  { name: 'ERA', url: 'https://www.era.pt', color: 'bg-red-50 text-red-700 border-red-200' },
  { name: 'Remax', url: 'https://www.remax.pt', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { name: 'BPI Expresso', url: 'https://www.bpiexpressoimovel.com', color: 'bg-gray-50 text-gray-700 border-gray-200' },
]

export default function MarketSearch() {
  return (
    <div>
      <PageHeader title="Prospeção de mercado" subtitle="Acesso rápido aos portais e registo de comparáveis" />
      <div className="p-6 space-y-6 max-w-2xl">

        <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">Sobre scraping automático</p>
            <p className="text-amber-700">Os portais imobiliários portugueses bloqueiam acesso automatizado e proíbem-no nos seus termos de serviço. Por isso, a prospeção é feita manualmente: abre o portal, pesquisa, e regista os comparáveis relevantes na ficha do imóvel (tab "Comparáveis").</p>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Abrir portal</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PORTALS.map(p => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between px-4 py-3 rounded-lg border text-sm font-medium transition-opacity hover:opacity-80 ${p.color}`}
              >
                {p.name}
                <ExternalLink size={13} />
              </a>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Como registar comparáveis</h2>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Vai a <strong>Imóveis</strong> e abre a ficha do imóvel em análise</li>
            <li>Clica no tab <strong>Comparáveis</strong></li>
            <li>Preenche o formulário com os dados do anúncio encontrado</li>
            <li>O €/m² é calculado automaticamente e a mediana é apresentada na tabela</li>
            <li>Ao gerar o report Excel, os comparáveis são incluídos automaticamente</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
