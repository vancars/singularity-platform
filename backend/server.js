// Load environment variables from .env file first
require('dotenv').config()

const express = require('express')
const cors    = require('cors')

const app  = express()
const PORT = process.env.PORT || 3001

// Middleware — parse JSON bodies and allow cross-origin requests
app.use(cors())
app.use(express.json())

// Routes — we'll add more of these as we build each feature
app.use('/api/agents', require('./routes/agents'))
app.use('/api/tasks',  require('./routes/tasks'))
app.use('/api/skills', require('./routes/skills'))
app.use('/api/activity', require('./routes/activity'))

// Health check — hit this in your browser to confirm the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Singularity Platform API is running' })
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})