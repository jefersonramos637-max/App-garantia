// Leitura de arquivos .xlsx e .csv no navegador.
import readXlsxFile from 'read-excel-file/browser'
import Papa from 'papaparse'
import type { Linhas } from './planilha'

export interface Aba {
  nome: string
  linhas: Linhas
}

export const LIMITE_ARQUIVO_PLANILHA = 15 * 1024 * 1024

/** Decodifica texto em UTF-8; se não for UTF-8 válido, usa Windows-1252 (CSV do Excel em português). */
export function decodificarTexto(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export function lerCsv(texto: string): Linhas {
  const resultado = Papa.parse<string[]>(texto, { skipEmptyLines: 'greedy' })
  return resultado.data
}

export async function lerArquivoPlanilha(arquivo: File): Promise<Aba[]> {
  const nome = arquivo.name.toLowerCase()
  if (arquivo.size > LIMITE_ARQUIVO_PLANILHA) {
    throw new Error('Arquivo muito grande (máximo 15 MB). Divida a lista em partes.')
  }
  if (nome.endsWith('.xls') || nome.endsWith('.ods')) {
    throw new Error(
      'Este formato não é suportado. Abra o arquivo no Excel e use "Salvar como" > ' +
        '"Pasta de Trabalho do Excel (*.xlsx)" ou "CSV", e envie novamente.',
    )
  }
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
    const texto = decodificarTexto(await arquivo.arrayBuffer())
    return [{ nome: arquivo.name, linhas: lerCsv(texto) }]
  }
  if (nome.endsWith('.xlsx') || nome.endsWith('.xlsm')) {
    try {
      const abas = await readXlsxFile(arquivo)
      return abas.map((a) => ({ nome: a.sheet, linhas: a.data as Linhas }))
    } catch (e) {
      console.error(e)
      throw new Error('Não foi possível ler a planilha. Confira se o arquivo é um Excel (.xlsx) válido e não está protegido por senha.', { cause: e })
    }
  }
  throw new Error('Envie um arquivo Excel (.xlsx) ou CSV (.csv).')
}
