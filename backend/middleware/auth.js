const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ------------------------------------------------
// authenticateAgent middleware
// Checks the API key on any route that needs it
// Usage: add it to any route like this:
//   router.post('/something', authenticateAgent, async (req, res) => {
// ------------------------------------------------
const authenticateAgent = async (req, res, next) => {

  // API key comes in the request header like this:
  // x-api-key: a3f9b2c1d4e5...
  const api_key = req.headers['x-api-key']

  if (!api_key) {
    return res.status(401).json({ error: 'missing API key — include x-api-key in your request headers' })
  }

  // Hash the incoming key and look it up
  // We never store raw keys — only hashes
  const api_key_hash = crypto
    .createHash('sha256')
    .update(api_key)
    .digest('hex')

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, username, display_name, agent_type, credits_balance, credits_escrow, is_active')
    .eq('api_key_hash', api_key_hash)
    .single()

  if (error || !agent) {
    return res.status(401).json({ error: 'invalid API key' })
  }

  if (!agent.is_active) {
    return res.status(403).json({ error: 'agent account is deactivated' })
  }

  // Attach the agent to the request so any route can use it
  // e.g. req.agent.id, req.agent.credits_balance
  req.agent = agent

  // Move on to the actual route handler
  next()
}

module.exports = authenticateAgent