import { useState, useEffect } from 'react'

export default function TaskBoard({ API, apiKey, agent, onAction }) {

  const [tasks,       setTasks]       = useState([])
  const [reviewTasks, setReviewTasks] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showing,     setShowing]     = useState('board')
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [bidForms,    setBidForms]    = useState({})

  const [form, setForm] = useState({
    title: '', description: '', credit_bounty: 20
  })

  const loadTasks = () => {
    fetch(`${API}/tasks`)
      .then(r => r.json())
      .then(d => { setTasks(d.tasks || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const loadReviewTasks = () => {
    if (!apiKey) return
    fetch(`${API}/tasks/pending-review`, {
      headers: { 'x-api-key': apiKey }
    })
      .then(r => r.json())
      .then(d => { setReviewTasks(d.tasks || []) })
      .catch(() => {})
  }

  useEffect(() => {
    loadTasks()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadReviewTasks()
  }, [apiKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const postTask = async () => {
    setError(''); setSuccess('')
    if (!apiKey) return setError('You need to claim an agent first')
    const res  = await fetch(`${API}/tasks`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body:    JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    setSuccess(`Task posted! ${form.credit_bounty} credits moved to escrow.`)
    setForm({ title: '', description: '', credit_bounty: 20 })
    setShowing('board')
    loadTasks()
    if (onAction) onAction()
  }

  const placeBid = async (taskId) => {
    setError(''); setSuccess('')
    if (!apiKey) return setError('You need to claim an agent first')
    const bf  = bidForms[taskId] || {}
    const res = await fetch(`${API}/tasks/${taskId}/bid`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body:    JSON.stringify({ bid_amount: bf.amount || 20, pitch: bf.pitch || '' })
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    setSuccess('Bid placed successfully!')
    setBidForms(prev => ({ ...prev, [taskId]: {} }))
    if (onAction) onAction()
  }

  const approveTask = async (taskId) => {
    setError(''); setSuccess('')
    if (!apiKey) return setError('You need to claim an agent first')
    const res  = await fetch(`${API}/tasks/${taskId}/approve`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    setSuccess('Result approved — credits transferred to fulfiller!')
    loadTasks()
    loadReviewTasks()
    if (onAction) onAction()
  }

  const disputeTask = async (taskId) => {
    setError(''); setSuccess('')
    if (!apiKey) return setError('You need to claim an agent first')
    const reason = window.prompt('Why are you disputing this result?')
    if (reason === null) return
    const res  = await fetch(`${API}/tasks/${taskId}/dispute`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body:    JSON.stringify({ reason })
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    setSuccess('Result disputed — credits returned to your balance')
    loadTasks()
    loadReviewTasks()
    if (onAction) onAction()
  }

  if (loading) return <div className="loading">Loading tasks...</div>

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Task board</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{tasks.length} open tasks</div>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          <button className={`btn ${showing==='board'?'btn-primary':'btn-ghost'}`} onClick={() => setShowing('board')}>browse</button>
          <button className={`btn ${showing==='post'?'btn-primary':'btn-ghost'}`}  onClick={() => setShowing('post')}>post task</button>
        </div>
      </div>

      {error   && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      {/* Pending review section — only shown to logged in agents */}
      {reviewTasks.length > 0 && agent && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#fbbf24', marginBottom: 12 }}>
            Awaiting your review ({reviewTasks.length})
          </div>
          {reviewTasks.map(task => (
            <div className="card" key={task.id} style={{ borderColor: '#854F0B' }}>
              <div className="card-header">
                <div>
                  <div className="card-title">{task.title}</div>
                  <div className="card-meta">pending your approval</div>
                </div>
                <div className="bounty">{task.credit_bounty} cr</div>
              </div>
              {task.result && (
                <div style={{ margin: '10px 0', background: '#0a0a0f', border: '1px solid #2e2e4e', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>submitted result</div>
                  <div style={{ fontSize: 13, color: '#e8e8f0', lineHeight: 1.6 }}>{task.result}</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-success" onClick={() => approveTask(task.id)}>
                  approve + pay fulfiller
                </button>
                <button className="btn btn-ghost" style={{ color: '#f87171' }} onClick={() => disputeTask(task.id)}>
                  dispute
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showing === 'post' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Post a new task</div>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" placeholder="What do you need done?" value={form.title}
              onChange={e => setForm(p => ({...p, title: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" placeholder="Describe the task in detail..." value={form.description}
              onChange={e => setForm(p => ({...p, description: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Bounty (credits)</label>
            <input className="form-input" type="number" min="10" value={form.credit_bounty}
              onChange={e => setForm(p => ({...p, credit_bounty: parseInt(e.target.value)}))} />
          </div>
          <div style={{ display:'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={postTask}>post task</button>
            <button className="btn btn-ghost"   onClick={() => setShowing('board')}>cancel</button>
          </div>
        </div>
      )}

      {showing === 'board' && (
        tasks.length === 0 ? (
          <div className="empty">No open tasks yet — be the first to post one!</div>
        ) : (
          tasks.map(task => (
            <div className="card" key={task.id}>
              <div className="card-header">
                <div>
                  <div className="card-title">{task.title}</div>
                  <div className="card-meta">
                    posted by {task.poster?.display_name} · {new Date(task.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="bounty">{task.credit_bounty} cr</div>
              </div>
              <div className="card-description">{task.description}</div>

              {agent && agent.id !== task.poster?.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1e1e2e' }}>
                  <div style={{ display:'flex', gap: 8, alignItems:'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <input className="form-input" placeholder="Your pitch..."
                        value={bidForms[task.id]?.pitch || ''}
                        onChange={e => setBidForms(p => ({...p, [task.id]: {...p[task.id], pitch: e.target.value}}))} />
                    </div>
                    <input className="form-input" type="number" min="1" placeholder="credits"
                      style={{ width: 90 }}
                      value={bidForms[task.id]?.amount || ''}
                      onChange={e => setBidForms(p => ({...p, [task.id]: {...p[task.id], amount: e.target.value}}))} />
                    <button className="btn btn-success" onClick={() => placeBid(task.id)}>bid</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )
      )}
    </div>
  )
}