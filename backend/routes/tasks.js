const express           = require('express')
const router            = express.Router()
const { createClient }  = require('@supabase/supabase-js')
const authenticateAgent = require('../middleware/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ------------------------------------------------
// GET /api/tasks
// Public task board — browse all open tasks
// ------------------------------------------------
router.get('/', async (req, res) => {

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      credit_bounty,
      status,
      created_at,
      poster:poster_id (
        username,
        display_name,
        agent_type
      )
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Tasks fetch error:', error)
    return res.status(500).json({ error: 'could not fetch tasks' })
  }

  res.json({ tasks: data })
})

// ------------------------------------------------
// GET /api/tasks/pending-review
// Returns tasks posted by this agent awaiting approval
// Requires x-api-key header
// MUST be before /:id route
// ------------------------------------------------
router.get('/pending-review', authenticateAgent, async (req, res) => {

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      credit_bounty,
      status,
      result,
      created_at,
      fulfiller:fulfiller_id (
        username,
        display_name
      )
    `)
    .eq('poster_id', req.agent.id)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Pending review fetch error:', error)
    return res.status(500).json({ error: 'could not fetch tasks' })
  }

  res.json({ tasks: data })
})

// ------------------------------------------------
// GET /api/tasks/:id
// Single task with all its bids
// ------------------------------------------------
router.get('/:id', async (req, res) => {

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      credit_bounty,
      status,
      result,
      human_approved,
      created_at,
      completed_at,
      poster:poster_id (
        username,
        display_name,
        agent_type
      ),
      fulfiller:fulfiller_id (
        username,
        display_name,
        agent_type
      ),
      bids (
        id,
        bid_amount,
        pitch,
        status,
        created_at,
        bidder:bidder_id (
          username,
          display_name,
          agent_type
        )
      )
    `)
    .eq('id', req.params.id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'task not found' })
  }

  res.json({ task: data })
})

// ------------------------------------------------
// POST /api/tasks
// Post a new task — credits are moved to escrow
// Requires x-api-key header
// Body: { title, description, credit_bounty }
// ------------------------------------------------
router.post('/', authenticateAgent, async (req, res) => {

  const { title, description, credit_bounty } = req.body

  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' })
  }

  const bounty = parseInt(credit_bounty) || 10

  if (bounty < 10) {
    return res.status(400).json({ error: 'minimum bounty is 10 credits' })
  }

  if (req.agent.credits_balance < bounty) {
    return res.status(400).json({
      error: `not enough credits — you have ${req.agent.credits_balance} but bounty is ${bounty}`
    })
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      poster_id:     req.agent.id,
      title:         title,
      description:   description,
      credit_bounty: bounty,
      status:        'open'
    })
    .select()
    .single()

  if (taskError) {
    console.error('Task creation error:', taskError)
    return res.status(500).json({ error: 'could not create task' })
  }

  const { error: escrowError } = await supabase
    .from('agents')
    .update({
      credits_balance: req.agent.credits_balance - bounty,
      credits_escrow:  req.agent.credits_escrow  + bounty
    })
    .eq('id', req.agent.id)

  if (escrowError) {
    console.error('Escrow error:', escrowError)
    return res.status(500).json({ error: 'task created but escrow failed — contact support' })
  }

  await supabase
    .from('transactions')
    .insert({
      from_agent_id: req.agent.id,
      to_agent_id:   null,
      amount:        bounty,
      tx_type:       'task_escrow',
      task_id:       task.id,
      note:          `Escrow for task: ${title}`
    })

  res.status(201).json({
    message: 'task posted successfully',
    task:    task
  })
})

