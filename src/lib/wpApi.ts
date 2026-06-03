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

export type WpAuthor = {
  id: number
  name: string
  display_name?: string
  link?: string
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
    author?: WpAuthor[]
  }
}

export type WpPostPage = {
  posts: WpPost[]
  total: number
  totalPages: number
}

async function requestWp<T>(path: string): Promise<T> {
  const response = await fetch(`${WP_API_BASE}${path}`)

  if (!response.ok) {
    throw new Error(`WordPress API error: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function fetchPosts(page = 1, perPage = 6): Promise<WpPostPage> {
  const response = await fetch(`${WP_API_BASE}/posts?_embed&per_page=${perPage}&page=${page}`)

  if (!response.ok) {
    throw new Error(`WordPress API error: ${response.status}`)
  }

  const posts = (await response.json()) as WpPost[]

  return {
    posts,
    total: Number(response.headers.get('X-WP-Total') ?? posts.length),
    totalPages: Number(response.headers.get('X-WP-TotalPages') ?? 1),
  }
}

export function fetchPost(id: string): Promise<WpPost> {
  return requestWp<WpPost>(`/posts/${id}?_embed`)
}

export function getFeaturedImage(post: WpPost): WpFeaturedMedia | undefined {
  return post._embedded?.['wp:featuredmedia']?.[0]
}

export function getAuthorName(post: WpPost): string | undefined {
  const author = post._embedded?.author?.[0]

  return author?.display_name || author?.name
}
