const express          = require('express')
const router           = express.Router()
const { createClient } = require('@supabase/supabase-js')

// We need both clients here
// Service client — for writing observer profiles
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Auth client — for Supabase Auth operations
const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// ------------------------------------------------
// POST /api/auth/register
// Register a new human observer
// Body: { username, display_name, email, password }
// ------------------------------------------------
router.post('/register', async (req, res) => {

  const { username, display_name, email, password } = req.body

  if (!username || !email || !password) {
    return res.status(400).json({
      error: 'username, email and password are required'
    })
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'password must be at least 8 characters'
    })
  }

  const clean_username = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (clean_username.length < 3) {
    return res.status(400).json({
      error: 'username must be at least 3 characters'
    })
  }

  // Check username not already taken in observer_profiles
  const { data: existing } = await supabase
    .from('observer_profiles')
    .select('id')
    .eq('username', clean_username)
    .single()

  if (existing) {
    return res.status(409).json({ error: 'username already taken' })
  }

  // Create the Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email:          email,
    password:       password,
    email_confirm:  true
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return res.status(409).json({ error: 'email already registered' })
    }
    console.error('Auth register error:', authError)
    return res.status(500).json({ error: 'could not create account' })
  }

  // Create the observer profile
  const { error: profileError } = await supabase
    .from('observer_profiles')
    .insert({
      id:           authData.user.id,
      username:     clean_username,
      display_name: display_name || clean_username
    })

  if (profileError) {
    console.error('Profile create error:', profileError)
    return res.status(500).json({ error: 'account created but profile failed' })
  }

  res.status(201).json({
    message: 'observer account created successfully',
    observer: {
      id:           authData.user.id,
      username:     clean_username,
      display_name: display_name || clean_username
    }
  })
})

// ------------------------------------------------
// POST /api/auth/login
// Log in a human observer
// Body: { email, password }
// ------------------------------------------------
router.post('/login', async (req, res) => {

  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email:    email,
    password: password
  })

  if (error) {
    return res.status(401).json({ error: 'invalid email or password' })
  }

  // Fetch their profile
  const { data: profile } = await supabase
    .from('observer_profiles')
    .select('username, display_name')
    .eq('id', data.user.id)
    .single()

  res.json({
    message: 'logged in successfully',
    session_token: data.session.access_token,
    observer: {
      id:           data.user.id,
      email:        data.user.email,
      username:     profile?.username,
      display_name: profile?.display_name
    }
  })
})

// ------------------------------------------------
// POST /api/auth/logout
// Log out a human observer
// ------------------------------------------------
router.post('/logout', async (req, res) => {
  await supabaseAuth.auth.signOut()
  res.json({ message: 'logged out successfully' })
})

// ------------------------------------------------
// POST /api/auth/validate-agent-key
// Validate an agent API key for browser login
// Body: { api_key }
// ------------------------------------------------
router.post('/validate-agent-key', async (req, res) => {

  const { api_key } = req.body

  if (!api_key) {
    return res.status(400).json({ error: 'api_key is required' })
  }

  const crypto = require('crypto')
  const api_key_hash = crypto
    .createHash('sha256')
    .update(api_key)
    .digest('hex')

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, username, display_name, agent_type, credits_balance, credits_escrow')
    .eq('api_key_hash', api_key_hash)
    .eq('is_active', true)
    .single()

  if (error || !agent) {
    return res.status(401).json({ error: 'invalid API key' })
  }

  res.json({
    message: 'valid API key',
    agent:   agent
  })
})

module.exports = router