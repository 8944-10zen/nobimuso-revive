import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import DOMPurify, { type Config } from 'dompurify'
import { LogIn, LogOut, PenLine, RefreshCw, Trash2, UserRound, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import './App.css'
import headerLogo from './assets/nobilogo-header.png'
import { formatPostDate, stripHtml, stripHtmlPreservingLineBreaks } from './lib/format'
import {
  WpApiError,
  createMicropost,
  deleteWpPost,
  fetchMicropostTagId,
  fetchPost,
  fetchPosts,
  getAuthorName,
  getFeaturedImage,
  getOrCreateMicropostTagId,
  verifyWpCredentials,
  type WpCredentials,
  type WpPostFilter,
  type WpPost,
  type WpPostPage,
} from './lib/wpApi'

const POSTS_PER_PAGE = 7
const MICROPOST_MAX_LENGTH = 140
const MICROPOST_CREATED_EVENT = 'micropost-created'
const MICROPOST_DELETED_EVENT = 'micropost-deleted'
const WP_ORIGIN = 'https://edit.nobimuso.com'
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:'])
const YOUTUBE_EMBED_ORIGINS = new Set(['https://www.youtube.com', 'https://www.youtube-nocookie.com'])
const WP_CONTENT_SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ['iframe'],
  ADD_ATTR: [
    'allow',
    'allowfullscreen',
    'decoding',
    'frameborder',
    'height',
    'loading',
    'referrerpolicy',
    'rel',
    'src',
    'target',
    'title',
    'width',
  ],
  FORBID_TAGS: [
    'base',
    'button',
    'embed',
    'form',
    'input',
    'link',
    'meta',
    'object',
    'option',
    'script',
    'select',
    'style',
    'textarea',
  ],
  FORBID_ATTR: [
    'autofocus',
    'contenteditable',
    'formaction',
    'nonce',
    'ping',
    'sandbox',
    'srcdoc',
    'style',
    'xlink:href',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
} satisfies Config
const placeholderImages = Object.values(
  import.meta.glob<string>('./assets/placeholders/*.{png,jpg,jpeg,webp,avif}', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
).sort()

type AsyncState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: string }

type TapFlare = {
  id: number
  x: number
  y: number
}

type WpSession = {
  credentials: WpCredentials | null
  setCredentials: Dispatch<SetStateAction<WpCredentials | null>>
  currentUserId: number | null
  setCurrentUserId: Dispatch<SetStateAction<number | null>>
  currentUserName: string
  setCurrentUserName: Dispatch<SetStateAction<string>>
  clearCredentials: () => void
  micropostTagId: number | null
  setMicropostTagId: Dispatch<SetStateAction<number | null>>
}

function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}

function isSafeUrl(value: string, allowedProtocols: Set<string>): boolean {
  try {
    const url = new URL(value, window.location.origin)

    return allowedProtocols.has(url.protocol)
  } catch {
    return false
  }
}

function getSafeImageUrl(value?: string): string | undefined {
  if (!value || !isSafeUrl(value, SAFE_IMAGE_PROTOCOLS)) {
    return undefined
  }

  return value
}

function sanitizeSrcSet(value: string): string {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .filter((candidate) => {
      const [url] = candidate.split(/\s+/, 1)

      return Boolean(url && isSafeUrl(url, SAFE_IMAGE_PROTOCOLS))
    })
    .join(', ')
}

function isSafeYouTubeEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin)

    return YOUTUBE_EMBED_ORIGINS.has(url.origin) && url.pathname.startsWith('/embed/')
  } catch {
    return false
  }
}

function sanitizeWpContent(html: string): string {
  const sanitized = DOMPurify.sanitize(html, WP_CONTENT_SANITIZE_CONFIG)
  const template = document.createElement('template')
  template.innerHTML = sanitized

  template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = link.getAttribute('href')

    if (!href || !isSafeUrl(href, SAFE_URL_PROTOCOLS)) {
      link.removeAttribute('href')
      return
    }

    link.setAttribute('rel', 'noopener noreferrer')
    link.setAttribute('referrerpolicy', 'no-referrer')

    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin && url.origin !== WP_ORIGIN) {
      link.setAttribute('target', '_blank')
    }
  })

  template.content.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const src = image.getAttribute('src')

    if (src && !isSafeUrl(src, SAFE_IMAGE_PROTOCOLS)) {
      image.removeAttribute('src')
    }

    const srcSet = image.getAttribute('srcset')
    if (srcSet) {
      const safeSrcSet = sanitizeSrcSet(srcSet)

      if (safeSrcSet) {
        image.setAttribute('srcset', safeSrcSet)
      } else {
        image.removeAttribute('srcset')
      }
    }

    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    image.setAttribute('referrerpolicy', 'no-referrer')
  })

  template.content.querySelectorAll<HTMLIFrameElement>('iframe').forEach((frame) => {
    const src = frame.getAttribute('src')

    if (!src || !isSafeYouTubeEmbedUrl(src)) {
      frame.remove()
      return
    }

    frame.setAttribute('loading', 'lazy')
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    frame.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    )
    frame.setAttribute('allowfullscreen', '')
  })

  return template.innerHTML
}

