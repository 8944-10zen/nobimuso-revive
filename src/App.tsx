import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Heart, Sparkles, Star } from 'lucide-react'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import './App.css'
import heroLogo from './assets/nobilogo-hero.png'
import headerLogo from './assets/nobilogo-header.png'
import { formatPostDate, stripHtml } from './lib/format'
import { fetchPost, fetchPosts, getAuthorName, getFeaturedImage, type WpPost, type WpPostPage } from './lib/wpApi'

const POSTS_PER_PAGE = 7
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

function App() {
  const location = useLocation()

  return (
    <div className="app-shell">
      <TapFlareLayer />
      <SiteHeader />
      <div className="route-stage" key={location.pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/post/:id" element={<PostPage />} />
        </Routes>
      </div>
      <SiteFooter />
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

function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page header-inner">
        <Link className="brand" to="/">
          <img className="brand-logo" src={headerLogo} alt="濃尾無双RE:VIVE" width="240" height="130" />
        </Link>
      </div>
    </header>
  )
}

function HomePage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [state, setState] = useState<AsyncState<WpPostPage>>({ status: 'loading' })

  useEffect(() => {
    let ignore = false

    fetchPosts(currentPage, POSTS_PER_PAGE)
      .then((page) => {
        if (!ignore) {
          setState({ status: 'success', data: page })
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
  }, [currentPage])

  function handlePageChange(page: number) {
    setState({ status: 'loading' })
    setCurrentPage(page)
  }

  return (
    <main>
      <section className="hero">
        <div className="page hero-box">
          <HeroDecor />
          <div className="hero-content">
            <h1 className="sr-only">濃尾無双RE:VIVE</h1>
            <img className="hero-logo" src={heroLogo} alt="濃尾無双RE:VIVE" width="500" height="270" />
            <p className="hero-lead">
              虎子たちはここに集まっていたんだね
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="latest">
        <div className="page">
          <div className="section-head">
            <div>
              <h2 className="section-title">最新記事</h2>
            </div>
          </div>
          <PostList currentPage={currentPage} state={state} onPageChange={handlePageChange} />
        </div>
      </section>
    </main>
  )
}

function HeroDecor() {
  return (
    <div className="hero-decor" aria-hidden="true">
      <Star className="hero-charm charm-left-1 charm-pink" fill="currentColor" />
      <Sparkles className="hero-charm charm-left-2 charm-orange" />
      <Heart className="hero-charm charm-left-3 charm-blue" fill="currentColor" />
      <Star className="hero-charm charm-right-1 charm-blue" fill="currentColor" />
      <Sparkles className="hero-charm charm-right-2 charm-green" />
      <Heart className="hero-charm charm-right-3 charm-pink" fill="currentColor" />
    </div>
  )
}

function PostList({
  currentPage,
  state,
  onPageChange,
}: {
  currentPage: number
  state: AsyncState<WpPostPage>
  onPageChange: (page: number) => void
}) {
  if (state.status === 'loading') {
    return <LoadingIndicator />
  }

  if (state.status === 'error') {
    return <StatusCard title="記事を取得できませんでした" text={state.error} tone="error" />
  }

  if (state.data.posts.length === 0) {
    return <StatusCard title="投稿がありません" text="公開済みの記事が見つかりませんでした。" />
  }

  const [pickup, ...posts] = state.data.posts

  return (
    <>
      <PostCard post={pickup} variant="pickup" />
      {posts.length > 0 && (
        <div className="post-grid">
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} index={index + 1} />
          ))}
        </div>
      )}
      <Pagination
        currentPage={currentPage}
        totalPages={state.data.totalPages}
        total={state.data.total}
        onPageChange={onPageChange}
      />
    </>
  )
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

function PostCard({ post, variant, index = 0 }: { post: WpPost; variant?: 'pickup'; index?: number }) {
  const image = getFeaturedImage(post)
  const authorName = getAuthorName(post)
  const title = stripHtml(post.title.rendered)
  const excerpt = stripHtml(post.excerpt.rendered)

  return (
    <Link
      className={`post-card ${variant === 'pickup' ? 'pickup' : ''}`}
      style={{ '--card-index': index } as CSSProperties}
      to={`/post/${post.id}`}
    >
      <PostImage imageUrl={image?.source_url} alt={image?.alt_text || title} className="thumb" placeholderKey={post.id} />
      <div className="post-body">
        <div className="meta">
          <span className="chip">{formatPostDate(post.date)}</span>
          {authorName && <span>{authorName}</span>}
        </div>
        <h3 className="post-title">{title}</h3>
        {excerpt && <p className="post-excerpt">{excerpt}</p>}
      </div>
    </Link>
  )
}

function PostPage() {
  const { id } = useParams()
  const [state, setState] = useState<AsyncState<WpPost>>({ status: 'loading' })

  useEffect(() => {
    if (!id) {
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
  }, [id])

  if (!id) {
    return (
      <main className="article-page">
        <div className="page article-shell">
          <StatusCard title="記事を取得できませんでした" text="記事IDが指定されていません。" tone="error" />
        </div>
      </main>
    )
  }

  return (
    <main className="article-page">
      <div className="page article-shell">
        {state.status === 'loading' && <LoadingIndicator />}
        {state.status === 'error' && <StatusCard title="記事を取得できませんでした" text={state.error} tone="error" />}
        {state.status === 'success' && <Article post={state.data} />}
      </div>
    </main>
  )
}

function Article({ post }: { post: WpPost }) {
  const image = getFeaturedImage(post)
  const authorName = getAuthorName(post)
  const title = useMemo(() => stripHtml(post.title.rendered), [post.title.rendered])

  return (
    <>
      <article className="article-card">
        <PostImage
          imageUrl={image?.source_url}
          alt={image?.alt_text || title}
          className="article-cover"
          placeholderKey={post.id}
        />
        <div className="article-body">
          <div className="meta">
            <span className="chip">{formatPostDate(post.date)}</span>
            {authorName && <span>{authorName}</span>}
          </div>
          <h1 className="article-title">{title}</h1>
          <div className="article-content" dangerouslySetInnerHTML={{ __html: post.content.rendered }} />
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
    return (
      <div className={className}>
        <img src={imageUrl} alt={alt} loading="lazy" />
      </div>
    )
  }

  const placeholderImage = getPlaceholderImage(placeholderKey)

  if (placeholderImage) {
    return (
      <div className={`${className} thumb-placeholder`}>
        <img src={placeholderImage} alt="" loading="lazy" />
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
    <div className="loading-card" role="status" aria-live="polite" aria-label="記事を読み込み中">
      <span className="loading-spinner" aria-hidden="true" />
      <span>読み込み中...</span>
    </div>
  )
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
