// Re-encode photographed notes so the upload contains only oriented pixels, without camera metadata.
export async function prepareReceptionPhoto(original: File): Promise<File> {
  const image = new Image()
  const url = URL.createObjectURL(original)
  try {
    image.src = url
    await image.decode()
    const scale = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error()
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error()
    return new File([blob], 'reception-photo.jpg', { type: 'image/jpeg' })
  } catch {
    throw new Error('无法读取这张照片，请重新拍照或选择 JPEG、PNG、WebP 图片。')
  } finally {
    URL.revokeObjectURL(url)
  }
}
