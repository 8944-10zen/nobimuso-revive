const WP_API_BASE = 'https://edit.nobimuso.com/wp-json/wp/v2'

export type WpRendered = {
  rendered: string
}

export type WpFeaturedMedia = {
  source_url?: string
  alt_text?: string
  media_details?: {
    width?: number
    height?: number
  }
}

export type WpPost = {
  id: number
  date: string
  slug: string
  link: string
  title: WpRendered
  excerpt: WpRendered
  content: WpRendered
  _embedded?: {
    'wp:featuredmedia'?: WpFeaturedMedia[]
  }
}

async function requestWp<T>(path: string): Promise<T> {
  const response = await fetch(`${WP_API_BASE}${path}`)

  if (!response.ok) {
    throw new Error(`WordPress API error: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function fetchPosts(): Promise<WpPost[]> {
  return requestWp<WpPost[]>('/posts?_embed&per_page=10')
}

export function fetchPost(id: string): Promise<WpPost> {
  return requestWp<WpPost>(`/posts/${id}?_embed`)
}

export function getFeaturedImage(post: WpPost): WpFeaturedMedia | undefined {
  return post._embedded?.['wp:featuredmedia']?.[0]
}
