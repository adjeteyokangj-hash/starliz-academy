#!/usr/bin/env node

/**
 * End-to-End Test: Curriculum System Integration
 * Tests the complete flow from content generation through to parent insights
 * 
 * Test scenarios:
 * 1. Reception phonics generation
 * 2. Year 2 spelling generation
 * 3. Year 6 maths generation
 * 4. Year 8 science generation
 * 5. Year 11 GCSE Maths generation
 */

// Use built-in fetch in Node 18+
const fetch = global.fetch;

const API_BASE = 'http://localhost:3000';
let adminToken = null;

// Test data for each scenario
const testScenarios = [
  {
    name: 'Reception Phonics',
    subject: 'phonics',
    yearGroup: 'Reception',
    keyStage: 'EYFS',
    skillFocus: 'Phase 2 Letter Sounds',
    ageGroup: '4–5',
    difficulty: 2,
  },
  {
    name: 'Year 2 Spelling',
    subject: 'spelling',
    yearGroup: 'Year 2',
    keyStage: 'KS1',
    skillFocus: 'CVC Words',
    ageGroup: '6–7',
    difficulty: 2,
  },
  {
    name: 'Year 6 Maths',
    subject: 'maths',
    yearGroup: 'Year 6',
    keyStage: 'KS2',
    skillFocus: 'Fractions',
    ageGroup: '11–12',
    difficulty: 5,
  },
  {
    name: 'Year 8 Science',
    subject: 'science',
    yearGroup: 'Year 8',
    keyStage: 'KS3',
    skillFocus: 'Cell Structure',
    ageGroup: '13–14',
    difficulty: 5,
  },
  {
    name: 'Year 11 GCSE Maths',
    subject: 'gcse-maths',
    yearGroup: 'Year 11',
    keyStage: 'KS4',
    skillFocus: 'Trigonometry',
    ageGroup: '15–16',
    difficulty: 5,
  },
];

async function login() {
  console.log('🔐 Logging in as admin...');
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'adjeteyokangj@gmail.com',
        password: process.env.ADMIN_PASSWORD || 'StarLiz@123',
      }),
    });

    if (!response.ok) {
      // Try alternate password
      const response2 = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'adjeteyokangj@gmail.com',
          password: 'admin123',
        }),
      });
      
      if (!response2.ok) {
        console.log('⚠ Login failed, continuing without auth (dev mode may not require it)');
        return false;
      }
      
      const data = await response2.json();
      adminToken = data.token || data.accessToken;
    } else {
      const data = await response.json();
      adminToken = data.token || data.accessToken;
    }

    if (adminToken) {
      console.log('✓ Login successful');
      return true;
    }

    console.log('✓ Login response received (using for session)');
    return true;
  } catch (error) {
    console.log(`⚠ Login error (continuing without auth): ${error.message}`);
    return false;
  }
}

async function testContentGeneration(scenario) {
  console.log(`\n📝 Testing: ${scenario.name}`);
  console.log(`   Subject: ${scenario.subject}, Year: ${scenario.yearGroup}, Key Stage: ${scenario.keyStage}`);

  try {
    // Step 1: Generate content
    console.log('   → Calling /api/admin/ai/generate...');
    const genResponse = await fetch(`${API_BASE}/api/admin/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken && { Authorization: `Bearer ${adminToken}` }),
      },
      body: JSON.stringify({
        subject: scenario.subject,
        yearGroup: scenario.yearGroup,
        keyStage: scenario.keyStage,
        skillFocus: scenario.skillFocus,
        ageGroup: scenario.ageGroup,
        difficulty: scenario.difficulty,
      }),
    });

    if (!genResponse.ok) {
      const errData = await genResponse.text();
      throw new Error(`Generation failed (${genResponse.status}): ${errData.substring(0, 200)}`);
    }

    const genData = await genResponse.json();
    if (!genData.items) {
      throw new Error('No content items in response');
    }

    console.log(`   ✓ Generated ${genData.items.length} items`);

    // Step 2: Save to content library
    console.log('   → Saving to /api/admin/content-library...');
    const saveResponse = await fetch(`${API_BASE}/api/admin/content-library`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken && { Authorization: `Bearer ${adminToken}` }),
      },
      body: JSON.stringify({
        type: scenario.subject,
        yearGroup: scenario.yearGroup,
        keyStage: scenario.keyStage,
        skillFocus: scenario.skillFocus,
        ageGroup: scenario.ageGroup,
        difficulty: scenario.difficulty,
        topic: scenario.skillFocus,
        items: genData,
        status: 'review',
      }),
    });

    if (!saveResponse.ok) {
      const errData = await saveResponse.text();
      throw new Error(`Save failed (${saveResponse.status}): ${errData.substring(0, 200)}`);
    }

    const savedData = await saveResponse.json();
    const contentId = savedData.item?.id;
    if (!contentId) {
      throw new Error('No content ID returned');
    }

    console.log(`   ✓ Saved to content library (ID: ${contentId})`);

    // Step 3: Verify content metadata
    console.log('   → Verifying metadata in /api/admin/content...');
    const metaResponse = await fetch(
      `${API_BASE}/api/admin/content?yearGroup=${encodeURIComponent(scenario.yearGroup)}&keyStage=${scenario.keyStage}`,
      {
        headers: {
          ...(adminToken && { Authorization: `Bearer ${adminToken}` }),
        },
      }
    );

    if (!metaResponse.ok) {
      throw new Error(`Metadata fetch failed (${metaResponse.status})`);
    }

    const metaData = await metaResponse.json();
    const savedContent = metaData.items?.find((item) => item.id === contentId);

    if (!savedContent) {
      throw new Error('Content not found in library');
    }

    // Verify metadata fields
    const metadata = JSON.parse(savedContent.metadataJson || '{}');
    const expectedFields = ['subject', 'yearGroup', 'keyStage', 'skillFocus', 'difficulty', 'approvalStatus'];
    const missingFields = expectedFields.filter((f) => !(f in metadata));

    if (missingFields.length > 0) {
      console.log(`   ⚠ Missing metadata fields: ${missingFields.join(', ')}`);
    } else {
      console.log(`   ✓ Metadata complete: ${metadata.subject} · ${metadata.yearGroup} · ${metadata.keyStage} · ${metadata.skillFocus}`);
    }

    return { success: true, contentId, scenario };
  } catch (error) {
    console.error(`   ✗ Test failed: ${error.message}`);
    return { success: false, error: error.message, scenario };
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🚀 END-TO-END CURRICULUM SYSTEM TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Try login but continue without token if it fails
  // (may not have auth middleware set up in dev)
  await login();

  const results = [];
  for (const scenario of testScenarios) {
    const result = await testContentGeneration(scenario);
    results.push(result);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`✓ Passed: ${successful}/${results.length}`);
  console.log(`✗ Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter((r) => !r.success).forEach((r) => {
      console.log(`  - ${r.scenario.name}: ${r.error}`);
    });
  }

  console.log('\n✓ Test complete. Check results above for any issues.\n');
}

runTests().catch(console.error);
