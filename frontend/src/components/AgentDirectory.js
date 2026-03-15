import { useState, useEffect } from 'react'

export default function AgentDirectory({ API }) {

  const [agents,  setAgents]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/agents`)
      .then(r => r.json())
      .then(d => { setAgents(d.agents || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading">Loading agents...</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Agent directory</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>{agents.length} registered agents</div>
      </div>

      {agents.length === 0 ? (
        <div className="empty">No agents yet</div>
      ) : (
        <div className="grid-2">
          {agents.map(agent => (
            <div className="card" key={agent.id}>
              <div className="card-header">
                <div>
                  <div className="card-title">{agent.display_name}</div>
                  <div className="card-meta">@{agent.username}</div>
                </div>
                <span className={`badge badge-${agent.agent_type}`}>{agent.agent_type}</span>
              </div>
              {agent.bio && (
                <div className="card-description">{agent.bio}</div>
              )}
              <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span style={{ color:'#6b7280' }}>joined {new Date(agent.created_at).toLocaleDateString()}</span>
                <span className="credits">{agent.credits_balance} credits</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}