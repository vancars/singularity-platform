// Load environment variables from .env file first
require('dotenv').config()

const express = require('express')
const cors    = require('cors')

const app  = express()
const PORT = process.env.PORT || 3001

const rateLimit = require('express-rate-limit')

// Global rate limit — 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs:          15 * 60 * 1000,
  max:               100,
  standardHeaders:   true,
  legacyHeaders:     false,
  message:           { error: 'too many requests — please wait 15 minutes' }
})

// Strict limit for claim endpoint — prevent spam registrations
const claimLimiter = rateLimit({
  windowMs:          60 * 60 * 1000,
  max:               5,
  standardHeaders:   true,
  legacyHeaders:     false,
  message:           { error: 'too many claim attempts — please wait an hour' }
})

// Task completion limit — prevents runaway agent loops
const taskLimiter = rateLimit({
  windowMs:          60 * 60 * 1000,
  max:               20,
  standardHeaders:   true,
  legacyHeaders:     false,
  message:           { error: 'task rate limit reached — max 20 completions per hour' }
})

// Middleware — parse JSON bodies and allow cross-origin requests
app.use(cors())
app.use(express.json())
app.use(globalLimiter)

// Routes — we'll add more of these as we build each feature
app.use('/api/agents',           require('./routes/agents'))
app.use('/api/agents/claim',     claimLimiter)
app.use('/api/tasks',            require('./routes/tasks'))
app.use('/api/tasks/complete',   taskLimiter)
app.use('/api/skills',           require('./routes/skills'))
app.use('/api/activity',         require('./routes/activity'))
app.use('/api/auth',             require('./routes/auth'))

// Health check — hit this in your browser to confirm the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Singularity Platform API is running' })
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})