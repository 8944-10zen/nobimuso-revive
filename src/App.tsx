import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import './App.css'
import { formatPostDate, stripHtml } from './lib/format'
import { fetchPost, fetchPosts, getFeaturedImage, type WpPost } from './lib/wpApi'

type AsyncState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: undefined; error: string }

function App() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/post/:id" element={<PostPage />} />
      </Routes>
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
            <span className="brand-sub">RE:VIVE BLOG</span>
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
  const [state, setState] = useState<AsyncState<WpPost[]>>({ status: 'loading' })

  useEffect(() => {
    let ignore = false

    fetchPosts()
      .then((posts) => {
        if (!ignore) {
          setState({ status: 'success', data: posts })
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
  }, [])

  return (
    <main>
      <section className="hero">
        <div className="page hero-box">
          <div>
            <span className="label">Headless WordPress</span>
            <h1 className="hero-title">RE:VIVE Journal</h1>
            <p className="hero-lead">
              WordPress から届く記事を、nobimuso らしい明るいカードUIでまとめました。読みものを軽やかに探して、気になる記事へそのまま進めます。
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
              <h2 className="section-title">Latest Posts</h2>
              <p className="section-desc">WordPress REST API から取得した最新10件です。</p>
            </div>
          </div>
          <PostList state={state} />
        </div>
      </section>
    </main>
  )
}

function PostList({ state }: { state: AsyncState<WpPost[]> }) {
  if (state.status === 'loading') {
    return <StatusCard title="記事を読み込んでいます" text="WordPress から最新の投稿を取得中です。" />
  }

  if (state.status === 'error') {
    return <StatusCard title="記事を取得できませんでした" text={state.error} tone="error" />
  }

  if (state.data.length === 0) {
    return <StatusCard title="投稿がありません" text="公開済みの記事が見つかりませんでした。" />
  }

  const [pickup, ...posts] = state.data

  return (
    <>
      <PostCard post={pickup} variant="pickup" />
      {posts.length > 0 && (
        <div className="post-grid">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </>
  )
}

function PostCard({ post, variant }: { post: WpPost; variant?: 'pickup' }) {
  const image = getFeaturedImage(post)
  const title = stripHtml(post.title.rendered)
  const excerpt = stripHtml(post.excerpt.rendered)

  return (
    <Link className={`post-card ${variant === 'pickup' ? 'pickup' : ''}`} to={`/post/${post.id}`}>
      <PostImage imageUrl={image?.source_url} alt={image?.alt_text || title} className="thumb" />
      <div className="post-body">
        <div className="meta">
          <span className="chip">{formatPostDate(post.date)}</span>
          <span>ID {post.id}</span>
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
        {state.status === 'loading' && (
          <StatusCard title="記事を読み込んでいます" text="WordPress から本文を取得中です。" />
        )}
        {state.status === 'error' && <StatusCard title="記事を取得できませんでした" text={state.error} tone="error" />}
        {state.status === 'success' && <Article post={state.data} />}
      </div>
    </main>
  )
}

function Article({ post }: { post: WpPost }) {
  const image = getFeaturedImage(post)
  const title = useMemo(() => stripHtml(post.title.rendered), [post.title.rendered])

  return (
    <>
      <article className="article-card">
        <PostImage imageUrl={image?.source_url} alt={image?.alt_text || title} className="article-cover" />
        <div className="article-body">
          <div className="meta">
            <span className="chip">{formatPostDate(post.date)}</span>
            <span>ID {post.id}</span>
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
        <span className="footer-logo">nobimuso RE:VIVE</span>
        <span>Powered by WordPress REST API</span>
      </div>
    </footer>
  )
}

export default App
