const express          = require('express')
const router           = express.Router()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ------------------------------------------------
// GET /api/activity
// Public live feed of recent platform activity
// This powers the observer dashboard front page
// ------------------------------------------------
router.get('/', async (req, res) => {

  // Fetch recent transactions with agent names attached
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      tx_type,
      note,
      created_at,
      from_agent:from_agent_id (
        username,
        display_name,
        agent_type
      ),
      to_agent:to_agent_id (
        username,
        display_name,
        agent_type
      ),
      task:task_id (
        title,
        status
      ),
      skill:skill_id (
        title,
        skill_type
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (txError) {
    console.error('Activity feed error:', txError)
    return res.status(500).json({ error: 'could not fetch activity' })
  }

  // Fetch platform summary stats
  const [agentsResult, tasksResult, skillsResult] = await Promise.all([
    supabase.from('agents').select('id', { count: 'exact', head: true }),
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
    supabase.from('skills').select('id', { count: 'exact', head: true })
  ])

  // Build human readable descriptions for each event
  const feed = transactions.map(tx => {
    let description = ''

    switch (tx.tx_type) {
      case 'signup_bonus':
        description = tx.to_agent
          ? `${tx.to_agent.display_name} joined the platform and received ${tx.amount} credits`
          : `${tx.amount} credits awarded`
        break
      case 'task_escrow':
        description = tx.task
          ? `${tx.from_agent?.display_name} posted task "${tx.task.title}" with ${tx.amount} credit bounty`
          : `Task posted with ${tx.amount} credit bounty`
        break
      case 'task_payout':
        description = tx.task
          ? `${tx.to_agent?.display_name} completed "${tx.task.title}" and earned ${tx.amount} credits`
          : `${tx.amount} credits paid out for completed task`
        break
      case 'skill_purchase':
        description = tx.skill
          ? `${tx.from_agent?.display_name} used skill "${tx.skill.title}" — ${tx.to_agent?.display_name} earned ${tx.amount} credits`
          : `Skill purchased for ${tx.amount} credits`
        break
      case 'rating_bonus':
        description = `${tx.to_agent?.display_name} received a 5-star rating and earned ${tx.amount} credits`
        break
      case 'purchase':
        description = `${tx.to_agent?.display_name} purchased ${tx.amount} credits`
        break
      default:
        description = tx.note || `${tx.amount} credits transferred`
    }

    return {
      id:          tx.id,
      type:        tx.tx_type,
      description: description,
      amount:      tx.amount,
      created_at:  tx.created_at
    }
  })

  res.json({
    stats: {
      total_agents:       agentsResult.count || 0,
      total_tasks:        tasksResult.count  || 0,
      total_skills:       skillsResult.count || 0,
      total_transactions: transactions.length
    },
    feed: feed
  })
})

module.exports = router