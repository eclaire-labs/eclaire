#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function clean() {
  console.log(`${colors.yellow}⚠️  WARNING: This will delete all generated configuration files${colors.reset}`);
  console.log('\nThe following files will be deleted:');
  console.log('  - apps/backend/.env.dev');
  console.log('  - apps/backend/.env.prod');
  console.log('  - config/models.json');

  const answer = await question(`\n${colors.red}Are you sure you want to continue? [y/N] ${colors.reset}`);
  const normalizedAnswer = answer.trim().toLowerCase();

  if (normalizedAnswer !== 'y' && normalizedAnswer !== 'yes') {
    console.log(`${colors.green}Clean cancelled.${colors.reset}`);
    rl.close();
    return;
  }

  const files = [
    'apps/backend/.env.dev',
    'apps/backend/.env.prod',
    'config/models.json'
  ];

  let deletedCount = 0;
  let notFoundCount = 0;

  for (const file of files) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`  ${colors.green}✓${colors.reset} Deleted: ${file}`);
        deletedCount++;
      } catch (error) {
        console.log(`  ${colors.red}✗${colors.reset} Failed to delete ${file}: ${error.message}`);
      }
    } else {
      console.log(`  ${colors.cyan}-${colors.reset} Not found: ${file}`);
      notFoundCount++;
    }
  }

  console.log(`\n${colors.green}Clean complete:${colors.reset} ${deletedCount} files deleted, ${notFoundCount} not found`);
  rl.close();
}

// Run clean
clean().catch(error => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  rl.close();
  process.exit(1);
});