export function createTimerBadgeDataUrl(
  minutes: number,
  status: 'focus' | 'break' | 'paused' | 'overtime'
): string {
  if (typeof document === 'undefined') return ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    let bgColor = '#10b981' // emerald green for focus
    if (status === 'paused')
      bgColor = '#f43f5e' // rose red for paused (pause timer)
    else if (status === 'overtime')
      bgColor = '#ef4444' // apple red for overtime
    else if (status === 'break') bgColor = '#eab308' // yellow for break

    ctx.clearRect(0, 0, 32, 32)

    // Solid rounded rectangle badge for maximum pixel area and clarity in tray
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath()
      ctx.roundRect(0, 0, 32, 32, 7)
      ctx.fillStyle = bgColor
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(16, 16, 15, 0, Math.PI * 2)
      ctx.fillStyle = bgColor
      ctx.fill()
    }

    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (status === 'paused') {
      ctx.fillRect(9, 7, 4, 18)
      ctx.fillRect(19, 7, 4, 18)
    } else if (status === 'overtime') {
      const text = minutes > 99 ? '!' : `+${minutes}`
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(text, 16, 17)
    } else {
      const text = minutes > 99 ? '99+' : String(minutes)
      const fontSize = text.length >= 3 ? 12 : text.length === 2 ? 18 : 22
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      ctx.fillText(text, 16, 17)
    }

    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}
