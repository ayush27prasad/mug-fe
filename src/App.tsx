import { useEffect, useState } from 'react'
import { create } from 'zustand'
import cn from 'classnames'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Simple app-wide toast store
type Toast = { id: number; text: string; type?: 'info' | 'error' }
const useToastStore = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; remove: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts, { id: Date.now() + Math.random(), ...t }] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

// API client
const API_BASE = 'http://localhost:8080/api/v1/llm'

type Llm = {
  id: number
  modelName: string
  companyName: string
  baseUrl: string | null
  apiKey: string | null
  openAiCompatible: boolean
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

// Sidebar nav
type Tab = 'chat' | 'register' | 'block-explorer'

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [active, setActive] = useState<Tab>('chat')
  const [llms, setLlms] = useState<Llm[] | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const toast = useToastStore()

  useEffect(() => {
    const c = new AbortController()
    setLoadingModels(true)
    apiGet<Llm[]>('/')
      .then(setLlms)
      .catch((e) => toast.push({ text: parseApiError(e), type: 'error' }))
      .finally(() => setLoadingModels(false))
    return () => c.abort()
  }, [])

  return (
    <div className="app-shell">
      <aside className={cn('sidebar', { collapsed })}>
        <div className="sidebar-header">
          <div className="brand" aria-label="GPU.NET">
            <span className="brand-dot" />
            {!collapsed && <span>GPU.NET</span>}
          </div>
          <button aria-label="Toggle Sidebar" className="collapse-btn" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '→' : '←'}
          </button>
        </div>
        <nav className="nav" aria-label="Main Navigation">
          <button className={cn('nav-item', { active: active === 'chat' })} onClick={() => setActive('chat')} aria-current={active === 'chat' ? 'page' : undefined}>
            💬 {!collapsed && <span>GPUNet LLM</span>}
          </button>
          <button className={cn('nav-item', { active: active === 'register' })} onClick={() => setActive('register')} aria-current={active === 'register' ? 'page' : undefined}>
            🧩 {!collapsed && <span>Register your LLM</span>}
          </button>
          <button className={cn('nav-item', { active: active === 'block-explorer' })} onClick={() => setActive('block-explorer')} aria-current={active === 'block-explorer' ? 'page' : undefined}>
            🧭 {!collapsed && <span>Block Explorer AI</span>}
          </button>
        </nav>
        <div style={{ marginTop: 'auto', padding: 8 }}>
          {!collapsed && (
            <div className="card" style={{ fontSize: 12 }}>
              <div className="muted">Registered Models</div>
              {loadingModels && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}><div className="spinner" /><span className="muted">Loading...</span></div>}
              {!loadingModels && (
                <ul style={{ paddingLeft: 16, margin: '8px 0 0' }}>
                  {(llms ?? []).slice(0, 6).map((m) => (
                    <li key={m.id} className="muted">{m.modelName}</li>
                  ))}
                  {llms && llms.length === 0 && <li className="muted">No models yet</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="brand-dot" />
            <strong>{active === 'chat' ? 'Chat with LLM' : active === 'register' ? 'Register LLM' : 'Block Explorer AI'}</strong>
          </div>
          <button onClick={() => window.location.reload()} aria-label="Refresh">⟳</button>
        </header>
        <div className="content-body">
          {active === 'chat' ? (
            <ChatPage toast={toast} llms={llms ?? []} />
          ) : active === 'register' ? (
            <RegisterPage onRegistered={() => reloadModels(setLlms, toast)} toast={toast} />
          ) : (
            <BlockExplorerChat toast={toast} />
          )}
        </div>
      </main>

      <ToastContainer />
    </div>
  )
}

function reloadModels(setLlms: (v: Llm[]) => void, toast: ReturnType<typeof useToastStore.getState>) {
  apiGet<Llm[]>('/')
    .then(setLlms)
    .catch((e) => toast.push({ text: parseApiError(e), type: 'error' }))
}

function parseApiError(e: unknown): string {
  if (e instanceof Error) return e.message || 'Request failed'
  try { return String(e) } catch { return 'Request failed' }
}

// Toasts
function ToastContainer() {
  const { toasts, remove } = useToastStore()
  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => remove(t.id), 3500))
    return () => { timers.forEach(clearTimeout) }
  }, [toasts, remove])
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn('toast', { error: t.type === 'error' })}>{t.text}</div>
      ))}
    </div>
  )
}