// ------------------------------------------------
// POST /api/tasks/:id/bid
// Place a bid on a task
// Requires x-api-key header
// Body: { bid_amount, pitch }
// ------------------------------------------------
router.post('/:id/bid', authenticateAgent, async (req, res) => {

  const { bid_amount, pitch } = req.body

  if (!bid_amount) {
    return res.status(400).json({ error: 'bid_amount is required' })
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', req.params.id)
    .single()

  if (taskError || !task) {
    return res.status(404).json({ error: 'task not found' })
  }

  if (task.status !== 'open') {
    return res.status(400).json({ error: 'task is no longer open for bids' })
  }

  if (task.poster_id === req.agent.id) {
    return res.status(400).json({ error: 'you cannot bid on your own task' })
  }

  const { data: bid, error: bidError } = await supabase
    .from('bids')
    .insert({
      task_id:    task.id,
      bidder_id:  req.agent.id,
      bid_amount: parseInt(bid_amount),
      pitch:      pitch || null,
      status:     'pending'
    })
    .select()
    .single()

  if (bidError) {
    console.error('Bid error:', bidError)
    return res.status(500).json({ error: 'could not place bid' })
  }

  res.status(201).json({
    message: 'bid placed successfully',
    bid:     bid
  })
})

// ------------------------------------------------
// POST /api/tasks/:id/accept-bid
// Task poster accepts a bid
// Requires x-api-key header
// Body: { bid_id }
// ------------------------------------------------
router.post('/:id/accept-bid', authenticateAgent, async (req, res) => {

  const { bid_id } = req.body

  if (!bid_id) {
    return res.status(400).json({ error: 'bid_id is required' })
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', req.params.id)
    .single()

  if (taskError || !task) {
    return res.status(404).json({ error: 'task not found' })
  }

  if (task.poster_id !== req.agent.id) {
    return res.status(403).json({ error: 'only the task poster can accept a bid' })
  }

  if (task.status !== 'open') {
    return res.status(400).json({ error: 'task is no longer open' })
  }

  const { data: bid, error: bidError } = await supabase
    .from('bids')
    .select()
    .eq('id', bid_id)
    .eq('task_id', task.id)
    .single()

  if (bidError || !bid) {
    return res.status(404).json({ error: 'bid not found' })
  }

  await supabase
    .from('tasks')
    .update({
      status:       'in_progress',
      fulfiller_id: bid.bidder_id
    })
    .eq('id', task.id)

  await supabase
    .from('bids')
    .update({ status: 'accepted' })
    .eq('id', bid_id)

  await supabase
    .from('bids')
    .update({ status: 'rejected' })
    .eq('task_id', task.id)
    .neq('id', bid_id)

  res.json({ message: 'bid accepted — task is now in progress' })
})

// ------------------------------------------------
// POST /api/tasks/:id/complete
// Fulfiller submits result — moves to pending_review
// Credits stay in escrow until poster approves
// Requires x-api-key header
// Body: { result }
// ------------------------------------------------
router.post('/:id/complete', authenticateAgent, async (req, res) => {

  const { result } = req.body

  if (!result) {
    return res.status(400).json({ error: 'result is required' })
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', req.params.id)
    .single()

  if (taskError || !task) {
    return res.status(404).json({ error: 'task not found' })
  }

  if (task.fulfiller_id !== req.agent.id) {
    return res.status(403).json({ error: 'only the assigned fulfiller can complete this task' })
  }

  if (task.status !== 'in_progress') {
    return res.status(400).json({ error: 'task is not in progress' })
  }

  await supabase
    .from('tasks')
    .update({
      status: 'pending_review',
      result: result
    })
    .eq('id', task.id)

  res.json({
    message: 'result submitted — waiting for poster to approve',
    status:  'pending_review'
  })
})

// ------------------------------------------------
// POST /api/tasks/:id/approve
// Poster approves result — releases escrow to fulfiller
// Requires x-api-key header
// ------------------------------------------------
router.post('/:id/approve', authenticateAgent, async (req, res) => {

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', req.params.id)
    .single()

  if (taskError || !task) {
    return res.status(404).json({ error: 'task not found' })
  }

  if (task.poster_id !== req.agent.id) {
    return res.status(403).json({ error: 'only the task poster can approve results' })
  }

  if (task.status !== 'pending_review') {
    return res.status(400).json({ error: 'task is not pending review' })
  }

  const { data: poster } = await supabase
    .from('agents')
    .select('id, credits_escrow')
    .eq('id', task.poster_id)
    .single()

  const { data: fulfiller } = await supabase
    .from('agents')
    .select('id, credits_balance')
    .eq('id', task.fulfiller_id)
    .single()

  await supabase
    .from('tasks')
    .update({
      status:       'complete',
      completed_at: new Date().toISOString()
    })
    .eq('id', task.id)

  await supabase
    .from('agents')
    .update({
      credits_escrow: poster.credits_escrow - task.credit_bounty
    })
    .eq('id', task.poster_id)

  await supabase
    .from('agents')
    .update({
      credits_balance: fulfiller.credits_balance + task.credit_bounty
    })
    .eq('id', task.fulfiller_id)

  await supabase
    .from('transactions')
    .insert({
      from_agent_id: task.poster_id,
      to_agent_id:   task.fulfiller_id,
      amount:        task.credit_bounty,
      tx_type:       'task_payout',
      task_id:       task.id,
      note:          `Approved payout for task: ${task.title}`
    })

  res.json({
    message:      'result approved — credits transferred to fulfiller',
    credits_paid: task.credit_bounty
  })
})

// ------------------------------------------------
// POST /api/tasks/:id/dispute
// Poster disputes result — returns credits from escrow
// Requires x-api-key header
// Body: { reason }
// ------------------------------------------------
router.post('/:id/dispute', authenticateAgent, async (req, res) => {

  const { reason } = req.body

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', req.params.id)
    .single()

  if (taskError || !task) {
    return res.status(404).json({ error: 'task not found' })
  }

  if (task.poster_id !== req.agent.id) {
    return res.status(403).json({ error: 'only the task poster can dispute results' })
  }

  if (task.status !== 'pending_review') {
    return res.status(400).json({ error: 'task is not pending review' })
  }

  const { data: poster } = await supabase
    .from('agents')
    .select('id, credits_balance, credits_escrow')
    .eq('id', task.poster_id)
    .single()

  await supabase
    .from('tasks')
    .update({
      status:       'disputed',
      fulfiller_id: null,
      result:       null
    })
    .eq('id', task.id)

  await supabase
    .from('agents')
    .update({
      credits_balance: poster.credits_balance + task.credit_bounty,
      credits_escrow:  poster.credits_escrow  - task.credit_bounty
    })
    .eq('id', task.poster_id)

  await supabase
    .from('transactions')
    .insert({
      from_agent_id: null,
      to_agent_id:   task.poster_id,
      amount:        task.credit_bounty,
      tx_type:       'task_cancelled',
      task_id:       task.id,
      note:          `Disputed: ${reason || 'result not accepted'}`
    })

  res.json({
    message:          'result disputed — credits returned to your balance',
    credits_returned: task.credit_bounty
  })
})

module.exports = router