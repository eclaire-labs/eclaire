#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const {
  checkDependencies,
  copyEnvFiles,
  createDataDirectories,
  checkModels,
  installDependencies,
  buildContainers,
  startDependencies,
  initDatabase,
  printSummary,
  colors
} = require('./setup-utils');

// Parse command line arguments
const args = process.argv.slice(2);

// Check for flags first
const flags = {
  yes: args.includes('--yes') || args.includes('-y'),
  force: args.includes('--force') || args.includes('-f'),
  skipDeps: args.includes('--skip-deps'),
  skipModels: args.includes('--skip-models'),
  skipDb: args.includes('--skip-db'),
  build: args.includes('--build')
};

// Get environment after filtering out flags
const nonFlagArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
const environment = nonFlagArgs[0] || 'prompt';

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function confirm(message, defaultValue = true) {
  if (flags.yes) return true;

  const defaultHint = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = await question(`${message} ${defaultHint} `);
  const normalizedAnswer = answer.trim().toLowerCase();

  if (normalizedAnswer === '') return defaultValue;
  return normalizedAnswer === 'y' || normalizedAnswer === 'yes';
}

async function chooseEnvironment() {
  console.log(`\n${colors.cyan}Choose your setup environment:${colors.reset}`);
  console.log('1. Development (dev)');
  console.log('2. Production (prod)');
  console.log('3. Exit');

  const choice = await question('\nEnter your choice (1-3): ');

  switch (choice.trim()) {
    case '1':
      return 'dev';
    case '2':
      return 'prod';
    case '3':
      process.exit(0);
    default:
      console.log(`${colors.red}Invalid choice. Please try again.${colors.reset}`);
      return chooseEnvironment();
  }
}

async function showPreflightSummary(env) {
  console.log(`\n${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║             Setup Overview                   ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}`);

  console.log(`\nEnvironment: ${colors.green}${env}${colors.reset}`);
  console.log('\nThis setup will:');

  if (!flags.skipDeps) {
    console.log(`  1. ${colors.blue}Check system dependencies${colors.reset} (Node.js, Docker, PM2, LibreOffice, Poppler, etc.)`);
  }
  console.log(`  2. ${colors.blue}Copy environment files${colors.reset} (.env.${env} files, models.json)`);
  console.log(`  3. ${colors.blue}Create data directories${colors.reset} (logs, database, redis, user data)`);

  if (!flags.skipModels) {
    console.log(`  4. ${colors.blue}Check AI models${colors.reset} (show download commands for llama.cpp)`);
  }

  if (!flags.skipDb) {
    console.log(`  5. ${colors.blue}Install pnpm dependencies${colors.reset} (backend, frontend, workers)`);
    if (env === 'prod' && flags.build) {
      console.log(`  6. ${colors.blue}Build Docker containers${colors.reset} (--build flag detected)`);
    } else if (env === 'prod') {
      console.log(`  6. ${colors.blue}Skip Docker build${colors.reset} (will use official GHCR images)`);
    }
    console.log(`  ${env === 'prod' ? '7' : '6'}. ${colors.blue}Start dependencies${colors.reset} (PostgreSQL, Redis, AI models via PM2)`);
    console.log(`     ${colors.yellow}Note: AI models will download on first start (may take 5-10 minutes)${colors.reset}`);
    console.log(`  ${env === 'prod' ? '8' : '7'}. ${colors.blue}Initialize database${colors.reset} (migrations, ${env === 'dev' ? 'demo' : 'essential'} seed data)`);
  }

  if (flags.yes) {
    console.log(`\n${colors.yellow}Non-interactive mode: All steps will run without confirmation${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}Interactive mode: You'll confirm each step${colors.reset}`);
  }

  console.log(`\nTo skip all prompts: ${colors.cyan}pnpm setup:dev -- --yes${colors.reset}`);

  const proceed = await question(`\n${colors.green}Proceed with setup?${colors.reset} [Y/n] `);
  if (proceed.toLowerCase() === 'n' || proceed.toLowerCase() === 'no') {
    console.log('Setup cancelled.');
    process.exit(0);
  }
}

