#!/usr/bin/env node

const readline = require('readline');
const {
  checkDependencies,
  copyEnvFiles,
  chooseDatabaseType,
  configureDatabaseInEnv,
  createDataDirectories,
  checkModels,
  installDependencies,
  initDatabase,
  printSummary,
  colors
} = require('./setup-utils');

// Parse command line arguments
const args = process.argv.slice(2);

// Check for flags
const flags = {
  force: args.includes('--force') || args.includes('-f'),
  skipDeps: args.includes('--skip-deps'),
  skipModels: args.includes('--skip-models'),
  skipDb: args.includes('--skip-db')
};

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function confirm(message, defaultValue = true) {
  const defaultHint = defaultValue ? '[Y/n]' : '[y/N]';
  const answer = await question(`${message} ${defaultHint} `);
  const normalizedAnswer = answer.trim().toLowerCase();

  if (normalizedAnswer === '') return defaultValue;
  return normalizedAnswer === 'y' || normalizedAnswer === 'yes';
}

async function showPreflightSummary() {
  console.log(`\n${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║             Setup Overview                   ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}`);

  console.log(`\nEnvironment: ${colors.green}development${colors.reset}`);
  console.log('\nThis setup will:');

  if (!flags.skipDeps) {
    console.log(`  1. ${colors.blue}Check system dependencies${colors.reset} (Node.js, Docker, PM2, LibreOffice, Poppler, etc.)`);
  }
  console.log(`  2. ${colors.blue}Copy environment files${colors.reset} (.env, models.json)`);
  console.log(`  3. ${colors.blue}Choose database${colors.reset} (SQLite or PostgreSQL)`);
  console.log(`  4. ${colors.blue}Create data directories${colors.reset} (logs, database, user data)`);

  if (!flags.skipModels) {
    console.log(`  5. ${colors.blue}Check AI models${colors.reset} (show download commands for llama.cpp)`);
  }

  if (!flags.skipDb) {
    console.log(`  6. ${colors.blue}Install pnpm dependencies${colors.reset}`);
    console.log(`  7. ${colors.blue}Initialize database${colors.reset} (migrations, demo seed data)`);
  }

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
  console.log(`\n${colors.green}Setting up development environment${colors.reset}`);

  // Show pre-flight summary and get confirmation
  await showPreflightSummary();

  const results = {
    dependencies: false,
    envFiles: false,
    directories: false,
    models: false,
    npmDependencies: false,
    database: false,
    // Failed states
    dependenciesFailed: false,
    envFilesFailed: false,
    directoriesFailed: false,
    modelsFailed: false,
    npmDependenciesFailed: false,
    databaseFailed: false
  };

  try {
    // Step 1: Check system dependencies
    if (!flags.skipDeps) {
      if (await confirm('\nStep 1: Check system dependencies?')) {
        console.log(`\n${colors.blue}Checking dependencies...${colors.reset}`);
        try {
          results.dependencies = await checkDependencies();
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
        results.envFiles = await copyEnvFiles(flags.force);
      } catch (error) {
        console.log(`  ${colors.red}❌ Environment file setup failed: ${error.message}${colors.reset}`);
        results.envFilesFailed = true;
      }
    } else {
      console.log(`${colors.yellow}Skipping environment file setup${colors.reset}`);
    }

    // Step 3: Choose database type
    if (results.envFiles) {
      console.log(`\n${colors.blue}Step 3: Choose database type${colors.reset}`);
      try {
        results.databaseType = await chooseDatabaseType();
        await configureDatabaseInEnv(results.databaseType, question);
      } catch (error) {
        console.log(`  ${colors.red}❌ Database configuration failed: ${error.message}${colors.reset}`);
        results.databaseType = 'sqlite'; // Default to SQLite on error
      }
    } else {
      results.databaseType = 'sqlite'; // Default if env files were skipped
    }

    // Step 4: Create data directories
    if (await confirm('\nStep 4: Create required data directories?')) {
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

    // Step 5: Check AI models
    if (!flags.skipModels) {
      if (await confirm('\nStep 5: Check if AI models are downloaded?')) {
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

    // Step 6: Install npm dependencies
    if (!flags.skipDb) {
      if (await confirm('\nStep 6: Install pnpm dependencies?')) {
        console.log(`\n${colors.blue}Installing pnpm dependencies...${colors.reset}`);
        try {
          results.npmDependencies = await installDependencies();
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

    // Step 7: Initialize database
    if (!flags.skipDb && results.npmDependencies) {
      if (await confirm('\nStep 7: Initialize database?')) {
        console.log(`\n${colors.blue}Initializing database...${colors.reset}`);
        try {
          results.database = await initDatabase(results.databaseType || 'sqlite');
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
    } else if (!flags.skipDb && !results.npmDependencies) {
      console.log(`${colors.yellow}Skipping database initialization (pnpm dependencies not installed)${colors.reset}`);
    }

    // Print summary
    console.log('\n');
    printSummary(results);

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
