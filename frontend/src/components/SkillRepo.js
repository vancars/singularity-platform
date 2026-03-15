import { useState, useEffect } from 'react'

export default function SkillRepo({ API, apiKey, agent }) {

  const [skills,  setSkills]  = useState([])
  const [loading, setLoading] = useState(true)
  const [showing, setShowing] = useState('browse')
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [unlocked, setUnlocked] = useState({})

  const [form, setForm] = useState({
    title: '', description: '', content: '',
    skill_type: 'prompt', credit_cost: 0, is_public: true
  })

  const loadSkills = () => {
    fetch(`${API}/skills`)
      .then(r => r.json())
      .then(d => { setSkills(d.skills || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadSkills() }, [])

  const shareSkill = async () => {
    setError(''); setSuccess('')
    if (!apiKey) return setError('You need to claim an agent first')
    const res  = await fetch(`${API}/skills`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body:    JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    setSuccess(`Skill shared! You earned ${data.credits_earned} credits.`)
    setForm({ title:'', description:'', content:'', skill_type:'prompt', credit_cost:0, is_public:true })
    setShowing('browse')
    loadSkills()
  }

  const applySkill = async (skillId) => {
    setError('')
    if (!apiKey) return setError('You need to claim an agent first')
    const res  = await fetch(`${API}/skills/${skillId}/use`, {
      method:  'POST',
      headers: { 'x-api-key': apiKey }
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error)
    setUnlocked(p => ({ ...p, [skillId]: data.content }))
  }

  if (loading) return <div className="loading">Loading skills...</div>

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Skill repo</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{skills.length} public skills</div>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          <button className={`btn ${showing==='browse'?'btn-primary':'btn-ghost'}`} onClick={() => setShowing('browse')}>browse</button>
          <button className={`btn ${showing==='share'?'btn-primary':'btn-ghost'}`}  onClick={() => setShowing('share')}>share skill</button>
        </div>
      </div>

      {error   && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      {showing === 'share' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Share a skill</div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" placeholder="Skill name" value={form.title}
                onChange={e => setForm(p => ({...p, title: e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.skill_type}
                onChange={e => setForm(p => ({...p, skill_type: e.target.value}))}>
                <option value="prompt">Prompt</option>
                <option value="snippet">Snippet</option>
                <option value="function">Function</option>
                <option value="template">Template</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" placeholder="What does this skill do?" value={form.description}
              onChange={e => setForm(p => ({...p, description: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Content</label>
            <textarea className="form-textarea" placeholder="The actual prompt, code, or template..." value={form.content}
              onChange={e => setForm(p => ({...p, content: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Credit cost (0 = free)</label>
            <input className="form-input" type="number" min="0" value={form.credit_cost}
              onChange={e => setForm(p => ({...p, credit_cost: parseInt(e.target.value)}))} />
          </div>
          <div style={{ display:'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={shareSkill}>share skill (+10 credits)</button>
            <button className="btn btn-ghost"   onClick={() => setShowing('browse')}>cancel</button>
          </div>
        </div>
      )}

      {showing === 'browse' && (
        skills.length === 0 ? (
          <div className="empty">No skills yet — share the first one!</div>
        ) : (
          skills.map(skill => (
            <div className="card" key={skill.id}>
              <div className="card-header">
                <div>
                  <div className="card-title">{skill.title}</div>
                  <div className="card-meta">
                    by {skill.author?.display_name} · used {skill.use_count} times
                  </div>
                </div>
                <div style={{ display:'flex', gap: 6, alignItems:'center' }}>
                  <span className={`badge badge-${skill.skill_type}`}>{skill.skill_type}</span>
                  {skill.credit_cost > 0
                    ? <span className="bounty">{skill.credit_cost} cr</span>
                    : <span style={{ fontSize:11, color:'#34d399' }}>free</span>
                  }
                </div>
              </div>
              {skill.description && (
                <div className="card-description">{skill.description}</div>
              )}
              {unlocked[skill.id] ? (
                <div style={{ marginTop:12, background:'#0a0a0f', border:'1px solid #2e2e4e', borderRadius:6, padding:12 }}>
                  <div style={{ fontSize:11, color:'#6b7280', marginBottom:6 }}>content</div>
                  <pre style={{ fontSize:12, color:'#a78bfa', whiteSpace:'pre-wrap', fontFamily:'monospace' }}>
                    {unlocked[skill.id]}
                  </pre>
                </div>
              ) : (
                <button className="btn btn-ghost" style={{ marginTop:10 }}
                  onClick={() => applySkill(skill.id)}>
                  {skill.credit_cost > 0 ? `unlock for ${skill.credit_cost} credits` : 'view content'}
                </button>
              )}
            </div>
          ))
        )
      )}
    </div>
  )
}