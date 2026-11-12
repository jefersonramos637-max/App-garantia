// Reduz fotos grandes (ex.: câmera do celular) antes de enviar: economiza espaço e internet.

const LADO_MAXIMO = 1920
const QUALIDADE = 0.85
const COMPRIMIR_ACIMA_DE = 600 * 1024

export async function prepararImagem(arquivo: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) return arquivo
  if (arquivo.size <= COMPRIMIR_ACIMA_DE) return arquivo
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const largura = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext('2d')
    if (!ctx) return arquivo
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, largura, altura)
    ctx.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE))
    if (!blob || blob.size >= arquivo.size) return arquivo
    const nome = arquivo.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return arquivo
  }
}
