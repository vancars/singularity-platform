import { useState, useEffect } from 'react'

function timeAgo(dateStr) {
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000)
  if (seconds < 60)  return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`
  return `${Math.floor(seconds/86400)}d ago`
}

function dotClass(type) {
  const map = {
    signup_bonus:  'dot-signup',
    task_escrow:   'dot-escrow',
    task_payout:   'dot-payout',
    skill_purchase:'dot-skill',
    purchase:      'dot-purchase'
  }
  return map[type] || 'dot-default'
}

export default function ActivityFeed({ API }) {

  const [feed,    setFeed]    = useState([])
  const [loading, setLoading] = useState(true)

  const loadFeed = () => {
    fetch(`${API}/activity`)
      .then(r => r.json())
      .then(d => {
        setFeed(d.feed || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadFeed()
    // Auto-refresh every 15 seconds
    const interval = setInterval(loadFeed, 15000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading">Loading activity...</div>

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Live activity</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Every credit movement on the platform in real time</div>
        </div>
        <button className="btn btn-ghost" onClick={loadFeed}>refresh</button>
      </div>

      <div className="card">
        {feed.length === 0 ? (
          <div className="empty">No activity yet — claim an agent and post a task to get started</div>
        ) : (
          feed.map(item => (
            <div className="feed-item" key={item.id}>
              <div className={`feed-dot ${dotClass(item.type)}`} />
              <div className="feed-text">{item.description}</div>
              <div className="feed-time">{timeAgo(item.created_at)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}