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
  author: number
  title: WpRendered
  excerpt: WpRendered
  content: WpRendered
  tags?: number[]
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

export type WpPostFilter = 'all' | 'microposts' | 'articles'

export type WpCredentials = {
  username: string
  applicationPassword: string
}

export type WpCurrentUser = {
  id: number
  name: string
}

type WpTag = {
  id: number
  name: string
  slug: string
}

type WpApiErrorKind = 'auth' | 'validation' | 'server' | 'network' | 'tag' | 'unknown'

export class WpApiError extends Error {
  status?: number
  kind: WpApiErrorKind

  constructor(message: string, kind: WpApiErrorKind, status?: number) {
    super(message)
    this.name = 'WpApiError'
    this.kind = kind
    this.status = status
  }
}

async function requestWp<T>(path: string): Promise<T> {
  const response = await fetch(`${WP_API_BASE}${path}`, {
    credentials: 'omit',
  })

  if (!response.ok) {
    throw new Error(`WordPress API error: ${response.status}`)
  }

  return response.json() as Promise<T>
}

function getBasicAuthHeader(credentials: WpCredentials): string {
  const value = `${credentials.username}:${credentials.applicationPassword}`
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return `Basic ${window.btoa(binary)}`
}

function getErrorKind(status: number): WpApiErrorKind {
  if (status === 401 || status === 403) {
    return 'auth'
  }

  if (status === 400) {
    return 'validation'
  }

  if (status >= 500) {
    return 'server'
  }

  return 'unknown'
}

function getStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return '認証情報が無効です。ユーザー名とアプリケーションパスワードを確認してください。'
  }

  if (status === 400) {
    return '投稿内容またはリクエスト内容をWordPressが受け付けませんでした。'
  }

  if (status >= 500) {
    return 'WordPress側でエラーが発生しました。時間を置いて再度お試しください。'
  }

  return `WordPress API error: ${status}`
}

async function requestWpWithAuth<T>(
  path: string,
  credentials: WpCredentials,
  init: RequestInit = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${WP_API_BASE}${path}`, {
      ...init,
      credentials: 'omit',
      headers: {
        ...init.headers,
        Authorization: getBasicAuthHeader(credentials),
      },
    })
  } catch {
    throw new WpApiError('WordPressと通信できませんでした。ネットワークやCORS設定を確認してください。', 'network')
  }

  if (!response.ok) {
    throw new WpApiError(getStatusMessage(response.status), getErrorKind(response.status), response.status)
  }

  return response.json() as Promise<T>
}

export async function fetchPosts(
  page = 1,
  perPage = 6,
  filter: WpPostFilter = 'all',
  micropostTagId?: number | null,
): Promise<WpPostPage> {
  const params = new URLSearchParams({
    _embed: '1',
    per_page: String(perPage),
    page: String(page),
  })

  if (filter === 'microposts' && micropostTagId) {
    params.set('tags', String(micropostTagId))
  }

  if (filter === 'articles' && micropostTagId) {
    params.set('tags_exclude', String(micropostTagId))
  }

  const response = await fetch(`${WP_API_BASE}/posts?${params.toString()}`, {
    credentials: 'omit',
  })

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
  return requestWp<WpPost>(`/posts/${encodeURIComponent(id)}?_embed`)
}

export function verifyWpCredentials(credentials: WpCredentials): Promise<WpCurrentUser> {
  return requestWpWithAuth<WpCurrentUser>('/users/me', credentials)
}

export async function fetchMicropostTagId(): Promise<number | null> {
  const tags = await requestWp<WpTag[]>('/tags?slug=micropost')

  return tags[0]?.id ?? null
}

export async function getOrCreateMicropostTagId(credentials: WpCredentials): Promise<number> {
  const tags = await requestWpWithAuth<WpTag[]>('/tags?slug=micropost', credentials)

  if (tags[0]?.id) {
    return tags[0].id
  }

  try {
    const tag = await requestWpWithAuth<WpTag>('/tags', credentials, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'micropost',
        slug: 'micropost',
      }),
    })

    return tag.id
  } catch (error) {
    if (error instanceof WpApiError && error.kind === 'auth') {
      throw new WpApiError('WordPress管理画面でmicropostタグを作成してください。', 'tag', error.status)
    }

    throw error
  }
}

export function createMicropost(content: string, tagId: number, credentials: WpCredentials): Promise<WpPost> {
  return requestWpWithAuth<WpPost>('/posts', credentials, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      title: `micropost-${new Date().toISOString()}`,
      status: 'publish',
      tags: [tagId],
    }),
  })
}

export function deleteWpPost(postId: number, credentials: WpCredentials): Promise<unknown> {
  return requestWpWithAuth<unknown>(`/posts/${postId}`, credentials, {
    method: 'DELETE',
  })
}

export function getFeaturedImage(post: WpPost): WpFeaturedMedia | undefined {
  return post._embedded?.['wp:featuredmedia']?.[0]
}

export function getAuthorName(post: WpPost): string | undefined {
  const author = post._embedded?.author?.[0]

  return author?.display_name || author?.name
}
