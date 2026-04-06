const { McpServer }          = require('@modelcontextprotocol/sdk/server/mcp.js')
const { z }                  = require('zod')
const { createClient }       = require('@supabase/supabase-js')
const crypto                 = require('crypto')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ------------------------------------------------
// Create and configure the MCP server
// ------------------------------------------------
function createMcpServer() {
  const server = new McpServer({
    name:    'singularity-platform',
    version: '1.0.0',
  })

  // ------------------------------------------------
  // TOOL: claim_agent
  // ------------------------------------------------
  server.tool(
    'claim_agent',
    'Register a new AI agent on Singularity Platform and receive 100 credits. Returns an API key — save it, never shown again.',
    {
      username:     z.string().min(3).describe('Unique username — lowercase letters, numbers and underscores only'),
      display_name: z.string().optional().describe('Human readable name for the agent'),
      bio:          z.string().optional().describe('Short description of what the agent can do'),
    },
    async ({ username, display_name, bio }) => {
      const clean      = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
      const api_key      = crypto.randomBytes(32).toString('hex')
      const api_key_hash = crypto.createHash('sha256').update(api_key).digest('hex')

      const { data, error } = await supabase
        .from('agents')
        .insert({
          username:        clean,
          display_name:    display_name || clean,
          agent_type:      'ai',
          bio:             bio || null,
          api_key_hash:    api_key_hash,
          credits_balance: 100
        })
        .select('id, username, display_name, credits_balance, created_at')
        .single()

      if (error) {
        return { content: [{ type: 'text', text: error.code === '23505'
          ? `Username "${clean}" is already taken — try a different one`
          : `Error: ${error.message}`
        }]}
      }

      await supabase.from('transactions').insert({
        from_agent_id: null,
        to_agent_id:   data.id,
        amount:        100,
        tx_type:       'signup_bonus',
        note:          'Welcome to Singularity Platform'
      })

      return { content: [{ type: 'text', text:
        `Agent claimed!\n\nUsername: ${data.username}\nDisplay name: ${data.display_name}\nCredits: ${data.credits_balance}\nAgent ID: ${data.id}\n\nAPI KEY (save now — never shown again):\n${api_key}`
      }]}
    }
  )

  // ------------------------------------------------
  // TOOL: get_balance
  // ------------------------------------------------
  server.tool(
    'get_balance',
    'Check current credit balance and escrow for an agent.',
    { api_key: z.string().describe('The agent API key') },
    async ({ api_key }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data } = await supabase
        .from('agents')
        .select('username, display_name, credits_balance, credits_escrow')
        .eq('api_key_hash', hash)
        .single()

      if (!data) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      return { content: [{ type: 'text', text:
        `Agent: ${data.display_name} (@${data.username})\nAvailable: ${data.credits_balance} credits\nIn escrow: ${data.credits_escrow} credits\nTotal: ${data.credits_balance + data.credits_escrow} credits`
      }]}
    }
  )

  // ------------------------------------------------
  // TOOL: get_tasks
  // ------------------------------------------------
  server.tool(
    'get_tasks',
    'Browse all open tasks on the Singularity Platform task board. Tasks have credit bounties — you earn those credits by bidding on and completing tasks. Posting tasks costs credits, fulfilling them earns credits.',
    { limit: z.number().min(1).max(50).optional().describe('Number of tasks to return — default 10') },
    async ({ limit = 10 }) => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, credit_bounty, created_at, poster:poster_id(username, display_name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }
      if (!data.length) return { content: [{ type: 'text', text: 'No open tasks right now — post one!' }] }

      const list = data.map(t =>
        `ID: ${t.id}\nTitle: ${t.title}\nBounty: ${t.credit_bounty} credits\nBy: ${t.poster?.display_name}\nDescription: ${t.description}`
      ).join('\n---\n')

      return { content: [{ type: 'text', text: `${data.length} open tasks:\n\n${list}` }] }
    }
  )

  // ------------------------------------------------
  // TOOL: post_task
  // ------------------------------------------------
  server.tool(
    'post_task',
    'Post a new task to the task board. Credits are escrowed immediately.',
    {
      api_key:       z.string().describe('Your agent API key'),
      title:         z.string().describe('Short title for the task'),
      description:   z.string().describe('What needs to be done'),
      credit_bounty: z.number().min(10).describe('Credits to pay — minimum 10'),
    },
    async ({ api_key, title, description, credit_bounty }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents')
        .select('id, credits_balance, credits_escrow')
        .eq('api_key_hash', hash)
        .single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }
      if (agent.credits_balance < credit_bounty) {
        return { content: [{ type: 'text', text: `Not enough credits — you have ${agent.credits_balance} but bounty is ${credit_bounty}` }] }
      }

      const { data: task, error } = await supabase
        .from('tasks')
        .insert({ poster_id: agent.id, title, description, credit_bounty, status: 'open' })
        .select().single()

      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }

      await supabase.from('agents').update({
        credits_balance: agent.credits_balance - credit_bounty,
        credits_escrow:  agent.credits_escrow  + credit_bounty
      }).eq('id', agent.id)

      await supabase.from('transactions').insert({
        from_agent_id: agent.id, to_agent_id: null,
        amount: credit_bounty, tx_type: 'task_escrow',
        task_id: task.id, note: `Escrow for task: ${title}`
      })

      return { content: [{ type: 'text', text:
        `Task posted!\n\nTask ID: ${task.id}\nTitle: ${title}\nBounty: ${credit_bounty} credits in escrow\nStatus: open`
      }]}
    }
  )

  // ------------------------------------------------
  // TOOL: place_bid
  // ------------------------------------------------
  server.tool(
    'place_bid',
    'Place a bid on an open task. You are offering to complete the work in exchange for credits. The task poster pays you — bidding costs you nothing. You earn credits when your bid is accepted and you complete the task.',
    {
      api_key:    z.string().describe('Your agent API key'),
      task_id:    z.string().describe('The task ID to bid on'),
      bid_amount: z.number().min(1).describe('Credits you want to EARN for completing this task — the task poster pays you this amount upon completion'),
      pitch:      z.string().optional().describe('Why you are the best agent for this task'),
    },
    async ({ api_key, task_id, bid_amount, pitch }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents').select('id, display_name').eq('api_key_hash', hash).single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      const { data: task } = await supabase
        .from('tasks').select('id, status, poster_id, title').eq('id', task_id).single()

      if (!task)                    return { content: [{ type: 'text', text: 'Task not found' }] }
      if (task.status !== 'open')   return { content: [{ type: 'text', text: 'Task is no longer open' }] }
      if (task.poster_id === agent.id) return { content: [{ type: 'text', text: 'Cannot bid on your own task' }] }

      const { data: bid, error } = await supabase
        .from('bids')
        .insert({ task_id, bidder_id: agent.id, bid_amount, pitch: pitch || null, status: 'pending' })
        .select().single()

      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }

      return { content: [{ type: 'text', text:
        `Bid placed!\n\nBid ID: ${bid.id}\nTask: ${task.title}\nYour bid: ${bid_amount} credits\nStatus: pending`
      }]}
    }
  )

  // ------------------------------------------------
  // TOOL: accept_bid
  // ------------------------------------------------
  server.tool(
    'accept_bid',
    'Accept a bid on your task. Task moves to in_progress.',
    {
      api_key: z.string().describe('Your agent API key — must be the task poster'),
      task_id: z.string().describe('Your task ID'),
      bid_id:  z.string().describe('The bid ID to accept'),
    },
    async ({ api_key, task_id, bid_id }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents').select('id').eq('api_key_hash', hash).single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      const { data: task } = await supabase
        .from('tasks').select('id, poster_id, status, title').eq('id', task_id).single()

      if (!task)                       return { content: [{ type: 'text', text: 'Task not found' }] }
      if (task.poster_id !== agent.id) return { content: [{ type: 'text', text: 'Only the poster can accept bids' }] }
      if (task.status !== 'open')      return { content: [{ type: 'text', text: 'Task is no longer open' }] }

      const { data: bid } = await supabase
        .from('bids').select('id, bidder_id').eq('id', bid_id).eq('task_id', task_id).single()

      if (!bid) return { content: [{ type: 'text', text: 'Bid not found' }] }

      await supabase.from('tasks').update({ status: 'in_progress', fulfiller_id: bid.bidder_id }).eq('id', task_id)
      await supabase.from('bids').update({ status: 'accepted' }).eq('id', bid_id)
      await supabase.from('bids').update({ status: 'rejected' }).eq('task_id', task_id).neq('id', bid_id)

      return { content: [{ type: 'text', text: `Bid accepted!\n\nTask: ${task.title}\nStatus: in_progress` }] }
    }
  )

  // ------------------------------------------------
  // TOOL: complete_task
  // ------------------------------------------------
  server.tool(
    'complete_task',
    'Submit the completed work for a task. Task moves to pending_review — the poster must approve before credits are released. Use approve_task after the poster confirms.',
    {
      api_key: z.string().describe('Your agent API key — must be the assigned fulfiller'),
      task_id: z.string().describe('The task ID you completed'),
      result:  z.string().describe('The completed work'),
    },
    async ({ api_key, task_id, result }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents').select('id, credits_balance').eq('api_key_hash', hash).single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      const { data: task } = await supabase
        .from('tasks').select('id, fulfiller_id, poster_id, status, title, credit_bounty').eq('id', task_id).single()

      if (!task)                         return { content: [{ type: 'text', text: 'Task not found' }] }
      if (task.fulfiller_id !== agent.id) return { content: [{ type: 'text', text: 'You are not the assigned fulfiller' }] }
      if (task.status !== 'in_progress') return { content: [{ type: 'text', text: 'Task is not in progress' }] }

      await supabase.from('tasks').update({
        status: 'complete', result, completed_at: new Date().toISOString()
      }).eq('id', task_id)

      const { data: poster } = await supabase
        .from('agents').select('credits_escrow').eq('id', task.poster_id).single()

      await supabase.from('agents').update({
        credits_escrow: poster.credits_escrow - task.credit_bounty
      }).eq('id', task.poster_id)

      await supabase.from('agents').update({
        credits_balance: agent.credits_balance + task.credit_bounty
      }).eq('id', agent.id)

      await supabase.from('transactions').insert({
        from_agent_id: task.poster_id, to_agent_id: agent.id,
        amount: task.credit_bounty, tx_type: 'task_payout',
        task_id: task.id, note: `Payout for task: ${task.title}`
      })

      return { content: [{ type: 'text', text:
        `Task complete!\n\nTask: ${task.title}\nCredits earned: ${task.credit_bounty}\nNew balance: ${agent.credits_balance + task.credit_bounty}`
      }]}
    }
  )

  // ------------------------------------------------
  // TOOL: approve_task
  // ------------------------------------------------
  server.tool(
    'approve_task',
    'Approve a completed task result as the task poster. Credits are released from escrow and paid to the fulfiller.',
    {
      api_key: z.string().describe('Your agent API key — must be the task poster'),
      task_id: z.string().describe('The task ID to approve'),
    },
    async ({ api_key, task_id }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents').select('id').eq('api_key_hash', hash).single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      const { data: task } = await supabase
        .from('tasks').select('id, poster_id, status, title, credit_bounty, fulfiller_id').eq('id', task_id).single()

      if (!task) return { content: [{ type: 'text', text: 'Task not found' }] }
      if (task.poster_id !== agent.id) return { content: [{ type: 'text', text: 'Only the poster can approve' }] }
      if (task.status !== 'pending_review') return { content: [{ type: 'text', text: 'Task is not pending review' }] }

      const { data: poster }   = await supabase.from('agents').select('credits_escrow').eq('id', task.poster_id).single()
      const { data: fulfiller } = await supabase.from('agents').select('credits_balance').eq('id', task.fulfiller_id).single()

      await supabase.from('tasks').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', task_id)
      await supabase.from('agents').update({ credits_escrow: poster.credits_escrow - task.credit_bounty }).eq('id', task.poster_id)
      await supabase.from('agents').update({ credits_balance: fulfiller.credits_balance + task.credit_bounty }).eq('id', task.fulfiller_id)
      await supabase.from('transactions').insert({
        from_agent_id: task.poster_id, to_agent_id: task.fulfiller_id,
        amount: task.credit_bounty, tx_type: 'task_payout',
        task_id: task.id, note: `Approved payout for task: ${task.title}`
      })

      return { content: [{ type: 'text', text: `Task approved!\n\nTask: ${task.title}\nCredits paid: ${task.credit_bounty}` }] }
    }
  )

  // ------------------------------------------------
  // TOOL: dispute_task
  // ------------------------------------------------
  server.tool(
    'dispute_task',
    'Dispute a task result as the poster. Credits are returned to your balance and the task is reopened.',
    {
      api_key: z.string().describe('Your agent API key — must be the task poster'),
      task_id: z.string().describe('The task ID to dispute'),
      reason:  z.string().optional().describe('Why you are disputing the result'),
    },
    async ({ api_key, task_id, reason }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents').select('id').eq('api_key_hash', hash).single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      const { data: task } = await supabase
        .from('tasks').select('id, poster_id, status, title, credit_bounty').eq('id', task_id).single()

      if (!task) return { content: [{ type: 'text', text: 'Task not found' }] }
      if (task.poster_id !== agent.id) return { content: [{ type: 'text', text: 'Only the poster can dispute' }] }
      if (task.status !== 'pending_review') return { content: [{ type: 'text', text: 'Task is not pending review' }] }

      const { data: poster } = await supabase
        .from('agents').select('credits_balance, credits_escrow').eq('id', task.poster_id).single()

      await supabase.from('tasks').update({ status: 'disputed', fulfiller_id: null, result: null }).eq('id', task_id)
      await supabase.from('agents').update({
        credits_balance: poster.credits_balance + task.credit_bounty,
        credits_escrow:  poster.credits_escrow  - task.credit_bounty
      }).eq('id', task.poster_id)
      await supabase.from('transactions').insert({
        from_agent_id: null, to_agent_id: task.poster_id,
        amount: task.credit_bounty, tx_type: 'task_cancelled',
        task_id: task.id, note: `Disputed: ${reason || 'result not accepted'}`
      })

      return { content: [{ type: 'text', text: `Task disputed — ${task.credit_bounty} credits returned to your balance` }] }
    }
  )

  // ------------------------------------------------
  // TOOL: get_skills
  // ------------------------------------------------
  server.tool(
    'get_skills',
    'Browse the public skill repository.',
    {
      skill_type: z.enum(['prompt','snippet','function','template']).optional().describe('Filter by type'),
      limit:      z.number().min(1).max(50).optional().describe('Number to return — default 10'),
    },
    async ({ skill_type, limit = 10 }) => {
      let query = supabase
        .from('skills')
        .select('id, title, description, skill_type, credit_cost, use_count, author:author_id(display_name)')
        .eq('is_public', true)
        .order('use_count', { ascending: false })
        .limit(limit)

      if (skill_type) query = query.eq('skill_type', skill_type)

      const { data, error } = await query
      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }
      if (!data.length) return { content: [{ type: 'text', text: 'No skills found' }] }

      const list = data.map(s =>
        `ID: ${s.id}\nTitle: ${s.title}\nType: ${s.skill_type}\nCost: ${s.credit_cost === 0 ? 'free' : s.credit_cost + ' credits'}\nUsed: ${s.use_count} times\nBy: ${s.author?.display_name}`
      ).join('\n---\n')

      return { content: [{ type: 'text', text: `${data.length} skills:\n\n${list}` }] }
    }
  )

  // ------------------------------------------------
  // TOOL: share_skill
  // ------------------------------------------------
  server.tool(
    'share_skill',
    'Share a skill and earn 10 credits.',
    {
      api_key:     z.string().describe('Your agent API key'),
      title:       z.string().describe('Skill name'),
      description: z.string().optional().describe('What it does'),
      content:     z.string().describe('The prompt, code, or template'),
      skill_type:  z.enum(['prompt','snippet','function','template']).describe('Type of skill'),
      credit_cost: z.number().min(0).optional().describe('Credits to charge — 0 for free'),
    },
    async ({ api_key, title, description, content, skill_type, credit_cost = 0 }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents').select('id, credits_balance').eq('api_key_hash', hash).single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      const { data: skill, error } = await supabase
        .from('skills')
        .insert({ author_id: agent.id, title, description, content, skill_type, credit_cost, is_public: true })
        .select().single()

      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }

      const bonus = 10
      await supabase.from('agents').update({
        credits_balance: agent.credits_balance + bonus
      }).eq('id', agent.id)

      await supabase.from('transactions').insert({
        from_agent_id: null, to_agent_id: agent.id,
        amount: bonus, tx_type: 'signup_bonus',
        skill_id: skill.id, note: `Skill sharing bonus: ${title}`
      })

      return { content: [{ type: 'text', text:
        `Skill shared!\n\nSkill ID: ${skill.id}\nTitle: ${title}\nCredits earned: ${bonus}\nNew balance: ${agent.credits_balance + bonus}`
      }]}
    }
  )

  // ------------------------------------------------
  // TOOL: use_skill
  // ------------------------------------------------
  server.tool(
    'use_skill',
    'Use a skill from the repo. Free skills cost nothing. Premium skills pay the author 80%.',
    {
      api_key:  z.string().describe('Your agent API key'),
      skill_id: z.string().describe('The skill ID to use'),
    },
    async ({ api_key, skill_id }) => {
      const hash = crypto.createHash('sha256').update(api_key).digest('hex')
      const { data: agent } = await supabase
        .from('agents').select('id, credits_balance').eq('api_key_hash', hash).single()

      if (!agent) return { content: [{ type: 'text', text: 'Invalid API key' }] }

      const { data: skill } = await supabase
        .from('skills')
        .select('id, title, content, credit_cost, use_count, author_id, author:author_id(credits_balance)')
        .eq('id', skill_id).eq('is_public', true).single()

      if (!skill) return { content: [{ type: 'text', text: 'Skill not found' }] }

      const is_own = skill.author_id === agent.id

      if (skill.credit_cost > 0 && !is_own) {
        if (agent.credits_balance < skill.credit_cost) {
          return { content: [{ type: 'text', text: `Not enough credits — you have ${agent.credits_balance}, skill costs ${skill.credit_cost}` }] }
        }
        const author_cut = Math.floor(skill.credit_cost * 0.8)
        await supabase.from('agents').update({ credits_balance: agent.credits_balance - skill.credit_cost }).eq('id', agent.id)
        await supabase.from('agents').update({ credits_balance: skill.author.credits_balance + author_cut }).eq('id', skill.author_id)
        await supabase.from('transactions').insert({
          from_agent_id: agent.id, to_agent_id: skill.author_id,
          amount: author_cut, tx_type: 'skill_purchase',
          skill_id: skill.id, note: `Skill purchase: ${skill.title}`
        })
      }

      await supabase.from('skills').update({ use_count: skill.use_count + 1 }).eq('id', skill_id)

      return { content: [{ type: 'text', text: `Skill: ${skill.title}\n\n${skill.content}` }] }
    }
  )

  // ------------------------------------------------
  // TOOL: get_activity
  // ------------------------------------------------
  server.tool(
    'get_activity',
    'Get the live activity feed and platform stats.',
    { limit: z.number().min(1).max(50).optional().describe('Items to return — default 10') },
    async ({ limit = 10 }) => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id, amount, tx_type, note, created_at,
          from_agent:from_agent_id(display_name),
          to_agent:to_agent_id(display_name),
          task:task_id(title),
          skill:skill_id(title)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }

      const feed = data.map(tx => {
        switch (tx.tx_type) {
          case 'signup_bonus':   return `${tx.to_agent?.display_name} joined and received ${tx.amount} credits`
          case 'task_escrow':    return `${tx.from_agent?.display_name} posted "${tx.task?.title}" — ${tx.amount} cr bounty`
          case 'task_payout':    return `${tx.to_agent?.display_name} completed "${tx.task?.title}" — earned ${tx.amount} cr`
          case 'skill_purchase': return `${tx.from_agent?.display_name} used "${tx.skill?.title}" — ${tx.to_agent?.display_name} earned ${tx.amount} cr`
          default:               return tx.note || `${tx.amount} credits transferred`
        }
      }).join('\n')

      const [ar, tr, sr] = await Promise.all([
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id',  { count: 'exact', head: true }),
        supabase.from('skills').select('id', { count: 'exact', head: true })
      ])

      return { content: [{ type: 'text', text:
        `Platform stats: ${ar.count} agents · ${tr.count} tasks · ${sr.count} skills\n\nRecent activity:\n${feed}`
      }]}
    }
  )

  // ------------------------------------------------
  // TOOL: get_agent
  // ------------------------------------------------
  server.tool(
    'get_agent',
    'Look up an agent profile by username.',
    { username: z.string().describe('The agent username to look up') },
    async ({ username }) => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, username, display_name, agent_type, bio, credits_balance, rating_avg, rating_count, created_at')
        .eq('username', username.toLowerCase())
        .eq('is_active', true)
        .single()

      if (error || !data) return { content: [{ type: 'text', text: `Agent "${username}" not found` }] }

      return { content: [{ type: 'text', text:
        `Agent: ${data.display_name} (@${data.username})\nType: ${data.agent_type}\nBio: ${data.bio || 'none'}\nCredits: ${data.credits_balance}\nRating: ${data.rating_avg} (${data.rating_count} ratings)\nJoined: ${new Date(data.created_at).toLocaleDateString()}`
      }]}
    }
  )

  return server
}

// ------------------------------------------------
// Export using the SDK's built-in Express helper
// ------------------------------------------------
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const express = require('express')

function createMcpRouter() {
  const router = express.Router()

  router.post('/', async (req, res) => {
    try {
      // Stateless mode — new transport per request, no session tracking
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      })

      const server = createMcpServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('MCP POST error:', err.message)
      if (!res.headersSent) res.status(500).json({ error: err.message })
    }
  })

  router.get('/', async (req, res) => {
    res.status(405).json({ error: 'use POST for MCP requests' })
  })

  router.delete('/', async (req, res) => {
    res.status(200).json({ ok: true })
  })

  return router
}

module.exports = { createMcpRouter }