// Register Page
function RegisterPage({ onRegistered, toast }: { onRegistered: () => void; toast: ReturnType<typeof useToastStore.getState> }) {
  const [modelName, setModelName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [openAiCompatible, setOpenAiCompatible] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modelName.trim() || !companyName.trim()) {
      toast.push({ text: 'Model name and company are required', type: 'error' })
      return
    }
    setSubmitting(true)
    try {
      await apiPost<Llm>('/register', { modelName, companyName, baseUrl: baseUrl || null, apiKey: apiKey || null, openAiCompatible })
      toast.push({ text: 'Model registered' })
      setModelName(''); setCompanyName(''); setBaseUrl(''); setApiKey(''); setOpenAiCompatible(true)
      onRegistered()
    } catch (e) {
      toast.push({ text: parseApiError(e), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card" aria-label="Register LLM form">
      <div className="form-grid">
        <div className="form-row">
          <label className="label" htmlFor="modelName">Model name</label>
          <input id="modelName" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="gpt-4o-mini" required />
        </div>
        <div className="form-row">
          <label className="label" htmlFor="companyName">Provider</label>
          <input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="OpenAI" required />
        </div>
        <div className="form-row">
          <label className="label" htmlFor="baseUrl">Base URL</label>
          <input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />
        </div>
        <div className="form-row">
          <label className="label" htmlFor="apiKey">API Key</label>
          <input id="apiKey" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </div>
        <div className="form-row" style={{ gridColumn: '1 / -1' }}>
          <label className="label">OpenAI Compatible</label>
          <button type="button" onClick={() => setOpenAiCompatible((v) => !v)} className={cn('switch', { on: openAiCompatible })} aria-pressed={openAiCompatible} aria-label="Toggle OpenAI compatibility">
            <div className="switch-thumb" />
          </button>
        </div>
      </div>
      <div className="submit-row">
        <button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="spinner" /> Registering</span> : 'Register'}
        </button>
      </div>
    </form>
  )
}

// Chat Page
type ChatMessage = { id: string; role: 'user' | 'ai'; text: string; via?: string }

function ChatPage({ toast, llms }: { toast: ReturnType<typeof useToastStore.getState>; llms: Llm[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('auto')

  async function sendMessage() {
    const q = input.trim()
    if (!q) return
    setInput('')
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: q }
    setMessages((m) => [...m, userMsg])
    setLoading(true)
    try {
      const modelId = selectedModel === 'auto' ? null : Number(selectedModel)
      const data = await apiPost<{ response: string; response_generated_via: string }>(
        '/chat',
        { query: q, modelId }
      )
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'ai', text: data.response, via: data.response_generated_via }
      setMessages((m) => [...m, aiMsg])
    } catch (e) {
      toast.push({ text: parseApiError(e), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const onEnter = (ev: KeyboardEvent) => {
      if ((ev.key === 'Enter' || ev.keyCode === 13) && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault(); sendMessage()
      }
    }
    window.addEventListener('keydown', onEnter)
    return () => window.removeEventListener('keydown', onEnter)
  }, [input])

  const Message = ({ m }: { m: ChatMessage }) => (
    <div className={cn('message-row', m.role)}>
      <div className={cn('bubble', m.role)}>
        {m.role === 'ai' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
            {m.via && <div className="model-tag">⚡ via <span style={{ color: 'var(--color-accent)' }}>{m.via}</span></div>}
          </div>
        ) : (
          <span>{m.text}</span>
        )}
      </div>
    </div>
  )

  return (
    <div className="chat-wrap">
      <div className="messages" aria-live="polite">
        <div className="messages-center">
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          {loading && (
            <div className="message-row ai"><div className="bubble ai" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="spinner" /><span className="muted">Generating…</span></div></div>
          )}
        </div>
      </div>
      <div style={{ padding: '8px', borderTop: '1px solid var(--color-border)', background: 'var(--color-panel)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label className="label" htmlFor="modelSelect" style={{ minWidth: 64 }}>Model</label>
          <select id="modelSelect" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ maxWidth: 380 }} aria-label="Select model for this message">
            <option value="auto">Auto (route automatically)</option>
            {llms.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.modelName} — {m.companyName}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="input-row">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything… (Cmd/Ctrl + Enter to send)"
          aria-label="Chat input"
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} aria-busy={loading}>
          {loading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="spinner" /> Sending</span> : 'Send'}
        </button>
      </div>
    </div>
  )
}

// Block Explorer Chat (no model selection)
function BlockExplorerChat({ toast }: { toast: ReturnType<typeof useToastStore.getState> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMessage() {
    const q = input.trim()
    if (!q) return
    setInput('')
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: q }
    setMessages((m) => [...m, userMsg])
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8010/api/v1/transactions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (!res.ok) throw new Error(await res.text())
      const raw = await res.text()
      let md = raw
      // Backend may return a plain text string, a JSON-encoded string, or an object with { response }
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed === 'string') {
          md = parsed
        } else if (parsed && typeof parsed === 'object' && 'response' in parsed && typeof (parsed as any).response === 'string') {
          md = (parsed as any).response
        }
      } catch {}
      const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'ai', text: md }
      setMessages((m) => [...m, aiMsg])
    } catch (e) {
      toast.push({ text: parseApiError(e), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const onEnter = (ev: KeyboardEvent) => {
      if ((ev.key === 'Enter' || ev.keyCode === 13) && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault(); sendMessage()
      }
    }
    window.addEventListener('keydown', onEnter)
    return () => window.removeEventListener('keydown', onEnter)
  }, [input])

  const Message = ({ m }: { m: ChatMessage }) => (
    <div className={cn('message-row', m.role)}>
      <div className={cn('bubble', m.role)}>
        {m.role === 'ai' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="brand-dot" style={{ boxShadow: '0 0 16px rgba(0,255,136,0.4)', background: 'radial-gradient(circle at 30% 30%, var(--color-accent-green), #08b46c)' }} />
              <span className="muted" style={{ color: 'var(--color-accent-green)' }}>Block Explorer AI</span>
            </div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
          </div>
        ) : (
          <span>{m.text}</span>
        )}
      </div>
    </div>
  )

  return (
    <div className="chat-wrap">
      <div className="messages" aria-live="polite">
        <div className="messages-center">
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          {loading && (
            <div className="message-row ai"><div className="bubble ai" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="spinner" /><span className="muted">Querying…</span></div></div>
          )}
        </div>
      </div>
      <div className="input-row">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask blockchain analytics… (Cmd/Ctrl + Enter to send)"
          aria-label="Block Explorer chat input"
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} aria-busy={loading}>
          {loading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="spinner" /> Sending</span> : 'Send'}
        </button>
      </div>
    </div>
  )
}
