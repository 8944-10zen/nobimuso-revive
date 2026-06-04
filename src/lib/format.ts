export function formatPostDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value))
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export function stripHtmlPreservingLineBreaks(html: string): string {
  const htmlWithLineBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
  const doc = new DOMParser().parseFromString(htmlWithLineBreaks, 'text/html')
  const text = doc.body.textContent?.replace(/\r\n?/g, '\n') ?? ''

  return text
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function truncateText(value: string, maxLength: number, omission = ''): string {
  const characters = Array.from(value)

  if (characters.length <= maxLength) {
    return value
  }

  return `${characters.slice(0, maxLength).join('')}${omission}`
}