function App() {
  const location = useLocation()
  const [credentials, setCredentials] = useState<WpCredentials | null>(null)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [currentUserName, setCurrentUserName] = useState('')
  const [micropostTagId, setMicropostTagId] = useState<number | null>(null)

  function clearCredentials() {
    setCredentials(null)
    setCurrentUserId(null)
    setCurrentUserName('')
    setMicropostTagId(null)
  }

  const session = {
    credentials,
    setCredentials,
    currentUserId,
    setCurrentUserId,
    currentUserName,
    setCurrentUserName,
    clearCredentials,
    micropostTagId,
    setMicropostTagId,
  }

  return (
    <div className="app-shell">
      <TapFlareLayer />
      <SiteHeader session={session} />
      <div className="route-stage" key={location.pathname}>
        <Routes>
          <Route path="/" element={<HomePage session={session} />} />
          <Route path="/post/:id" element={<PostPage session={session} />} />
        </Routes>
      </div>
      <SiteFooter />
      <MicropostComposer session={session} />
    </div>
  )
}

function TapFlareLayer() {
  const [flares, setFlares] = useState<TapFlare[]>([])
  const nextId = useRef(0)

  useEffect(() => {
    const timers = new Set<ReturnType<typeof window.setTimeout>>()

    function addFlare(event: PointerEvent) {
      if (event.button !== 0) {
        return
      }

      const id = nextId.current
      nextId.current += 1

      setFlares((current) => [...current, { id, x: event.clientX, y: event.clientY }])

      const timer = window.setTimeout(() => {
        setFlares((current) => current.filter((flare) => flare.id !== id))
        timers.delete(timer)
      }, 760)

      timers.add(timer)
    }

    window.addEventListener('pointerdown', addFlare, { passive: true })

    return () => {
      window.removeEventListener('pointerdown', addFlare)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  return (
    <div className="tap-flare-layer" aria-hidden="true">
      {flares.map((flare) => (
        <span
          className="tap-flare"
          key={flare.id}
          style={{ '--tap-x': `${flare.x}px`, '--tap-y': `${flare.y}px` } as CSSProperties}
        />
      ))}
    </div>
  )
}

function SiteHeader({ session }: { session: WpSession }) {
  return (
    <header className="site-header">
      <div className="page header-inner">
        <Link className="brand" to="/">
          <img className="brand-logo" src={headerLogo} alt="濃尾無双RE:VIVE" width="240" height="130" />
        </Link>
        <HeaderAuthControls session={session} />
      </div>
    </header>
  )
}

function HeaderAuthControls({ session }: { session: WpSession }) {
  const [isOpen, setIsOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [applicationPassword, setApplicationPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const isLoggedIn = Boolean(session.credentials && session.currentUserId)

  function handleLogout() {
    session.clearCredentials()
    setApplicationPassword('')
    setAuthError('')
    setIsOpen(false)
  }

  async function handleAuthenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    const nextCredentials = {
      username: username.trim(),
      applicationPassword,
    }

    if (!nextCredentials.username || !nextCredentials.applicationPassword) {
      setAuthError('ユーザー名とアプリケーションパスワードを入力してください。')
      setAuthLoading(false)
      return
    }

    try {
      const user = await verifyWpCredentials(nextCredentials)
      session.setCredentials(nextCredentials)
      session.setCurrentUserId(user.id)
      session.setCurrentUserName(user.name)
      setApplicationPassword('')
      setIsOpen(false)
    } catch (error) {
      setAuthError(getFriendlyErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <div className="header-auth">
      <span className="header-auth-status">
        <UserRound size={15} aria-hidden="true" />
        {isLoggedIn ? `${session.currentUserName || 'ログイン中'}` : '未ログイン'}
      </span>
      {isLoggedIn ? (
        <button className="header-auth-button" type="button" onClick={handleLogout}>
          <LogOut size={15} aria-hidden="true" />
          ログアウト
        </button>
      ) : (
        <button className="header-auth-button" type="button" onClick={() => setIsOpen(true)}>
          <LogIn size={15} aria-hidden="true" />
          ログイン
        </button>
      )}

      {isOpen && (
        <ModalPortal>
          <div className="composer-modal" role="presentation">
            <div className="composer-panel auth-panel" role="dialog" aria-modal="true" aria-labelledby="header-auth-title">
              <button className="composer-close" type="button" aria-label="閉じる" onClick={() => setIsOpen(false)}>
                <X size={20} aria-hidden="true" />
              </button>
              <form className="composer-form" onSubmit={handleAuthenticate}>
                <h2 id="header-auth-title">WordPress認証</h2>
                <label className="composer-field">
                  <span>ユーザー名</span>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="composer-field">
                  <span>アプリケーションパスワード</span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={applicationPassword}
                    onChange={(event) => setApplicationPassword(event.target.value)}
                  />
                </label>
                {authError && (
                  <p className="composer-message composer-message-error" role="alert">
                    {authError}
                  </p>
                )}
                <div className="composer-actions">
                  <button className="composer-secondary-button" type="button" onClick={() => setIsOpen(false)}>
                    キャンセル
                  </button>
                  <button className="composer-primary-button" type="submit" disabled={authLoading}>
                    {authLoading ? '認証中...' : 'ログイン'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

function HomePage({ session }: { session: WpSession }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [postFilter, setPostFilter] = useState<WpPostFilter>('all')
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState<AsyncState<WpPostPage>>({ status: 'loading' })
  const { micropostTagId, setMicropostTagId } = session

  useEffect(() => {
    let ignore = false

    async function loadPosts() {
      try {
        let filterTagId = micropostTagId

        if (postFilter !== 'all' && !filterTagId) {
          filterTagId = await fetchMicropostTagId()

          if (!ignore) {
            setMicropostTagId(filterTagId)
          }
        }

        if (postFilter !== 'all' && !filterTagId) {
          if (!ignore) {
            setState({ status: 'success', data: { posts: [], total: 0, totalPages: 1 } })
          }

          return
        }

        const page = await fetchPosts(currentPage, POSTS_PER_PAGE, postFilter, filterTagId)

        if (!ignore) {
          setState({ status: 'success', data: page })
        }
      } catch (error: unknown) {
        if (!ignore) {
          setState({
            status: 'error',
            error: error instanceof Error ? error.message : '記事を取得できませんでした。',
          })
        }
      }
    }

    loadPosts()

    return () => {
      ignore = true
    }
  }, [currentPage, postFilter, refreshKey, micropostTagId, setMicropostTagId])

  useEffect(() => {
    function refreshPosts() {
      setState({ status: 'loading' })
      setCurrentPage(1)
      setRefreshKey((value) => value + 1)
    }

    window.addEventListener(MICROPOST_CREATED_EVENT, refreshPosts)
    window.addEventListener(MICROPOST_DELETED_EVENT, refreshPosts)

    return () => {
      window.removeEventListener(MICROPOST_CREATED_EVENT, refreshPosts)
      window.removeEventListener(MICROPOST_DELETED_EVENT, refreshPosts)
    }
  }, [])

  function handlePageChange(page: number) {
    setState({ status: 'loading' })
    setCurrentPage(page)
  }

  function handleFilterChange(filter: WpPostFilter) {
    if (filter === postFilter) {
      return
    }

    setState({ status: 'loading' })
    setCurrentPage(1)
    setPostFilter(filter)
  }

  function handleReload() {
    setState({ status: 'loading' })
    setRefreshKey((value) => value + 1)
  }

  return (
    <main>
      <section className="section timeline-section" id="latest">
        <div className="page timeline-page">
          <div className="timeline-head">
            <h1>最新記事</h1>
            <div className="timeline-controls">
              <PostFilterControls currentFilter={postFilter} onFilterChange={handleFilterChange} />
              <button
                className="post-reload-button"
                type="button"
                onClick={handleReload}
                disabled={state.status === 'loading'}
              >
                <RefreshCw aria-hidden="true" size={16} strokeWidth={3} />
                <span>{state.status === 'loading' ? '読込中' : '再読み込み'}</span>
              </button>
            </div>
          </div>
          <PostList
            currentPage={currentPage}
            state={state}
            session={session}
            filter={postFilter}
            onPageChange={handlePageChange}
          />
        </div>
      </section>
    </main>
  )
}

const postFilterOptions: Array<{ value: WpPostFilter; label: string }> = [
  { value: 'all', label: '全て表示' },
  { value: 'microposts', label: '短文のみ' },
  { value: 'articles', label: '記事のみ' },
]

function PostFilterControls({
  currentFilter,
  onFilterChange,
}: {
  currentFilter: WpPostFilter
  onFilterChange: (filter: WpPostFilter) => void
}) {
  return (
    <div className="post-filter" role="group" aria-label="投稿表示の切り替え">
      {postFilterOptions.map((option) => (
        <button
          className="post-filter-button"
          type="button"
          key={option.value}
          aria-pressed={option.value === currentFilter}
          onClick={() => onFilterChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function getEmptyPostFilterText(filter: WpPostFilter): string {
  if (filter === 'microposts') {
    return '公開済みの短文投稿が見つかりませんでした。'
  }

  if (filter === 'articles') {
    return '公開済みの記事が見つかりませんでした。'
  }

  return '公開済みの記事が見つかりませんでした。'
}

function PostList({
  currentPage,
  state,
  session,
  filter,
  onPageChange,
}: {
  currentPage: number
  state: AsyncState<WpPostPage>
  session: WpSession
  filter: WpPostFilter
  onPageChange: (page: number) => void
}) {
  const micropostTagId = useMicropostTagId(session)
  const { currentUserId } = session

  if (state.status === 'loading') {
    return <LoadingIndicator />
  }

  if (state.status === 'error') {
    return <StatusCard title="記事を取得できませんでした" text={state.error} tone="error" />
  }

  if (state.data.posts.length === 0) {
    return <StatusCard title="投稿がありません" text={getEmptyPostFilterText(filter)} />
  }

  return (
    <>
      <div className="post-feed">
        {state.data.posts.map((post, index) => (
          (() => {
            const isMicropost = Boolean(micropostTagId && post.tags?.includes(micropostTagId))

            return (
              <PostCard
                key={post.id}
                post={post}
                index={index}
                isMicropost={isMicropost}
                canDelete={Boolean(currentUserId && isMicropost && post.author === currentUserId)}
                session={session}
              />
            )
          })()
        ))}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={state.data.totalPages}
        total={state.data.total}
        onPageChange={onPageChange}
      />
    </>
  )
}

function useMicropostTagId(session: WpSession): number | null {
  const { micropostTagId, setMicropostTagId } = session

  useEffect(() => {
    if (micropostTagId) {
      return
    }

    let ignore = false

    fetchMicropostTagId()
      .then((tagId) => {
        if (!ignore) {
          setMicropostTagId(tagId)
        }
      })
      .catch(() => {
        if (!ignore) {
          setMicropostTagId(null)
        }
      })

    return () => {
      ignore = true
    }
  }, [micropostTagId, setMicropostTagId])

  return micropostTagId
}

function Pagination({
  currentPage,
  totalPages,
  total,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) {
    return null
  }

  const pages = getVisiblePages(currentPage, totalPages)

  function goToPage(page: number) {
    onPageChange(page)
    document.getElementById('latest')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="pagination" aria-label="記事一覧のページ切り替え">
      <p className="pagination-summary">
        {total}件中 {currentPage} / {totalPages} ページ
      </p>
      <div className="pagination-controls">
        <button
          className="pagination-button"
          type="button"
          aria-label="最初のページへ"
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
        >
          &lt;&lt;
        </button>
        <button
          className="pagination-button"
          type="button"
          aria-label="前のページへ"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          &lt;
        </button>
        <div className="pagination-pages">
          {pages.map((page) => (
            <button
              className="pagination-page"
              type="button"
              key={page}
              onClick={() => goToPage(page)}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          ))}
        </div>
        <button
          className="pagination-button"
          type="button"
          aria-label="次のページへ"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          &gt;
        </button>
        <button
          className="pagination-button"
          type="button"
          aria-label="最後のページへ"
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
        >
          &gt;&gt;
        </button>
      </div>
    </nav>
  )
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 3) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage === 1) {
    return [1, 2, 3]
  }

  if (currentPage === totalPages) {
    return [totalPages - 2, totalPages - 1, totalPages]
  }

  return [currentPage - 1, currentPage, currentPage + 1]
}

function PostCard({
  post,
  index = 0,
  isMicropost,
  canDelete,
  session,
}: {
  post: WpPost
  index?: number
  isMicropost: boolean
  canDelete: boolean
  session: WpSession
}) {
  const authorName = getAuthorName(post)
  const title = stripHtml(post.title.rendered)
  const stripPostText = isMicropost ? stripHtmlPreservingLineBreaks : stripHtml
  const bodyText = stripPostText(post.content.rendered) || stripPostText(post.excerpt.rendered)
  const bodyCharacters = Array.from(bodyText)
  const hasMore = bodyCharacters.length > 140
  const excerpt = hasMore ? bodyCharacters.slice(0, 140).join('') : bodyText
  const cardStyle = { '--card-index': index } as CSSProperties
  const cardContent = (
    <>
      <span className="card-tape card-tape-top" aria-hidden="true" />
      <span className="card-tape card-tape-bottom" aria-hidden="true" />
      {authorName && <strong className="author-pill">{authorName}</strong>}
      <div className="post-body">
        <div className="meta post-meta">
          <span>{formatPostDate(post.date)}</span>
        </div>
        {!isMicropost && <h3 className="post-title">{title}</h3>}
        {excerpt && <p className="post-excerpt">{excerpt}</p>}
        {hasMore && <span className="read-more-button">続きを読む</span>}
      </div>
      {canDelete && <DeleteMicropostButton postId={post.id} postLabel={excerpt || title} session={session} />}
    </>
  )

  if (!hasMore || isMicropost) {
    return (
      <article
        className={`post-card ${hasMore ? 'has-read-more' : ''} ${isMicropost ? 'is-micropost' : ''}`}
        style={cardStyle}
      >
        {cardContent}
      </article>
    )
  }

  return (
    <Link
      className="post-card post-card-link has-read-more"
      style={cardStyle}
      to={`/post/${post.id}`}
    >
      {cardContent}
    </Link>
  )
}

type DeleteView = 'closed' | 'auth' | 'confirm'

function DeleteMicropostButton({
  postId,
  postLabel,
  session,
}: {
  postId: number
  postLabel: string
  session: WpSession
}) {
  const [view, setView] = useState<DeleteView>('closed')
  const [username, setUsername] = useState('')
  const [applicationPassword, setApplicationPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  function openDeleteFlow() {
    setAuthError('')
    setDeleteError('')
    setView(session.credentials ? 'confirm' : 'auth')
  }

  async function handleAuthenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    const nextCredentials = {
      username: username.trim(),
      applicationPassword,
    }

    if (!nextCredentials.username || !nextCredentials.applicationPassword) {
      setAuthError('ユーザー名とアプリケーションパスワードを入力してください。')
      setAuthLoading(false)
      return
    }

    try {
      const user = await verifyWpCredentials(nextCredentials)
      session.setCredentials(nextCredentials)
      session.setCurrentUserId(user.id)
      session.setCurrentUserName(user.name)
      setApplicationPassword('')
      setView('confirm')
    } catch (error) {
      setAuthError(getFriendlyErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleDelete() {
    const currentCredentials = session.credentials

    if (!currentCredentials) {
      setView('auth')
      return
    }

    setDeleteError('')
    setIsDeleting(true)

    try {
      const user = await verifyWpCredentials(currentCredentials)
      session.setCurrentUserId(user.id)
      session.setCurrentUserName(user.name)
      await deleteWpPost(postId, currentCredentials)
      setView('closed')
      window.dispatchEvent(new Event(MICROPOST_DELETED_EVENT))
    } catch (error) {
      if (error instanceof WpApiError && error.kind === 'auth') {
        session.clearCredentials()
        setAuthError('認証情報が無効になりました。もう一度認証してください。')
        setView('auth')
        return
      }

      setDeleteError(getFriendlyErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button
        className="micropost-delete-button"
        type="button"
        aria-label="この短文投稿を削除する"
        onClick={openDeleteFlow}
      >
        <Trash2 size={16} aria-hidden="true" />
        削除
      </button>

      {view !== 'closed' && (
        <ModalPortal>
        <div className="composer-modal" role="presentation">
          <div
            className="composer-panel delete-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={view === 'auth' ? `delete-auth-title-${postId}` : `delete-confirm-title-${postId}`}
          >
            <button className="composer-close" type="button" aria-label="閉じる" onClick={() => setView('closed')}>
              <X size={20} aria-hidden="true" />
            </button>

            {view === 'auth' ? (
              <form className="composer-form" onSubmit={handleAuthenticate}>
                <h2 id={`delete-auth-title-${postId}`}>WordPress認証</h2>
                <label className="composer-field">
                  <span>ユーザー名</span>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="composer-field">
                  <span>アプリケーションパスワード</span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={applicationPassword}
                    onChange={(event) => setApplicationPassword(event.target.value)}
                  />
                </label>
                {authError && (
                  <p className="composer-message composer-message-error" role="alert">
                    {authError}
                  </p>
                )}
                <div className="composer-actions">
                  <button className="composer-secondary-button" type="button" onClick={() => setView('closed')}>
                    キャンセル
                  </button>
                  <button className="composer-primary-button" type="submit" disabled={authLoading}>
                    {authLoading ? '認証中...' : '認証する'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="composer-form">
                <h2 id={`delete-confirm-title-${postId}`}>短文投稿を削除</h2>
                <p className="delete-confirm-text">{postLabel || `投稿ID ${postId}`}</p>
                {deleteError && (
                  <p className="composer-message composer-message-error" role="alert">
                    {deleteError}
                  </p>
                )}
                <div className="composer-actions">
                  <button className="composer-secondary-button" type="button" onClick={() => setView('closed')}>
                    キャンセル
                  </button>
                  <button className="composer-danger-button" type="button" disabled={isDeleting} onClick={handleDelete}>
                    {isDeleting ? '削除中...' : '削除する'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}

function PostPage({ session }: { session: WpSession }) {
  const { id } = useParams()
  const hasValidPostId = Boolean(id && /^\d+$/.test(id))
  const micropostTagId = useMicropostTagId(session)
  const [state, setState] = useState<AsyncState<WpPost>>({ status: 'loading' })

  useEffect(() => {
    if (!id || !hasValidPostId) {
      return
    }

    let ignore = false

    fetchPost(id)
      .then((post) => {
        if (!ignore) {
          setState({ status: 'success', data: post })
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setState({
            status: 'error',
            error: error instanceof Error ? error.message : '記事を取得できませんでした。',
          })
        }
      })

    return () => {
      ignore = true
    }
  }, [id, hasValidPostId])

  if (!id) {
    return (
      <main className="article-page">
        <div className="page article-shell">
          <StatusCard title="記事を取得できませんでした" text="記事IDが指定されていません。" tone="error" />
        </div>
      </main>
    )
  }

  if (!hasValidPostId) {
    return (
      <main className="article-page">
        <div className="page article-shell">
          <StatusCard title="記事を取得できませんでした" text="記事IDの形式が正しくありません。" tone="error" />
        </div>
      </main>
    )
  }

  return (
    <main className="article-page">
      <div className="page article-shell">
        {state.status === 'loading' && <LoadingIndicator />}
        {state.status === 'error' && <StatusCard title="記事を取得できませんでした" text={state.error} tone="error" />}
        {state.status === 'success' && (
          <Article post={state.data} isMicropost={Boolean(micropostTagId && state.data.tags?.includes(micropostTagId))} />
        )}
      </div>
    </main>
  )
}

function Article({ post, isMicropost }: { post: WpPost; isMicropost: boolean }) {
  const image = getFeaturedImage(post)
  const authorName = getAuthorName(post)
  const title = useMemo(() => stripHtml(post.title.rendered), [post.title.rendered])
  const sanitizedContent = useMemo(() => sanitizeWpContent(post.content.rendered), [post.content.rendered])

  return (
    <>
      <article className="article-card">
        <span className="card-tape card-tape-top" aria-hidden="true" />
        <span className="card-tape card-tape-bottom" aria-hidden="true" />
        {authorName && <strong className="author-pill article-author">{authorName}</strong>}
        <PostImage
          imageUrl={image?.source_url}
          alt={image?.alt_text || title}
          className="article-cover"
          placeholderKey={post.id}
        />
        <div className="article-body">
          <div className="meta">
            <span className="chip">{formatPostDate(post.date)}</span>
          </div>
          {!isMicropost && <h1 className="article-title">{title}</h1>}
          <div className="article-content" dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
        </div>
      </article>
      <div className="article-footer-nav">
        <Link className="small-link-card" to="/">
          <span>Back</span>
          記事一覧へ戻る
        </Link>
      </div>
    </>
  )
}

function PostImage({
  imageUrl,
  alt,
  className,
  placeholderKey,
}: {
  imageUrl?: string
  alt: string
  className: string
  placeholderKey: number | string
}) {
  if (imageUrl) {
    const safeImageUrl = getSafeImageUrl(imageUrl)

    if (!safeImageUrl) {
      return (
        <div className={`${className} thumb-placeholder`}>
          <span>RE:VIVE</span>
        </div>
      )
    }

    return (
      <div className={className}>
        <img src={safeImageUrl} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </div>
    )
  }

  const placeholderImage = getPlaceholderImage(placeholderKey)

  if (placeholderImage) {
    return (
      <div className={`${className} thumb-placeholder`}>
        <img src={placeholderImage} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </div>
    )
  }

  return (
    <div className={`${className} thumb-placeholder`}>
      <span>RE:VIVE</span>
    </div>
  )
}

function getPlaceholderImage(key: number | string): string | undefined {
  if (placeholderImages.length === 0) {
    return undefined
  }

  const value = String(key)
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return placeholderImages[hash % placeholderImages.length]
}

function StatusCard({ title, text, tone }: { title: string; text: string; tone?: 'error' }) {
  return (
    <div className={`status-card ${tone === 'error' ? 'status-card-error' : ''}`}>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

function LoadingIndicator() {
  return (
    <ModalPortal>
      <div className="loading-modal" role="dialog" aria-modal="true" aria-label="記事を読み込み中">
        <div className="loading-panel" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>読み込み中...</span>
        </div>
      </div>
    </ModalPortal>
  )
}

type ComposerView = 'closed' | 'auth' | 'compose'

function MicropostComposer({ session }: { session: WpSession }) {
  const [view, setView] = useState<ComposerView>('closed')
  const [username, setUsername] = useState('')
  const [applicationPassword, setApplicationPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [content, setContent] = useState('')
  const [postError, setPostError] = useState('')
  const [postSuccess, setPostSuccess] = useState('')
  const [isPosting, setIsPosting] = useState(false)

  const characterCount = Array.from(content).length
  const validationError = getMicropostValidationError(content)
  const canPost = !validationError && !isPosting

  useEffect(() => {
    if (view === 'closed') {
      return
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setView('closed')
      }
    }

    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [view])

  async function openComposer() {
    setAuthError('')
    setPostError('')
    setPostSuccess('')

    if (!session.credentials) {
      setView('auth')
      return
    }

    try {
      const user = await verifyWpCredentials(session.credentials)
      session.setCurrentUserId(user.id)
      session.setCurrentUserName(user.name)
      setView('compose')
    } catch (error) {
      if (error instanceof WpApiError && error.kind === 'auth') {
        session.clearCredentials()
        setAuthError('認証情報が無効になりました。もう一度認証してください。')
        setView('auth')
        return
      }

      setPostError(getFriendlyErrorMessage(error))
      setView('compose')
    }
  }

  async function handleAuthenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    const nextCredentials = {
      username: username.trim(),
      applicationPassword,
    }

    if (!nextCredentials.username || !nextCredentials.applicationPassword) {
      setAuthError('ユーザー名とアプリケーションパスワードを入力してください。')
      setAuthLoading(false)
      return
    }

    try {
      const user = await verifyWpCredentials(nextCredentials)
      session.setCredentials(nextCredentials)
      session.setCurrentUserId(user.id)
      session.setCurrentUserName(user.name)
      setApplicationPassword('')
      setView('compose')
    } catch (error) {
      setAuthError(getFriendlyErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPostError('')
    setPostSuccess('')

    const currentCredentials = session.credentials

    if (!currentCredentials) {
      setView('auth')
      return
    }

    if (validationError) {
      setPostError(validationError)
      return
    }

    setIsPosting(true)

    try {
      const user = await verifyWpCredentials(currentCredentials)
      session.setCurrentUserId(user.id)
      session.setCurrentUserName(user.name)

      const tagId = session.micropostTagId ?? (await getOrCreateMicropostTagId(currentCredentials))
      session.setMicropostTagId(tagId)

      await createMicropost(content, tagId, currentCredentials)
      setContent('')
      setPostSuccess('短文を投稿しました。')
      window.dispatchEvent(new Event(MICROPOST_CREATED_EVENT))
    } catch (error) {
      if (error instanceof WpApiError && error.kind === 'auth') {
        session.clearCredentials()
        setView('auth')
        setAuthError(error.message)
        return
      }

      setPostError(getFriendlyErrorMessage(error))
    } finally {
      setIsPosting(false)
    }
  }

  function handleContentChange(value: string) {
    const nextContent = limitMicropostContent(value)

    setContent(nextContent)
    setPostError('')
    setPostSuccess('')
  }

  return (
    <>
      <button className="micropost-fab" type="button" aria-label="短文を投稿する" onClick={openComposer}>
        <PenLine size={25} aria-hidden="true" />
      </button>

      {view !== 'closed' && (
        <ModalPortal>
        <div className="composer-modal" role="presentation">
          <div
            className="composer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={view === 'auth' ? 'auth-title' : 'composer-title'}
          >
            <button className="composer-close" type="button" aria-label="閉じる" onClick={() => setView('closed')}>
              <X size={20} aria-hidden="true" />
            </button>

            {view === 'auth' ? (
              <form className="composer-form" onSubmit={handleAuthenticate}>
                <h2 id="auth-title">WordPress認証</h2>
                <label className="composer-field">
                  <span>ユーザー名</span>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="composer-field">
                  <span>アプリケーションパスワード</span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={applicationPassword}
                    onChange={(event) => setApplicationPassword(event.target.value)}
                  />
                </label>
                {authError && (
                  <p className="composer-message composer-message-error" role="alert">
                    {authError}
                  </p>
                )}
                <div className="composer-actions">
                  <button className="composer-secondary-button" type="button" onClick={() => setView('closed')}>
                    キャンセル
                  </button>
                  <button className="composer-primary-button" type="submit" disabled={authLoading}>
                    {authLoading ? '認証中...' : '認証する'}
                  </button>
                </div>
              </form>
            ) : (
              <form className="composer-form" onSubmit={handleSubmit}>
                <h2 id="composer-title">短文投稿</h2>
                <label className="composer-field">
                  <span className="sr-only">投稿本文</span>
                  <textarea
                    value={content}
                    rows={6}
                    placeholder="いま書きたいこと"
                    onChange={(event) => handleContentChange(event.target.value)}
                  />
                </label>
                <div className="composer-count" aria-live="polite">
                  {characterCount} / {MICROPOST_MAX_LENGTH}
                </div>
                {(postError || validationError) && (
                  <p className="composer-message composer-message-error" role="alert">
                    {postError || validationError}
                  </p>
                )}
                {postSuccess && (
                  <p className="composer-message composer-message-success" role="status">
                    {postSuccess}
                  </p>
                )}
                <div className="composer-actions">
                  <button className="composer-secondary-button" type="button" onClick={() => setView('closed')}>
                    閉じる
                  </button>
                  <button className="composer-primary-button" type="submit" disabled={!canPost}>
                    {isPosting ? '投稿中...' : '投稿する'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}

function limitMicropostContent(value: string): string {
  return Array.from(value).slice(0, MICROPOST_MAX_LENGTH).join('')
}

function getMicropostValidationError(value: string): string {
  const characterCount = Array.from(value).length

  if (!value.trim()) {
    return '本文を入力してください。'
  }

  if (characterCount > MICROPOST_MAX_LENGTH) {
    return `${MICROPOST_MAX_LENGTH}文字以内で入力してください。`
  }

  if (/[<>]/.test(value) || /<\/?[a-z][\s\S]*>/i.test(value)) {
    return 'HTMLタグとして解釈される可能性のある文字は投稿できません。'
  }

  if (hasBlockedControlCharacter(value)) {
    return '使用できない制御文字が含まれています。'
  }

  return ''
}

function hasBlockedControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)

    return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)
  })
}

function getFriendlyErrorMessage(error: unknown): string {
  if (error instanceof WpApiError) {
    return error.message
  }

  return '処理に失敗しました。時間を置いて再度お試しください。'
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page footer-inner">
        <img className="footer-logo" src={headerLogo} alt="濃尾無双RE:VIVE" width="240" height="130" />
        <span className="copyright">© 2026 濃尾無双RE:VIVE</span>
      </div>
    </footer>
  )
}

export default App
