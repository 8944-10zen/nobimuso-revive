import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import './App.css'
import { formatPostDate, stripHtml } from './lib/format'
import { fetchPost, fetchPosts, getAuthorName, getFeaturedImage, type WpPost, type WpPostPage } from './lib/wpApi'

const POSTS_PER_PAGE = 7

type AsyncState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: string }

function App() {
  const location = useLocation()

  return (
    <div className="app-shell">
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

function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page header-inner">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            RE
          </span>
          <span className="brand-name">
            <span className="brand-main">nobimuso</span>
            <span className="brand-sub">濃尾無双RE:VIVE</span>
          </span>
        </Link>
        <nav className="simple-nav" aria-label="メインナビゲーション">
          <Link to="/">記事一覧</Link>
          <a href="#latest">最新記事</a>
        </nav>
      </div>
    </header>
  )
}

function HomePage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [state, setState] = useState<AsyncState<WpPostPage>>({ status: 'loading' })

  useEffect(() => {
    let ignore = false

    setState({ status: 'loading' })

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

  return (
    <main>
      <section className="hero">
        <div className="page hero-box">
          <div>
            <span className="label">濃尾無双RE:VIVE</span>
            <h1 className="hero-title">濃尾無双RE:VIVE</h1>
            <p className="hero-lead">
              虎子たちはここに集まっていたんだね
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#latest">
                最新記事を見る
              </a>
              <Link className="btn btn-secondary" to="/post/2198">
                記事ID 2198
              </Link>
            </div>
          </div>
          <div className="mascot-card" aria-hidden="true">
            <div className="mascot" />
          </div>
        </div>
      </section>

      <section className="section" id="latest">
        <div className="page">
          <div className="section-head">
            <div>
              <h2 className="section-title">最新記事</h2>
              <p className="section-desc">虎子たちの記録を、新しい順に並べています。</p>
            </div>
          </div>
          <PostList currentPage={currentPage} state={state} onPageChange={setCurrentPage} />
        </div>
      </section>
    </main>
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
    return null
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
      <PostImage imageUrl={image?.source_url} alt={image?.alt_text || title} className="thumb" />
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
      setState({ status: 'error', error: '記事IDが指定されていません。' })
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

  return (
    <main className="article-page">
      <div className="page article-shell">
        {state.status === 'loading' && null}
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
        <PostImage imageUrl={image?.source_url} alt={image?.alt_text || title} className="article-cover" />
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
}: {
  imageUrl?: string
  alt: string
  className: string
}) {
  if (imageUrl) {
    return (
      <div className={className}>
        <img src={imageUrl} alt={alt} loading="lazy" />
      </div>
    )
  }

  return (
    <div className={`${className} thumb-placeholder`}>
      <span>RE:VIVE</span>
    </div>
  )
}

function StatusCard({ title, text, tone }: { title: string; text: string; tone?: 'error' }) {
  return (
    <div className={`status-card ${tone === 'error' ? 'status-card-error' : ''}`}>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page footer-inner">
        <span className="footer-logo">濃尾無双RE:VIVE</span>
        <span>虎子たちはここに集まっていたんだね</span>
      </div>
    </footer>
  )
}

export default App
