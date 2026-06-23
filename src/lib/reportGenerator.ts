import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

function v(val: any, def: any = '') { return val !== null && val !== undefined ? val : def }

function fmtDate(val: any): string {
  if (!val) return ''
  try {
    const s = String(val).slice(0, 10)
    const [y, m, d] = s.split('-')
    if (!y || !m || !d) return String(val)
    return `${d}/${m}/${y}`
  } catch { return String(val) }
}

function fmtArea(val: any): string {
  if (val === null || val === undefined || val === '') return ''
  const f = parseFloat(String(val))
  if (isNaN(f)) return ''
  return f === Math.floor(f) ? String(Math.floor(f)) : f.toFixed(2).replace('.', ',')
}

async function fetchBuf(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return r.arrayBuffer()
  } catch { return null }
}

export async function generateAbancaReport(
  property: any,
  photos: { url: string; slot?: number }[],
  comps: any[],
  templateUrl: string
): Promise<void> {
  const tmplBuf = await fetchBuf(templateUrl)
  if (!tmplBuf) throw new Error('Não foi possível carregar o template. Verifica a variável VITE_REPORT_TEMPLATE_URL.')

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(tmplBuf)

  const ws = wb.getWorksheet('RELATÓRIO - PT')
  if (!ws) throw new Error('Folha "RELATÓRIO - PT" não encontrada.')

  const p = property

  function set(ref: string, val: any) {
    if (val === null || val === undefined || val === '') return
    ws.getCell(ref).value = val
  }

  // 1. IDENTIFICAÇÃO
  set('F8',  fmtDate(p.data_relatorio || new Date().toISOString()))
  set('F10', v(p.nr_relatorio, v(p.ref)))
  set('X9',  v(p.tipo_servico, 'Avaliação'))
  set('X10', v(p.finalidade, 'Adjudicado sem visita interior'))
  set('X11', v(p.external_ref, v(p.ref)))

  // 2. MORADA
  set('D19',  v(p.tipo_via))
  set('I19',  v(p.street, v(p.address)))
  set('X19',  v(p.number))
  set('Z19',  v(p.floor_letter))
  set('AB19', v(p.fracao))
  set('AD19', v(p.block))
  set('D25',  v(p.postal_code))
  set('I25',  v(p.district))
  set('P25',  v(p.municipality))
  set('W25',  v(p.parish))
  if (p.longitude) set('D31', p.longitude)
  if (p.latitude)  set('G31', p.latitude)

  // 3. DESCRIÇÃO
  set('D38',  v(p.property_type))
  set('K38',  v(p.property_subtype))
  set('U38',  v(p.use_type))
  set('AD38', v(p.use_subtype))
  set('D44',  v(p.estado_construcao, v(p.property_state)))
  set('O44',  v(p.destino))
  set('V44',  v(p.estado_conservacao))
  set('AC44', v(p.estado_ocupacao))
  set('D50',  v(p.composicao_imovel, v(p.typology)))
  set('D56',  v(p.id_registo_predial))
  set('D62',  v(p.id_registo_matricial))
  set('G62',  v(p.fracao))
  set('D68',  v(p.tipo_predio))

  // 4. LOCALIZAÇÃO
  set('J75', v(p.caract_mercado))
  set('J78', v(p.tipo_expectativa_mercado))
  set('J79', v(p.ocupacao_laboral))
  set('J80', v(p.populacao_concelho))
  set('J81', v(p.evolucao_mercado, 'Tendencialmente positiva'))

  // 5. CONSTRUÇÃO
  if (p.nr_quartos)         set('D86', Number(p.nr_quartos))
  if (p.nr_inst_sanitarias) set('G86', Number(p.nr_inst_sanitarias))
  set('J86', v(p.nr_pisos, 1))
  set('L86', v(p.qualidade_construcao, 'Média'))
  set('P86', v(p.orientacao_solar, 'Não influi no valor'))
  set('D92', v(p.nr_certificado_energ))
  set('J92', v(p.classe_energetica))
  set('N92', fmtDate(p.data_emissao_cert))
  set('R92', fmtDate(p.data_validade_cert))
  set('M98', v(p.year_built))
  set('D98', v(p.ano_licenca_utilizacao))

  // 6. ÁREAS
  const areaVal = p.area_considerada || p.area_m2 || p.gross_area
  set('D105', v(p.composicao_imovel, v(p.typology)))
  set('L105', fmtArea(p.land_area))
  set('Q105', fmtArea(areaVal))
  set('T105', fmtArea(p.area_annex_m2))

  // 7. COMPARÁVEIS
  comps.slice(0, 3).forEach((c: any, idx: number) => {
    const row  = 116 + idx
    const desc = v(c.notes, `${v(c.portal)} ref.${v(c.listing_ref)}`)
    set(`D${row}`, desc)
    set(`T${row}`, fmtArea(c.area_m2))
    const price = parseFloat(c.price || 0)
    const area  = parseFloat(c.area_m2 || 0)
    if (price > 0 && area > 0) {
      set(`Z${row}`,  Math.round(price / area * 100) / 100)
      set(`AE${row}`, price)
    }
  })

  // 14. CONDICIONALISMOS
  set('B248', v(p.prev_valuation_conditions, 'Nenhum'))

  // 16. CONCLUSÃO
  if (p.valor_mercado)            set('D265', Number(p.valor_mercado))
  if (p.valor_venda_rapida)       set('J265', Number(p.valor_venda_rapida))
  if (p.valor_seguro)             set('R265', Number(p.valor_seguro))
  if (p.valor_mercado_atual)      set('D272', Number(p.valor_mercado_atual))
  if (p.valor_venda_rapida_atual) set('J272', Number(p.valor_venda_rapida_atual))

  // 18. CERTIFICAÇÃO
  set('K303',  fmtDate(p.data_pedido_relatorio || p.data_pedido))
  set('O303',  fmtDate(p.data_visita || p.visit_date))
  set('V303',  fmtDate(p.data_conclusao || p.data_relatorio))
  set('AC303', fmtDate(p.prev_valuation_date))
  set('D306',  v(p.perito_avaliador))

  // FOTOS
  if (photos.length > 0) {
    let wsf = wb.getWorksheet('Fotos do Imóvel')
    if (!wsf) wsf = wb.addWorksheet('Fotos do Imóvel')

    wsf.getCell('A1').value = 'RELATÓRIO DE AVALIAÇÃO IMOBILIÁRIA'
    wsf.getCell('A1').font  = { bold: true, size: 14 }
    wsf.getCell('A2').value = 'ANEXO — FOTOS DO IMÓVEL'
    wsf.getCell('A2').font  = { bold: true, size: 12 }
    wsf.getCell('A3').value = `Ref: ${v(p.ref)}  —  ${v(p.street, v(p.address))}  —  ${v(p.municipality)}`
    wsf.getColumn(1).width = 45
    wsf.getColumn(5).width = 45

    let row = 5, col = 0 // 0-indexed for ExcelJS

    for (let i = 0; i < Math.min(photos.length, 10); i++) {
      const photo = photos[i]
      if (!photo.url) continue
      try {
        const buf = await fetchBuf(photo.url)
        if (!buf) continue
        const ext = photo.url.toLowerCase().includes('.png') ? 'png' : 'jpeg'
        const imgId = wb.addImage({ buffer: buf as Buffer, extension: ext })
        wsf.addImage(imgId, { tl: { col, row: row - 1 }, ext: { width: 300, height: 220 } })
        wsf.getRow(row).height = 165
        wsf.getCell(row + 15, col + 1).value = `Foto ${i + 1}`
        if (col === 0) { col = 4 } else { col = 0; row += 17 }
      } catch { /* skip */ }
    }
  }

  // Download
  const buf = await wb.xlsx.writeBuffer()
  const ref  = v(p.ref, 'imovel').replace(/[^a-zA-Z0-9_-]/g, '_')
  const date = new Date().toISOString().slice(0, 10)
  saveAs(
    new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Relatorio_${ref}_${date}.xlsx`
  )
}
