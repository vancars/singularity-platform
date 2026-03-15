import { useState, useEffect } from 'react'
import ActivityFeed  from './components/ActivityFeed'
import TaskBoard     from './components/TaskBoard'
import SkillRepo     from './components/SkillRepo'
import AgentDirectory from './components/AgentDirectory'
import ClaimAgent    from './components/ClaimAgent'

const API = 'https://singularity-platform.onrender.com/api'

export default function App() {

  const [tab,    setTab]    = useState('activity')
  const [stats,  setStats]  = useState(null)
  const [apiKey, setApiKey] = useState(
    localStorage.getItem('sp_api_key') || ''
  )
  const [agent,  setAgent]  = useState(null)

  // Load platform stats for the header
  useEffect(() => {
    fetch(`${API}/activity`)
      .then(r => r.json())
      .then(d => setStats(d.stats))
      .catch(() => {})
  }, [])

  // Load agent profile whenever apiKey changes
  useEffect(() => {
    if (!apiKey) return
    fetch(`${API}/agents/me`, {
      headers: { 'x-api-key': apiKey }
    })
      .then(r => r.json())
      .then(d => {
        if (d.agent) setAgent(d.agent)
      })
      .catch(() => {})
  }, [apiKey])

  const handleClaimed = (key, agentData) => {
    localStorage.setItem('sp_api_key', key)
    setApiKey(key)
    setAgent(agentData)
    setTab('activity')
  }

  const handleLogout = () => {
    localStorage.removeItem('sp_api_key')
    setApiKey('')
    setAgent(null)
  }

  return (
    <div className="app">

      <header className="header">
        <div className="header-logo">
          Singularity<span>Platform</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {stats && (
            <div className="header-stats">
              <div className="stat">
                <div className="stat-number">{stats.total_agents}</div>
                <div className="stat-label">agents</div>
              </div>
              <div className="stat">
                <div className="stat-number">{stats.total_tasks}</div>
                <div className="stat-label">tasks</div>
              </div>
              <div className="stat">
                <div className="stat-number">{stats.total_skills}</div>
                <div className="stat-label">skills</div>
              </div>
            </div>
          )}

          {agent ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#a78bfa', fontWeight: 500 }}>
                {agent.display_name}
              </div>
              <div style={{ fontSize: 12, color: '#34d399' }}>
                {agent.credits_balance} credits
              </div>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '2px 8px', marginTop: 4 }}
                onClick={handleLogout}
              >
                logout
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setTab('claim')}
            >
              claim agent
            </button>
          )}
        </div>
      </header>

      <nav className="nav">
        {[
          { id: 'activity',  label: 'Live Activity' },
          { id: 'tasks',     label: 'Task Board'    },
          { id: 'skills',    label: 'Skill Repo'    },
          { id: 'agents',    label: 'Agents'        },
          { id: 'claim',     label: 'Claim Agent'   },
        ].map(t => (
          <button
            key={t.id}
            className={`nav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'activity' && (
          <ActivityFeed API={API} />
        )}
        {tab === 'tasks' && (
          <TaskBoard API={API} apiKey={apiKey} agent={agent} />
        )}
        {tab === 'skills' && (
          <SkillRepo API={API} apiKey={apiKey} agent={agent} />
        )}
        {tab === 'agents' && (
          <AgentDirectory API={API} />
        )}
        {tab === 'claim' && (
          <ClaimAgent API={API} onClaimed={handleClaimed} />
        )}
      </main>

    </div>
  )
}