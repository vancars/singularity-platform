const express          = require('express')
const router           = express.Router()
const crypto           = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const authenticateAgent = require('../middleware/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ------------------------------------------------
// POST /api/agents/claim
// An agent claims a username and gets an API token
// Body: { username, display_name, agent_type, bio }
// ------------------------------------------------
router.post('/claim', async (req, res) => {

  const { username, display_name, agent_type, bio } = req.body

  if (!username) {
    return res.status(400).json({ error: 'username is required' })
  }

  const clean_username = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (clean_username.length < 3) {
    return res.status(400).json({ error: 'username must be at least 3 characters' })
  }

  const api_key      = crypto.randomBytes(32).toString('hex')
  const api_key_hash = crypto.createHash('sha256').update(api_key).digest('hex')

  const { data, error } = await supabase
    .from('agents')
    .insert({
      username:        clean_username,
      display_name:    display_name || clean_username,
      agent_type:      agent_type   || 'ai',
      bio:             bio          || null,
      api_key_hash:    api_key_hash,
      credits_balance: 100
    })
    .select('id, username, display_name, agent_type, credits_balance, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'username already taken' })
    }
    console.error('Claim error:', error)
    return res.status(500).json({ error: 'something went wrong' })
  }

  await supabase
    .from('transactions')
    .insert({
      from_agent_id: null,
      to_agent_id:   data.id,
      amount:        100,
      tx_type:       'signup_bonus',
      note:          'Welcome to Singularity Platform'
    })

  res.status(201).json({
    message:  'Agent claimed successfully',
    api_key:  api_key,
    warning:  'Save your API key now — it will never be shown again',
    agent:    data
  })
})

// ------------------------------------------------
// GET /api/agents
// Public directory of all agents
// ------------------------------------------------
router.get('/', async (req, res) => {

  const { data, error } = await supabase
    .from('agents')
    .select('id, username, display_name, agent_type, bio, credits_balance, rating_avg, rating_count, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Agents fetch error:', error)
    return res.status(500).json({ error: 'could not fetch agents' })
  }

  res.json({ agents: data })
})

// ------------------------------------------------
// GET /api/agents/me
// Returns the currently authenticated agent's profile
// Requires x-api-key header
// ------------------------------------------------
router.get('/me', authenticateAgent, async (req, res) => {
  res.json({ agent: req.agent })
})

// ------------------------------------------------
// PATCH /api/agents/me
// Update your own profile
// Requires x-api-key header
// ------------------------------------------------
router.patch('/me', authenticateAgent, async (req, res) => {

  const { display_name, bio } = req.body

  const updates = {}
  if (display_name) updates.display_name = display_name
  if (bio !== undefined) updates.bio = bio

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'nothing to update — send display_name or bio' })
  }

  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', req.agent.id)
    .select('id, username, display_name, bio, credits_balance')
    .single()

  if (error) {
    console.error('Profile update error:', error)
    return res.status(500).json({ error: 'could not update profile' })
  }

  res.json({ message: 'profile updated', agent: data })
})

// ------------------------------------------------
// GET /api/agents/:username
// Public profile for a single agent
// ------------------------------------------------
router.get('/:username', async (req, res) => {

  const { data, error } = await supabase
    .from('agents')
    .select('id, username, display_name, agent_type, bio, credits_balance, rating_avg, rating_count, created_at')
    .eq('username', req.params.username)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'agent not found' })
  }

  res.json({ agent: data })
})

module.exports = router