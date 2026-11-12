import { describe, expect, it } from 'vitest'
import { agruparPorMes, formatarPercentual, mesesDoPeriodo, rotuloMes, totalizar, variacao } from './compras'
import type { LinhaMensal } from './compras'

const linha = (mes: string, empresa: number, extra: Partial<LinhaMensal>): LinhaMensal => ({
  mes,
  empresa_id: empresa,
  notas: 0,
  fornecedores: 0,
  valor_total: 0,
  notas_com_referencia: 0,
  valor_referencia: 0,
  valor_pago_com_referencia: 0,
  saving: 0,
  ...extra,
})

describe('compras', () => {
  it('períodos', () => {
    const hoje = new Date(2026, 10, 12)
    expect(mesesDoPeriodo('12m', hoje)[0]).toBe('2025-12-01')
    expect(mesesDoPeriodo('12m', hoje).at(-1)).toBe('2026-11-01')
    expect(mesesDoPeriodo('ano', hoje)).toHaveLength(11)
    expect(mesesDoPeriodo('anoAnterior', hoje)[0]).toBe('2025-01-01')
  })

  it('soma as empresas por mês e preenche meses vazios', () => {
    const meses = ['2026-09-01', '2026-10-01']
    const r = agruparPorMes(
      [
        linha('2026-10-01', 1, { notas: 3, valor_total: 3000, notas_com_referencia: 2, valor_referencia: 2200, valor_pago_com_referencia: 2000, saving: 200 }),
        linha('2026-10-01', 2, { notas: 1, valor_total: 1000, notas_com_referencia: 1, valor_referencia: 1100, valor_pago_com_referencia: 1000, saving: 100 }),
      ],
      meses,
    )
    expect(r[0].notas).toBe(0)
    expect(r[1]).toMatchObject({ notas: 4, valor: 4000, saving: 300, referencia: 3300 })
    const t = totalizar(r)
    expect(t.notas).toBe(4)
    expect(t.ticketMedio).toBe(1000)
    expect(t.cobertura).toBe(0.75)
    expect(t.savingPercentual).toBeCloseTo(300 / 3300)
  })

  it('formatações', () => {
    expect(rotuloMes('2026-11-01')).toMatch(/^nov/)
    expect(formatarPercentual(0.0915)).toBe('9,2%')
    expect(formatarPercentual(null)).toBe('—')
    expect(variacao(120, 100)).toBeCloseTo(0.2)
    expect(variacao(5, 0)).toBeNull()
  })
})
