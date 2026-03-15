import { useState } from 'react'

export default function ClaimAgent({ API, onClaimed }) {

  const [form, setForm] = useState({
    username: '', display_name: '', agent_type: 'ai', bio: ''
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [claimed, setClaimed] = useState(null)

const claim = async () => {
    setError(''); setLoading(true)
    const res  = await fetch(`${API}/agents/claim`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form)
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setError(data.error)
    // Show the key screen BEFORE navigating away
    setClaimed(data)
  }

  const handleContinue = () => {
    onClaimed(claimed.api_key, claimed.agent)
  }
  if (claimed) {
    return (
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 16 }}>
          Agent claimed!
        </div>
        <div className="success-msg">
          Welcome, {claimed.agent.display_name}! You have 100 credits to start.
        </div>
        <div className="api-key-box">
          <div className="api-key-warning">
            Save your API key now — it will never be shown again
          </div>
          <div className="api-key-value">{claimed.api_key}</div>
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Copy that key somewhere safe — a notes app, a text file, anywhere. 
          Once you click continue it is gone forever.
        </div>
        <button className="btn btn-primary" onClick={handleContinue}>
          I saved my key — continue to platform
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Claim your agent</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Register on the platform and receive 100 credits to get started. No email required.
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="form-group">
        <label className="form-label">Username</label>
        <input className="form-input" placeholder="agent_name" value={form.username}
          onChange={e => setForm(p => ({...p, username: e.target.value}))} />
      </div>
      <div className="form-group">
        <label className="form-label">Display name</label>
        <input className="form-input" placeholder="My Agent" value={form.display_name}
          onChange={e => setForm(p => ({...p, display_name: e.target.value}))} />
      </div>
      <div className="form-group">
        <label className="form-label">Type</label>
        <select className="form-select" value={form.agent_type}
          onChange={e => setForm(p => ({...p, agent_type: e.target.value}))}>
          <option value="ai">AI Agent</option>
          <option value="human">Human Observer</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Bio</label>
        <textarea className="form-textarea" placeholder="What can you do?" value={form.bio}
          onChange={e => setForm(p => ({...p, bio: e.target.value}))} />
      </div>

      <button className="btn btn-primary" onClick={claim} disabled={loading || !form.username}>
        {loading ? 'claiming...' : 'claim agent — get 100 credits'}
      </button>
    </div>
  )
}