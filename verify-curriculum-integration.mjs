#!/usr/bin/env node

/**
 * Verify Curriculum System Integration
 * Tests that curriculum constants are properly integrated
 */

import { promises as fs } from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const srcPath = path.join(projectRoot, 'src');

async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Could not read ${filePath}:`, error.message);
    return null;
  }
}

async function verifyFile(filePath, searches) {
  const content = await readFile(filePath);
  if (!content) return { found: 0, missing: searches.length };

  const results = {};
  for (const search of searches) {
    results[search] = content.includes(search);
  }
  return results;
}

async function runVerification() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✓ CURRICULUM INTEGRATION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const checks = [];

  // Check 1: curriculum.ts exports
  console.log('1️⃣ Verifying src/lib/curriculum.ts exports...');
  const curriculumFile = await readFile(path.join(srcPath, 'lib', 'curriculum.ts'));
  if (curriculumFile) {
    const exports = [
      'YEAR_GROUPS',
      'KEY_STAGES',
      'AGE_GROUPS',
      'type Subject',
      'subjectsForYearGroup',
      'skillsForSubjectAndYear',
      'ageGroupForYearGroup',
    ];
    const found = exports.filter(e => curriculumFile.includes(e)).length;
    console.log(`   ✓ ${found}/${exports.length} exports found`);
    checks.push({ name: 'curriculum.ts exports', passed: found === exports.length });
  }

  // Check 2: AI Generator uses curriculum
  console.log('\n2️⃣ Verifying AI Generator uses curriculum constants...');
  const aiGenFile = await readFile(path.join(srcPath, 'app', 'admin', 'ai-generator', 'page.tsx'));
  if (aiGenFile) {
    const required = [
      'from "@/lib/curriculum"',
      'type Subject',
      'YEAR_GROUPS',
      'AGE_GROUPS',
      'subjectsForYearGroup',
    ];
    const found = required.filter(r => aiGenFile.includes(r)).length;
    console.log(`   ✓ ${found}/${required.length} imports/uses found`);
    checks.push({ name: 'AI Generator imports', passed: found === required.length });

    // Check for hardcoded lists (should not exist)
    const badPatterns = ['SPELLING_PHONICS_SKILLS', 'READING_SKILLS', 'MATH_SKILLS'];
    const foundBad = badPatterns.filter(p => aiGenFile.includes(p)).length;
    if (foundBad === 0) {
      console.log(`   ✓ No hardcoded skill lists found (good!)`);
      checks.push({ name: 'No hardcoded lists in AI Gen', passed: true });
    } else {
      console.log(`   ✗ Found ${foundBad} hardcoded lists (should remove!)`);
      checks.push({ name: 'No hardcoded lists in AI Gen', passed: false });
    }
  }

  // Check 3: Content API uses curriculum
  console.log('\n3️⃣ Verifying Content API integrates curriculum...');
  const contentApiFile = await readFile(path.join(srcPath, 'app', 'api', 'admin', 'content', 'route.ts'));
  if (contentApiFile) {
    const required = [
      'type Subject',
      'mapSubjectToLegacy',
      'legacyType',
    ];
    const found = required.filter(r => contentApiFile.includes(r)).length;
    console.log(`   ✓ ${found}/${required.length} integrations found`);
    checks.push({ name: 'Content API integration', passed: found === required.length });
  }

  // Check 4: Generate API uses curriculum
  console.log('\n4️⃣ Verifying Generate API uses curriculum...');
  const generateApiFile = await readFile(path.join(srcPath, 'app', 'api', 'admin', 'ai', 'generate', 'route.ts'));
  if (generateApiFile) {
    const required = [
      'from "@/lib/curriculum"',
      'keyStageForYearGroup',
      'ageGroupForYearGroup',
      'type Subject',
    ];
    const found = required.filter(r => generateApiFile.includes(r)).length;
    console.log(`   ✓ ${found}/${required.length} imports/uses found`);
    checks.push({ name: 'Generate API integration', passed: found === required.length });
  }

  // Check 5: Content Library page uses curriculum
  console.log('\n5️⃣ Verifying Content Library page uses curriculum...');
  const contentLibFile = await readFile(path.join(srcPath, 'app', 'admin', 'content-library', 'page.tsx'));
  if (contentLibFile) {
    const required = [
      'from "@/lib/curriculum"',
      'YEAR_GROUPS',
      'KEY_STAGES',
    ];
    const found = required.filter(r => contentLibFile.includes(r)).length;
    console.log(`   ✓ ${found}/${required.length} imports/uses found`);
    checks.push({ name: 'Content Library integration', passed: found === required.length });
  }

  // Check 6: Student filters use curriculum
  console.log('\n6️⃣ Verifying Student page filters use curriculum...');
  const studentEditFile = await readFile(path.join(srcPath, 'app', 'admin', 'students', '[id]', 'edit', 'page.tsx'));
  if (studentEditFile) {
    const hasYearGroups = studentEditFile.includes('YEAR_GROUPS');
    console.log(`   ${hasYearGroups ? '✓' : '✗'} Student edit uses curriculum`);
    checks.push({ name: 'Student edit integration', passed: hasYearGroups });
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  📊 VERIFICATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;

  checks.forEach(check => {
    console.log(`${check.passed ? '✓' : '✗'} ${check.name}`);
  });

  console.log(`\n✓ Passed: ${passed}/${total}\n`);

  if (passed === total) {
    console.log('✨ All curriculum integrations verified!\n');
    console.log('Next steps:');
    console.log('1. Test content generation via admin UI or API');
    console.log('2. Verify content appears in Content Library with proper metadata');
    console.log('3. Test assigning content to a student');
    console.log('4. Verify content appears in student lesson flow');
    console.log('5. Test attempt tracking and weak area updates');
    console.log('6. Verify parent dashboard shows progress from attempts\n');
  } else {
    console.log('⚠️  Some integrations may be incomplete. Check the results above.\n');
  }
}

runVerification().catch(console.error);
