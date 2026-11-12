import { describe, expect, it } from 'vitest'
import {
  diasDesde,
  escaparLike,
  formatarData,
  formatarMoeda,
  formatarQuantidade,
  hojeISO,
  lerNumeroBR,
  normalizarBusca,
  numeroGarantia,
  numeroParaCampo,
  padraoBusca,
  textoDias,
} from './formato'
import { regrasSenha, senhaValida } from './senha'
import { nomeArquivoSeguro } from './exportar'

describe('formatação', () => {
  it('formata datas sem mudar o dia por causa do fuso', () => {
    expect(formatarData('2026-01-01')).toBe('01/01/2026')
    expect(formatarData('2026-11-05T00:00:00+00:00')).toBe('05/11/2026')
    expect(formatarData(null)).toBe('—')
    expect(formatarData('lixo')).toBe('—')
  })

  it('formata moeda e quantidade no padrão brasileiro', () => {
    expect(formatarMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
    expect(formatarQuantidade(1.5)).toBe('1,5')
    expect(formatarQuantidade(1000)).toBe('1.000')
    expect(formatarMoeda(null)).toBe('—')
  })

  it('número da garantia com 5 dígitos', () => {
    expect(numeroGarantia(12)).toBe('00012')
    expect(numeroGarantia(123456)).toBe('123456')
  })

  it('data de hoje e dias corridos', () => {
    expect(hojeISO(new Date(2026, 0, 9))).toBe('2026-01-09')
    expect(diasDesde('2026-01-01', new Date(2026, 0, 31))).toBe(30)
    expect(diasDesde('2026-03-01', new Date(2026, 2, 31, 23, 59))).toBe(30)
    expect(diasDesde(null)).toBeNull()
    expect(textoDias(0)).toBe('hoje')
    expect(textoDias(1)).toBe('há 1 dia')
    expect(textoDias(31)).toBe('há 31 dias')
  })
})

describe('lerNumeroBR', () => {
  it.each([
    ['1', 1],
    ['1,5', 1.5],
    ['150,50', 150.5],
    ['150.50', 150.5],
    ['1.234,56', 1234.56],
    ['1.500', 1500],
    ['R$ 2.000,00', 2000],
    ['0,001', 0.001],
  ])('"%s" -> %s', (texto, esperado) => {
    expect(lerNumeroBR(texto)).toBe(esperado)
  })

  it('vazio é null e lixo é NaN', () => {
    expect(lerNumeroBR('')).toBeNull()
    expect(lerNumeroBR('   ')).toBeNull()
    expect(lerNumeroBR('abc')).toBeNaN()
    expect(lerNumeroBR('1,2,3')).toBeNaN()
  })

  it('volta para o campo com vírgula', () => {
    expect(numeroParaCampo(1234.5)).toBe('1234,5')
    expect(numeroParaCampo(null)).toBe('')
  })
})

describe('busca', () => {
  it('remove acentos e normaliza espaços como o banco', () => {
    expect(normalizarBusca('  Peça  de   TRAÇÃO ')).toBe('peca de tracao')
    expect(normalizarBusca('JOSÉ DA SILVA')).toBe('jose da silva')
  })

  it('escapa curingas do LIKE', () => {
    expect(escaparLike('50%_a\\b')).toBe('50\\%\\_a\\\\b')
    expect(escaparLike('a*b')).toBe('a b')
  })

  it('monta padrão com várias palavras', () => {
    expect(padraoBusca('Filtro  Óleo')).toBe('%filtro%oleo%')
    expect(padraoBusca('   ')).toBeNull()
  })
})

describe('senha', () => {
  it('exige 10+ caracteres com maiúscula, minúscula e número', () => {
    expect(senhaValida('Abcdefghi1')).toBe(true)
    expect(senhaValida('abcdefghi1')).toBe(false)
    expect(senhaValida('ABCDEFGHI1')).toBe(false)
    expect(senhaValida('Abcdefghij')).toBe(false)
    expect(senhaValida('Abc1')).toBe(false)
    expect(regrasSenha('').every((r) => !r.ok)).toBe(true)
  })
})

describe('nome de arquivo seguro', () => {
  it('remove acentos, espaços e caracteres perigosos', () => {
    expect(nomeArquivoSeguro('Foto da peça (1).JPG')).toBe('Foto-da-peca-1-.JPG')
    expect(nomeArquivoSeguro('../../etc/passwd')).toBe('etc-passwd')
    expect(nomeArquivoSeguro('')).toBe('arquivo')
    expect(/^[A-Za-z0-9._-]+$/.test(nomeArquivoSeguro('çãõ <script>.pdf'))).toBe(true)
  })
})
