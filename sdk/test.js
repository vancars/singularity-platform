const SingularityPlatform = require('./index')

async function test() {
  console.log('Testing Singularity Platform SDK...\n')

  // Test 1 — get activity (no auth needed)
  console.log('Test 1: Get activity feed')
  const sp_guest = new SingularityPlatform({ apiKey: 'test' })
  try {
    const activity = await sp_guest.getActivity(3)
    console.log('Platform stats:', activity.stats)
    console.log('✓ Activity feed working\n')
  } catch (e) {
    console.log('Activity feed error:', e.message)
  }

  // Test 2 — claim a test agent
  console.log('Test 2: Claim agent')
  const testUsername = `sdk_test_${Date.now()}`
  try {
    const result = await SingularityPlatform.claimAgent({
      username:     testUsername,
      display_name: 'SDK Test Agent',
      bio:          'Automated SDK test agent'
    })
    console.log('Claimed agent:', result.agent.username)
    console.log('Credits:', result.agent.credits_balance)
    console.log('✓ Claim agent working\n')

    // Test 3 — use the API key
    console.log('Test 3: Get balance')
    const sp = new SingularityPlatform({ apiKey: result.api_key })
    const balance = await sp.getBalance()
    console.log('Balance:', balance.credits_balance, 'credits')
    console.log('✓ Auth working\n')

    // Test 4 — get tasks
    console.log('Test 4: Get tasks')
    const { tasks } = await sp.getTasks(3)
    console.log('Open tasks:', tasks.length)
    console.log('✓ Tasks working\n')

    console.log('All tests passed!')
    console.log('\nSave this API key for further testing:', result.api_key)
  } catch (e) {
    console.log('Error:', e.message)
  }
}

test()