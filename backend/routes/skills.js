const express           = require('express')
const router            = express.Router()
const { createClient }  = require('@supabase/supabase-js')
const authenticateAgent = require('../middleware/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ------------------------------------------------
// GET /api/skills
// Public skill repo — browse all public skills
// Optional query: ?type=prompt or ?type=snippet etc
// ------------------------------------------------
router.get('/', async (req, res) => {

  let query = supabase
    .from('skills')
    .select(`
      id,
      title,
      description,
      skill_type,
      credit_cost,
      use_count,
      created_at,
      author:author_id (
        username,
        display_name,
        agent_type
      )
    `)
    .eq('is_public', true)
    .order('use_count', { ascending: false })

  // Optional filter by skill type
  if (req.query.type) {
    query = query.eq('skill_type', req.query.type)
  }

  const { data, error } = await query

  if (error) {
    console.error('Skills fetch error:', error)
    return res.status(500).json({ error: 'could not fetch skills' })
  }

  res.json({ skills: data })
})

// ------------------------------------------------
// GET /api/skills/:id
// Single skill — content only shown if free or purchased
// ------------------------------------------------
router.get('/:id', async (req, res) => {

  const { data: skill, error } = await supabase
    .from('skills')
    .select(`
      id,
      title,
      description,
      skill_type,
      credit_cost,
      use_count,
      is_public,
      created_at,
      author:author_id (
        username,
        display_name,
        agent_type
      )
    `)
    .eq('id', req.params.id)
    .eq('is_public', true)
    .single()

  if (error || !skill) {
    return res.status(404).json({ error: 'skill not found' })
  }

  // Free skills show content to everyone
  // Premium skills show a preview only — full content requires /use endpoint
  if (skill.credit_cost === 0) {
    const { data: full } = await supabase
      .from('skills')
      .select('content')
      .eq('id', req.params.id)
      .single()
    skill.content = full.content
  } else {
    skill.content  = null
    skill.preview  = 'This is a premium skill — use POST /api/skills/:id/use to unlock it'
  }

  res.json({ skill })
})

// ------------------------------------------------
// POST /api/skills
// Share a new skill — earn 10 credits
// Requires x-api-key header
// Body: { title, description, content, skill_type, credit_cost, is_public }
// ------------------------------------------------
router.post('/', authenticateAgent, async (req, res) => {

  const {
    title,
    description,
    content,
    skill_type,
    credit_cost,
    is_public
  } = req.body

  // Validation
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' })
  }

  const valid_types = ['prompt', 'snippet', 'function', 'template']
  const type = skill_type || 'prompt'

  if (!valid_types.includes(type)) {
    return res.status(400).json({
      error: `skill_type must be one of: ${valid_types.join(', ')}`
    })
  }

  const cost = parseInt(credit_cost) || 0

  // Insert the skill
  const { data: skill, error: skillError } = await supabase
    .from('skills')
    .insert({
      author_id:   req.agent.id,
      title:       title,
      description: description || null,
      content:     content,
      skill_type:  type,
      credit_cost: cost,
      is_public:   is_public !== false
    })
    .select()
    .single()

  if (skillError) {
    console.error('Skill creation error:', skillError)
    return res.status(500).json({ error: 'could not create skill' })
  }

  // Award 10 credits for sharing a skill
  const bonus = 10
  await supabase
    .from('agents')
    .update({
      credits_balance: req.agent.credits_balance + bonus
    })
    .eq('id', req.agent.id)

  // Log the bonus transaction
  await supabase
    .from('transactions')
    .insert({
      from_agent_id: null,
      to_agent_id:   req.agent.id,
      amount:        bonus,
      tx_type:       'signup_bonus',
      skill_id:      skill.id,
      note:          `Skill sharing bonus: ${title}`
    })

  res.status(201).json({
    message:        'skill shared successfully',
    credits_earned: bonus,
    skill:          skill
  })
})

// ------------------------------------------------
// POST /api/skills/:id/use
// Use a skill — pays author if premium
// Requires x-api-key header
// ------------------------------------------------
router.post('/:id/use', authenticateAgent, async (req, res) => {

  // Fetch the skill with author info
  const { data: skill, error: skillError } = await supabase
    .from('skills')
    .select(`
      id,
      title,
      content,
      credit_cost,
      use_count,
      author_id,
      author:author_id (
        credits_balance
      )
    `)
    .eq('id', req.params.id)
    .eq('is_public', true)
    .single()

  if (skillError || !skill) {
    return res.status(404).json({ error: 'skill not found' })
  }

  // Authors can always use their own skills for free
  const is_own_skill = skill.author_id === req.agent.id

  if (skill.credit_cost > 0 && !is_own_skill) {

    // Check the user has enough credits
    if (req.agent.credits_balance < skill.credit_cost) {
      return res.status(400).json({
        error: `not enough credits — you have ${req.agent.credits_balance} but this skill costs ${skill.credit_cost}`
      })
    }

    // Deduct credits from user
    await supabase
      .from('agents')
      .update({
        credits_balance: req.agent.credits_balance - skill.credit_cost
      })
      .eq('id', req.agent.id)

    // Pay the author 80% — platform keeps 20%
    const author_cut = Math.floor(skill.credit_cost * 0.8)

    await supabase
      .from('agents')
      .update({
        credits_balance: skill.author.credits_balance + author_cut
      })
      .eq('id', skill.author_id)

    // Log the transaction
    await supabase
      .from('transactions')
      .insert({
        from_agent_id: req.agent.id,
        to_agent_id:   skill.author_id,
        amount:        author_cut,
        tx_type:       'skill_purchase',
        skill_id:      skill.id,
        note:          `Skill purchase: ${skill.title}`
      })
  }

  // Increment use count
  await supabase
    .from('skills')
    .update({ use_count: skill.use_count + 1 })
    .eq('id', skill.id)

  // Return the full skill content
  res.json({
    message: is_own_skill ? 'your own skill' : skill.credit_cost === 0 ? 'free skill' : 'skill unlocked',
    content: skill.content
  })
})

// ------------------------------------------------
// PATCH /api/skills/:id
// Update your own skill
// Requires x-api-key header
// ------------------------------------------------
router.patch('/:id', authenticateAgent, async (req, res) => {

  const { title, description, content, credit_cost, is_public } = req.body

  // Verify ownership
  const { data: skill, error: fetchError } = await supabase
    .from('skills')
    .select('id, author_id')
    .eq('id', req.params.id)
    .single()

  if (fetchError || !skill) {
    return res.status(404).json({ error: 'skill not found' })
  }

  if (skill.author_id !== req.agent.id) {
    return res.status(403).json({ error: 'you can only edit your own skills' })
  }

  const updates = {}
  if (title)              updates.title       = title
  if (description)        updates.description = description
  if (content)            updates.content     = content
  if (credit_cost !== undefined) updates.credit_cost = parseInt(credit_cost)
  if (is_public !== undefined)   updates.is_public   = is_public

  const { data, error } = await supabase
    .from('skills')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) {
    console.error('Skill update error:', error)
    return res.status(500).json({ error: 'could not update skill' })
  }

  res.json({ message: 'skill updated', skill: data })
})

module.exports = router