async function setup() {
  console.log(`${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║            Eclaire Setup Script              ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}`);

  // Determine environment
  let env;
  if (environment === 'dev' || environment === 'prod') {
    env = environment;
    console.log(`\n${colors.green}Setting up for ${env} environment${colors.reset}`);
  } else if (environment === 'prompt') {
    env = await chooseEnvironment();
  } else {
    console.log(`${colors.red}Invalid environment: ${environment}${colors.reset}`);
    console.log('Usage: pnpm setup [dev|prod] [options]');
    console.log('Options:');
    console.log('  --yes, -y          Skip all prompts (non-interactive mode)');
    console.log('  --force, -f        Overwrite existing files');
    console.log('  --skip-deps        Skip dependency checks');
    console.log('  --skip-models      Skip model checks');
    console.log('  --skip-db          Skip database initialization');
    console.log('  --build            Build Docker containers locally (prod only)');
    process.exit(1);
  }

  // Show pre-flight summary and get confirmation
  await showPreflightSummary(env);

  const results = {
    dependencies: false,
    envFiles: false,
    directories: false,
    models: false,
    npmDependencies: false,
    containersBuilt: false,
    dependenciesStarted: false,
    database: false,
    // Failed states
    dependenciesFailed: false,
    envFilesFailed: false,
    directoriesFailed: false,
    modelsFailed: false,
    npmDependenciesFailed: false,
    containersBuildFailed: false,
    dependenciesStartedFailed: false,
    databaseFailed: false
  };

  try {
    // Step 1: Check system dependencies
    if (!flags.skipDeps) {
      if (await confirm('\nStep 1: Check system dependencies?')) {
        console.log(`\n${colors.blue}Checking dependencies...${colors.reset}`);
        try {
          results.dependencies = await checkDependencies(env);
        } catch (error) {
          console.log(`  ${colors.red}❌ Dependency check failed: ${error.message}${colors.reset}`);
          results.dependenciesFailed = true;
        }
      } else {
        console.log(`${colors.yellow}Skipping dependency check${colors.reset}`);
      }
    }

    // Step 2: Copy environment files
    if (await confirm('\nStep 2: Copy environment configuration files?')) {
      console.log(`\n${colors.blue}Copying environment files...${colors.reset}`);
      try {
        results.envFiles = await copyEnvFiles(env, flags.force);
      } catch (error) {
        console.log(`  ${colors.red}❌ Environment file setup failed: ${error.message}${colors.reset}`);
        results.envFilesFailed = true;
      }
    } else {
      console.log(`${colors.yellow}Skipping environment file setup${colors.reset}`);
    }

    // Step 3: Create data directories
    if (await confirm('\nStep 3: Create required data directories?')) {
      console.log(`\n${colors.blue}Creating data directories...${colors.reset}`);
      try {
        results.directories = await createDataDirectories();
      } catch (error) {
        console.log(`  ${colors.red}❌ Directory creation failed: ${error.message}${colors.reset}`);
        results.directoriesFailed = true;
      }
    } else {
      console.log(`${colors.yellow}Skipping directory creation${colors.reset}`);
    }

    // Step 4: Check AI models
    if (!flags.skipModels) {
      if (await confirm('\nStep 4: Check if AI models are downloaded?')) {
        console.log(`\n${colors.blue}Checking AI models...${colors.reset}`);
        try {
          results.models = await checkModels();
        } catch (error) {
          console.log(`  ${colors.red}❌ Model check failed: ${error.message}${colors.reset}`);
          results.modelsFailed = true;
        }
      } else {
        console.log(`${colors.yellow}Skipping model check${colors.reset}`);
      }
    }

    // Step 5: Install npm dependencies
    if (!flags.skipDb) {
      if (await confirm('\nStep 5: Install pnpm dependencies?')) {
        console.log(`\n${colors.blue}Installing pnpm dependencies...${colors.reset}`);
        try {
          results.npmDependencies = await installDependencies(env);
          if (!results.npmDependencies) {
            results.npmDependenciesFailed = true;
          }
        } catch (error) {
          console.log(`  ${colors.red}❌ NPM dependencies installation failed: ${error.message}${colors.reset}`);
          results.npmDependenciesFailed = true;
        }
      } else {
        console.log(`${colors.yellow}Skipping pnpm dependencies installation (assuming already installed)${colors.reset}`);
        results.npmDependencies = true; // Mark as done so subsequent steps can proceed
      }
    }

    // Step 6: Build containers (production only, optional with --build flag)
    if (!flags.skipDb && env === 'prod' && results.npmDependencies && flags.build) {
      if (await confirm('\nStep 6: Build Docker containers?')) {
        console.log(`\n${colors.blue}Building containers...${colors.reset}`);
        try {
          results.containersBuilt = await buildContainers();
          if (!results.containersBuilt) {
            results.containersBuildFailed = true;
          }
        } catch (error) {
          console.log(`  ${colors.red}❌ Container build failed: ${error.message}${colors.reset}`);
          results.containersBuildFailed = true;
        }
      } else {
        console.log(`${colors.yellow}Skipping container build${colors.reset}`);
        results.containersBuilt = true; // Mark as done so database init proceeds
      }
    } else if (!flags.skipDb && env === 'prod' && results.npmDependencies && !flags.build) {
      console.log(`${colors.yellow}Skipping container build (using official GHCR images). Use --build flag to build locally.${colors.reset}`);
      results.containersBuilt = true; // Mark as done so database init proceeds
    } else if (!flags.skipDb && env === 'prod' && !results.npmDependencies) {
      console.log(`${colors.yellow}Skipping container build (pnpm dependencies not installed)${colors.reset}`);
    }

    // Step 7: Start dependencies (needed for database)
    if (!flags.skipDb && results.npmDependencies && (env === 'dev' || results.containersBuilt)) {
      if (await confirm('\nStep 7: Start dependencies (PostgreSQL, Redis)?', false)) {
        console.log(`\n${colors.blue}Starting dependencies...${colors.reset}`);
        try {
          results.dependenciesStarted = await startDependencies();
          if (!results.dependenciesStarted) {
            results.dependenciesStartedFailed = true;
          }
        } catch (error) {
          console.log(`  ${colors.red}❌ Dependencies start failed: ${error.message}${colors.reset}`);
          results.dependenciesStartedFailed = true;
        }
      } else {
        console.log(`${colors.yellow}Skipping dependency start (assuming already running)${colors.reset}`);
        results.dependenciesStarted = true; // Mark as done so database init can proceed
      }
    } else if (!flags.skipDb && !results.npmDependencies) {
      console.log(`${colors.yellow}Skipping dependency start (npm dependencies not installed)${colors.reset}`);
    }

    // Step 8: Initialize database
    if (!flags.skipDb && results.dependenciesStarted) {
      if (await confirm('\nStep 8: Initialize database?')) {
        console.log(`\n${colors.blue}Initializing database...${colors.reset}`);
        try {
          results.database = await initDatabase(env, question);
          if (!results.database) {
            results.databaseFailed = true;
          }
        } catch (error) {
          console.log(`  ${colors.red}❌ Database initialization failed: ${error.message}${colors.reset}`);
          results.databaseFailed = true;
        }
      } else {
        console.log(`${colors.yellow}Skipping database initialization${colors.reset}`);
      }
    } else if (!flags.skipDb && !results.dependenciesStarted) {
      console.log(`${colors.yellow}Skipping database initialization (dependencies not started)${colors.reset}`);
    }

    // Print summary
    console.log('\n');
    printSummary(results, env, flags);

    // Check for failures and exit with appropriate code
    const hasFailures = Object.keys(results).some(key => key.endsWith('Failed') && results[key]);

    if (hasFailures) {
      console.log(`\n${colors.red}Setup completed with errors. Please review and fix the issues above.${colors.reset}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n${colors.red}Setup failed: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run setup
setup().catch(error => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  process.exit(1);
});