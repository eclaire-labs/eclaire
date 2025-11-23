const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Generate secure random values for production
function generateSecureValue(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Generate API keys for production
function generateApiKey() {
  const prefix = 'sk';
  const part1 = crypto.randomBytes(8).toString('hex').substring(0, 15);
  const part2 = crypto.randomBytes(16).toString('hex');
  return `${prefix}-${part1}-${part2}`;
}

// Helper to execute commands and return output
function exec(command, silent = false) {
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Check if a command exists
function commandExists(command) {
  try {
    const checkCommand = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${checkCommand} ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Get version of a command
function getVersion(command, versionFlag = '--version') {
  try {
    const output = execSync(`${command} ${versionFlag} 2>&1`, { encoding: 'utf-8', stdio: 'pipe' });
    return output.trim().split('\n')[0];
  } catch {
    return 'unknown';
  }
}

// Check all required dependencies
async function checkDependencies(env = 'dev') {
  const deps = [
    {
      name: 'Node.js',
      command: 'node',
      minVersion: '24.0.0',
      check: () => {
        const version = getVersion('node', '-v').replace('v', '');
        return { exists: true, version };
      }
    },
    {
      name: 'pnpm',
      command: 'pnpm',
      minVersion: '10.21.0',
      check: () => {
        const version = getVersion('pnpm', '-v');
        return { exists: true, version };
      }
    },
    {
      name: 'Docker',
      command: 'docker',
      check: () => ({
        exists: commandExists('docker'),
        version: getVersion('docker', '--version')
      })
    },
    {
      name: 'Docker Compose',
      command: 'docker compose',
      check: () => ({
        exists: commandExists('docker'),
        version: getVersion('docker compose', 'version')
      })
    },
    {
      name: 'PM2',
      command: 'pm2',
      check: () => ({
        exists: commandExists('pm2'),
        version: getVersion('pm2', '-v')
      })
    },
    {
      name: 'llama.cpp',
      command: 'llama-server',
      optional: true,
      check: () => ({
        exists: commandExists('llama-server'),
        version: commandExists('llama-server') ? 'installed' : 'not installed'
      })
    },
    {
      name: 'docling-serve',
      command: 'docling-serve',
      optional: true,
      check: () => ({
        exists: commandExists('docling-serve'),
        version: commandExists('docling-serve') ? 'installed' : 'not installed'
      })
    }
  ];

  // Add document/image processing dependencies only for dev mode
  // (prod uses Docker containers with everything pre-installed)
  if (env === 'dev') {
    deps.push(
      {
        name: 'LibreOffice',
        command: 'soffice',
        check: () => ({
          exists: commandExists('soffice'),
          version: commandExists('soffice') ? getVersion('soffice', '--version') : 'not installed'
        })
      },
      {
        name: 'Poppler Utils (pdftocairo)',
        command: 'pdftocairo',
        check: () => ({
          exists: commandExists('pdftocairo'),
          version: commandExists('pdftocairo') ? getVersion('pdftocairo', '-v') : 'not installed'
        })
      },
      {
        name: 'GraphicsMagick',
        command: 'gm',
        optional: true,
        check: () => ({
          exists: commandExists('gm'),
          version: commandExists('gm') ? getVersion('gm', 'version') : 'not installed'
        })
      },
      {
        name: 'ImageMagick',
        command: 'magick',
        optional: true,
        check: () => ({
          exists: commandExists('magick'),
          version: commandExists('magick') ? getVersion('magick', '-version') : 'not installed'
        })
      },
      {
        name: 'Ghostscript',
        command: 'gs',
        optional: true,
        check: () => ({
          exists: commandExists('gs'),
          version: commandExists('gs') ? getVersion('gs', '--version') : 'not installed'
        })
      },
      {
        name: 'libheif (HEIC support)',
        command: 'heif-convert',
        optional: true,
        check: () => ({
          exists: commandExists('heif-convert'),
          version: commandExists('heif-convert') ? 'installed' : 'not installed'
        })
      }
    );
  }

  let allGood = true;
  console.log(`\n${colors.cyan}Checking dependencies:${colors.reset}`);

  for (const dep of deps) {
    const result = dep.check();
    const icon = result.exists ? '✅' : (dep.optional ? '⚠️ ' : '❌');
    const status = result.exists ? colors.green : (dep.optional ? colors.yellow : colors.red);

    console.log(`  ${icon} ${dep.name}: ${status}${result.version}${colors.reset}`);

    if (!result.exists && !dep.optional) {
      allGood = false;
      console.log(`     ${colors.red}Please install ${dep.name}${colors.reset}`);
      if (dep.name === 'PM2') {
        console.log(`     Run: ${colors.cyan}pnpm add -g pm2${colors.reset}`);
      } else if (dep.name === 'LibreOffice') {
        console.log(`     macOS: ${colors.cyan}brew install --cask libreoffice${colors.reset}`);
        console.log(`     Ubuntu/Debian: ${colors.cyan}sudo apt-get install libreoffice${colors.reset}`);
      } else if (dep.name === 'Poppler Utils (pdftocairo)') {
        console.log(`     macOS: ${colors.cyan}brew install poppler${colors.reset}`);
        console.log(`     Ubuntu/Debian: ${colors.cyan}sudo apt-get install poppler-utils${colors.reset}`);
      }
    }

    if (!result.exists && dep.optional) {
      console.log(`     ${colors.yellow}Optional: See installation guide for ${dep.name}${colors.reset}`);
      if (dep.name === 'GraphicsMagick') {
        console.log(`     macOS: ${colors.cyan}brew install graphicsmagick${colors.reset}`);
        console.log(`     Ubuntu/Debian: ${colors.cyan}sudo apt-get install graphicsmagick${colors.reset}`);
      } else if (dep.name === 'ImageMagick') {
        console.log(`     macOS: ${colors.cyan}brew install imagemagick${colors.reset}`);
        console.log(`     Ubuntu/Debian: ${colors.cyan}sudo apt-get install imagemagick${colors.reset}`);
      } else if (dep.name === 'Ghostscript') {
        console.log(`     macOS: ${colors.cyan}brew install ghostscript${colors.reset}`);
        console.log(`     Ubuntu/Debian: ${colors.cyan}sudo apt-get install ghostscript${colors.reset}`);
      } else if (dep.name === 'libheif (HEIC support)') {
        console.log(`     macOS: ${colors.cyan}brew install libheif${colors.reset}`);
        console.log(`     Ubuntu/Debian: ${colors.cyan}sudo apt-get install libheif-examples${colors.reset}`);
      }
    }
  }

  if (!allGood) {
    throw new Error('Missing required dependencies. Please install them and try again.');
  }

  return true;
}

// Copy environment files
async function copyEnvFiles(env, force = false) {
  const filesToCopy = [
    {
      source: `apps/frontend/.env.${env}.example`,
      dest: `apps/frontend/.env.${env}`
    },
    {
      source: `apps/backend/.env.${env}.example`,
      dest: `apps/backend/.env.${env}`,
      isBackend: true
    },
    {
      source: 'config/models.json.example',
      dest: 'config/models.json'
    }
  ];

  let copiedCount = 0;
  let skippedCount = 0;
  const generatedValues = {};

  for (const file of filesToCopy) {
    const sourcePath = path.join(process.cwd(), file.source);
    const destPath = path.join(process.cwd(), file.dest);

    if (!fs.existsSync(sourcePath)) {
      console.log(`  ❌ Source file not found: ${file.source}`);
      continue;
    }

    if (fs.existsSync(destPath) && !force) {
      console.log(`  ⏭️  File already exists: ${file.dest}`);
      skippedCount++;
      continue;
    }

    try {
      let content = fs.readFileSync(sourcePath, 'utf-8');

      // For production backend, generate secure values
      if (env === 'prod' && file.isBackend) {
        console.log(`  🔐 Generating secure values for backend...`);

        const betterAuthSecret = generateSecureValue(64);
        const masterEncryptionKey = generateSecureValue(32);
        const apiKeyHmacSecret = generateSecureValue(32);

        content = content.replace(
          /BETTER_AUTH_SECRET=$/m,
          `BETTER_AUTH_SECRET=${betterAuthSecret}`
        );
        content = content.replace(
          /MASTER_ENCRYPTION_KEY=$/m,
          `MASTER_ENCRYPTION_KEY=${masterEncryptionKey}`
        );
        content = content.replace(
          /API_KEY_HMAC_KEY_V1=$/m,
          `API_KEY_HMAC_KEY_V1=${apiKeyHmacSecret}`
        );

        console.log(`  ✅ Generated secure BETTER_AUTH_SECRET`);
        console.log(`  ✅ Generated secure MASTER_ENCRYPTION_KEY`);
        console.log(`  ✅ Generated secure API_KEY_HMAC_KEY_V1`);
      }

      fs.writeFileSync(destPath, content);
      console.log(`  ✅ Copied: ${file.source} → ${file.dest}`);
      copiedCount++;
    } catch (error) {
      console.log(`  ❌ Failed to copy ${file.source}: ${error.message}`);
    }
  }

  console.log(`\n  Summary: ${copiedCount} files copied, ${skippedCount} skipped`);

  return copiedCount > 0 || skippedCount > 0;
}

// Create required data directories
async function createDataDirectories() {
  const directories = [
    'data',
    'data/logs',
    'data/users',
    'data/browser-data',
    'data/db',
    'data/redis'
  ];

  let createdCount = 0;
  let existingCount = 0;

  for (const dir of directories) {
    const dirPath = path.join(process.cwd(), dir);

    if (fs.existsSync(dirPath)) {
      console.log(`  ✓ Directory exists: ${dir}`);
      existingCount++;
    } else {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  ✅ Created directory: ${dir}`);
        createdCount++;
      } catch (error) {
        console.log(`  ❌ Failed to create ${dir}: ${error.message}`);
      }
    }
  }

  console.log(`\n  Summary: ${createdCount} directories created, ${existingCount} already existed`);
  return true;
}

// Check if AI models are downloaded
async function checkModels() {
  console.log('\n  AI Models Information');
  console.log('  =====================');

  console.log(`\n  ${colors.cyan}Models will be downloaded automatically when starting dependencies.${colors.reset}`);
  console.log(`  ${colors.yellow}⏰ Model downloads may take 5-10 minutes on first start${colors.reset}`);

  console.log('\n  Required models:');
  console.log('    • Backend model:  unsloth/Qwen3-14B-GGUF:Q4_K_XL');
  console.log('    • Workers model:  unsloth/gemma-3-4b-it-qat-GGUF:Q4_K_XL');

  // Check if llama-server is available
  if (!commandExists('llama-server')) {
    console.log(`\n  ${colors.yellow}⚠️  llama-server not found - models cannot be used${colors.reset}`);
    console.log(`  ${colors.cyan}Install llama.cpp to enable AI models${colors.reset}`);
    return false;
  }

  console.log(`\n  ${colors.green}✅ llama-server found - models will download when PM2 starts${colors.reset}`);

  console.log('\n  To monitor model download progress:');
  console.log(`    ${colors.cyan}pm2 logs llama_backend --lines 100${colors.reset}  # Backend model`);
  console.log(`    ${colors.cyan}pm2 logs llama_workers --lines 100${colors.reset}  # Workers model`);

  console.log('\n  To manually download models (optional):');
  console.log(`    ${colors.cyan}llama-cli --hf-repo unsloth/Qwen3-14B-GGUF:Q4_K_XL -n 0 --no-warmup${colors.reset}`);
  console.log(`    ${colors.cyan}llama-cli --hf-repo unsloth/gemma-3-4b-it-qat-GGUF:Q4_K_XL -n 0 --no-warmup${colors.reset}`);

  return true;
}

// Install pnpm dependencies for all apps
async function installDependencies(env = 'dev') {
  console.log('\n  Installing pnpm dependencies...');

  const apps = ['apps/backend', 'apps/frontend'];
  let successCount = 0;
  let failedApps = [];

  for (const app of apps) {
    console.log(`  Installing dependencies for ${app}...`);

    const result = exec(`cd ${app} && pnpm install`, true);

    if (result.success) {
      console.log(`  ✅ ${app}: Dependencies installed`);
      successCount++;
    } else {
      console.log(`  ❌ ${app}: Failed to install dependencies`);
      console.log(`     Error: ${result.error}`);
      failedApps.push(app);
    }
  }

  if (failedApps.length > 0) {
    console.log(`\n  ${colors.red}❌ Failed to install dependencies for: ${failedApps.join(', ')}${colors.reset}`);
    console.log(`  ${colors.cyan}Try running manually: cd <app> && pnpm install${colors.reset}`);
    return false;
  }

  console.log(`\n  ${colors.green}✅ All dependencies installed successfully${colors.reset}`);

  // Install patchright browsers for backend (dev only - prod uses Docker with pre-installed browsers)
  if (env === 'dev') {
    console.log('\n  Installing Patchright browsers for backend...');
    const patchrightResult = exec('cd apps/backend && pnpm dlx patchright install chromium', true);

    if (patchrightResult.success) {
      console.log(`  ✅ Patchright browsers installed successfully`);
    } else {
      console.log(`  ${colors.yellow}⚠️  Patchright browser installation failed${colors.reset}`);
      console.log(`     ${colors.cyan}Run manually: cd apps/backend && pnpm dlx patchright install chromium${colors.reset}`);
      console.log(`     This is needed for web scraping functionality`);
    }
  }

  return true;
}

// Build containers for production
async function buildContainers() {
  console.log('\n  Building Docker containers...');

  const result = exec('./scripts/build.sh');

  if (!result.success) {
    console.log(`  ${colors.red}❌ Container build failed${colors.reset}`);
    console.log(`  ${colors.cyan}Try running manually: ./scripts/build.sh${colors.reset}`);
    return false;
  }

  console.log(`  ${colors.green}✅ Containers built successfully${colors.reset}`);
  return true;
}

// Start dependencies with PM2
async function startDependencies() {
  console.log('\n  Starting dependencies with PM2...');

  // Check if PM2 is installed
  if (!commandExists('pm2')) {
    console.log(`  ${colors.red}❌ PM2 is not installed${colors.reset}`);
    console.log(`  ${colors.cyan}Install with: pnpm add -g pm2${colors.reset}`);
    return false;
  }

  // Start dependencies
  const result = exec('pm2 start pm2.deps.config.js');

  if (!result.success) {
    console.log(`  ${colors.red}❌ Failed to start dependencies${colors.reset}`);
    return false;
  }

  console.log(`  ${colors.green}✅ Dependencies started${colors.reset}`);
  console.log(`  ${colors.cyan}Check logs with: pm2 logs --lines 50${colors.reset}`);

  // Wait a bit for services to initialize
  console.log('  Waiting for services to initialize...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  return true;
}

// Initialize database
async function initDatabase(env, questionFn) {
  console.log('\n  Checking if dependencies are running...');

  // Check if Postgres is accessible
  const pgCheck = exec('docker ps | grep eclaire-postgres', true);
  if (!pgCheck.success) {
    console.log(`  ${colors.yellow}⚠️  PostgreSQL is not running${colors.reset}`);
    console.log(`  ${colors.cyan}Start dependencies with: pm2 start pm2.deps.config.js${colors.reset}`);
    return false;
  }

  console.log('  ✓ PostgreSQL is running');

  if (env === 'prod') {
    // Production: Use containerized approach
    // Remove any existing containers (even if stopped)
    console.log('  Cleaning up any existing containers...');
    exec('docker compose down', true);

    // Check if old containers still exist
    const checkContainers = exec('docker ps -a --filter name=eclaire-backend --filter name=eclaire-frontend --format "{{.Names}}"', true);

    if (checkContainers.success && checkContainers.output && checkContainers.output.trim()) {
      const existingContainers = checkContainers.output.trim().split('\n');
      console.log(`\n  ${colors.yellow}⚠️  Found existing containers: ${existingContainers.join(', ')}${colors.reset}`);

      const answer = await questionFn('  Remove these containers? [y/N] ');

      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        console.log('  Removing old containers...');
        exec('docker rm -f ' + existingContainers.join(' '));
      } else {
        console.log(`  ${colors.red}❌ Cannot proceed with existing containers${colors.reset}`);
        return false;
      }
    }

    console.log('  Starting backend container for migrations...');
    console.log(`  ${colors.cyan}Note: Docker will pull images from GHCR if not available locally (may take a few minutes)${colors.reset}`);
    const startResult = exec('docker compose up -d backend');

    if (!startResult.success) {
      console.log(`  ${colors.red}❌ Failed to start backend container${colors.reset}`);
      return false;
    }

    // Wait a moment for container to fully start
    console.log('  Waiting for backend container to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Ensure database exists (POSTGRES_DB env var only works on first init)
    console.log('  Ensuring eclaire database exists...');
    const dbCheck = exec('docker exec eclaire-postgres psql -U eclaire -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname=\'eclaire\'"', true);

    if (!dbCheck.output || dbCheck.output.trim() !== '1') {
      console.log('  Creating eclaire database...');
      const createDb = exec('docker exec eclaire-postgres psql -U eclaire -d postgres -c "CREATE DATABASE eclaire;"');
      if (!createDb.success) {
        console.log(`  ${colors.red}❌ Failed to create database${colors.reset}`);
        exec('docker compose down');
        return false;
      }
    }

    // Run migrations
    console.log('  Running database migrations...');
    const migrateResult = exec('docker exec eclaire-backend pnpm db:migrate:apply:prod:force');

    if (!migrateResult.success) {
      console.log(`  ${colors.red}❌ Migration failed${colors.reset}`);
      // Stop container before returning
      exec('docker compose down');
      return false;
    }

    // Run seed
    const seedType = 'essential';
    console.log(`  Seeding database with ${seedType} data...`);

    // Capture output for production to extract API keys
    const seedResult = exec('docker exec -e GENERATE_SECURE_KEYS=true eclaire-backend pnpm db:seed:essential:prod', true);

    if (!seedResult.success) {
      console.log(`  ${colors.red}❌ Seeding failed${colors.reset}`);
      // Stop container before returning
      exec('docker compose down');
      return false;
    }

    console.log(`  ✅ Database seeded successfully`);

    // Stop backend container after migrations
    console.log('  Stopping backend container...');
    exec('docker compose down');

    // Extract API keys from seed output and update backend .env.prod
    const backendEnvPath = path.join(process.cwd(), 'apps/backend/.env.prod');
    console.log(`  🔑 Extracting API keys from seed output...`);

    const output = seedResult.output || '';
    const workerKeyMatch = output.match(/Worker API Key:\s*(sk-[\w-]+)/);
    const assistantKeyMatch = output.match(/AI Assistant API Key:\s*(sk-[\w-]+)/);

    if (workerKeyMatch && assistantKeyMatch) {
      const workerApiKey = workerKeyMatch[1];
      const assistantApiKey = assistantKeyMatch[1];

      try {
        let backendEnvContent = fs.readFileSync(backendEnvPath, 'utf-8');

        backendEnvContent = backendEnvContent.replace(
          /WORKER_API_KEY=$/m,
          `WORKER_API_KEY=${workerApiKey}`
        );
        backendEnvContent = backendEnvContent.replace(
          /AI_ASSISTANT_API_KEY=$/m,
          `AI_ASSISTANT_API_KEY=${assistantApiKey}`
        );

        fs.writeFileSync(backendEnvPath, backendEnvContent);
        console.log(`  ✅ Updated backend .env.prod with API keys`);
      } catch (error) {
        console.log(`  ${colors.yellow}⚠️  Could not update backend .env.prod with API keys${colors.reset}`);
        console.log(`  ${colors.cyan}Please manually add these keys to apps/backend/.env.prod:${colors.reset}`);
        console.log(`    WORKER_API_KEY=${workerApiKey}`);
        console.log(`    AI_ASSISTANT_API_KEY=${assistantApiKey}`);
      }
    } else {
      console.log(`  ${colors.yellow}⚠️  Could not extract API keys from seed output${colors.reset}`);
      console.log(`  ${colors.cyan}Please run 'docker exec eclaire-backend pnpm db:seed:essential:prod' manually${colors.reset}`);
      console.log(`  ${colors.cyan}and copy the API keys to apps/backend/.env.prod${colors.reset}`);
    }
  } else {
    // Development: Use host-based approach (existing logic)
    console.log('  Running database migrations...');
    const migrateScript = 'db:migrate:apply';
    const migrateResult = exec(`cd apps/backend && pnpm ${migrateScript}`);

    if (!migrateResult.success) {
      console.log(`  ${colors.red}❌ Migration failed${colors.reset}`);
      return false;
    }

    // Run seed
    const seedType = 'demo';
    const seedScript = `db:seed:${seedType}`;
    console.log(`  Seeding database with ${seedType} data...`);

    const seedCommand = `cd apps/backend && pnpm ${seedScript}`;
    const seedResult = exec(seedCommand);

    if (!seedResult.success) {
      console.log(`  ${colors.red}❌ Seeding failed${colors.reset}`);
      return false;
    }
  }

  console.log(`  ${colors.green}✅ Database initialized successfully${colors.reset}`);
  return true;
}

// Print setup summary
function printSummary(results, env, flags = {}) {
  console.log(`${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║              Setup Summary                   ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}`);

  console.log(`\nEnvironment: ${colors.green}${env}${colors.reset}`);
  console.log('\nSteps completed:');

  const steps = [
    { name: 'System dependencies', key: 'dependencies' },
    { name: 'Environment files', key: 'envFiles' },
    { name: 'Data directories', key: 'directories' },
    { name: 'AI models check', key: 'models' },
    { name: 'NPM dependencies', key: 'npmDependencies' },
    { name: 'Containers built', key: 'containersBuilt' },
    { name: 'Dependencies started', key: 'dependenciesStarted' },
    { name: 'Database initialized', key: 'database' }
  ];

  let hasFailures = false;
  let hasSuccesses = false;

  for (const step of steps) {
    const result = results[step.key];
    const failed = results[`${step.key}Failed`];

    let icon, status, statusText;

    if (failed) {
      icon = '❌';
      status = colors.red;
      statusText = 'Failed';
      hasFailures = true;
    } else if (result) {
      icon = '✅';
      status = colors.green;
      statusText = 'Complete';
      hasSuccesses = true;
    } else {
      icon = '⏭️';
      status = colors.yellow;
      statusText = 'Skipped';
    }

    console.log(`  ${icon} ${step.name}: ${status}${statusText}${colors.reset}`);
  }

  // Overall status
  if (hasFailures) {
    console.log(`\n${colors.red}⚠️  Setup completed with errors!${colors.reset}`);
    console.log(`${colors.yellow}Some steps failed. Please review the errors above and try again.${colors.reset}`);
  } else if (hasSuccesses) {
    console.log(`\n${colors.green}✨ Setup complete!${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}Setup completed (most steps were skipped)${colors.reset}`);
  }

  // Don't show next steps if there were failures
  if (hasFailures) {
    return;
  }

  console.log('\nNext steps:');

  if (!results.dependenciesStarted) {
    console.log(`  ⚠️  Dependencies were not started. You need to start them first:`);
    console.log(`     ${colors.cyan}pm2 start pm2.deps.config.js${colors.reset}`);
    console.log(`     ${colors.cyan}pm2 logs --lines 50${colors.reset}  # Check if models are downloading`);
    console.log('');
  }

  if (env === 'dev') {
    console.log(`  🚀 ${colors.green}Your development environment is ready!${colors.reset}`);
    console.log('');
    console.log(`  To start the application:`);
    console.log(`     ${colors.cyan}pnpm dev${colors.reset}`);
    console.log('');
    console.log(`  Access the app at:`);
    console.log(`     Frontend: ${colors.blue}http://localhost:3000${colors.reset}`);
    console.log(`     Backend:  ${colors.blue}http://localhost:3001/health${colors.reset}`);
    console.log('');
    console.log(`  Monitor dependencies:`);
    console.log(`     ${colors.cyan}pm2 logs --lines 50${colors.reset}`);
    console.log(`     ${colors.cyan}pm2 monit${colors.reset}  # Interactive monitor`);
    console.log('');
    console.log(`  Login credentials:`);
    console.log(`     Email:    ${colors.cyan}demo@example.com${colors.reset}`);
    console.log(`     Password: ${colors.cyan}Demo@123${colors.reset}`);
    console.log(`     Or create a new account at the frontend`);
  } else {
    console.log(`  🚀 ${colors.green}Your production environment is ready!${colors.reset}`);
    console.log('');

    if (flags.build && results.containersBuilt && !results.containersBuildFailed) {
      // Option C: Built Docker containers locally
      console.log(`  ${colors.yellow}Using locally-built Docker images${colors.reset}`);
      console.log('');
      console.log(`  To start the application:`);
      console.log(`     ${colors.cyan}docker compose -f docker-compose.yml -f docker-compose.local.yml up${colors.reset}`);
      console.log('');
      console.log(`  Note: docker-compose.local.yml was generated to use your local images`);
    } else {
      // Option A: Using official GHCR images
      console.log(`  ${colors.yellow}Using official GHCR images${colors.reset}`);
      console.log('');
      console.log(`  To start the application:`);
      console.log(`     ${colors.cyan}docker compose up${colors.reset}`);
      console.log('');
      console.log(`  Note: Docker will pull official images from ghcr.io/eclaire-labs`);
    }

    console.log('');
    console.log(`  Access the app at:`);
    console.log(`     Frontend: ${colors.blue}http://localhost:3000${colors.reset}`);
    console.log(`     Backend:  ${colors.blue}http://localhost:3001/health${colors.reset}`);
    console.log('');
    console.log(`  First-time setup:`);
    console.log(`     Create an account at the frontend`);
  }
}

module.exports = {
  checkDependencies,
  copyEnvFiles,
  createDataDirectories,
  checkModels,
  installDependencies,
  buildContainers,
  startDependencies,
  initDatabase,
  printSummary,
  colors,
  exec,
  commandExists,
  getVersion
};