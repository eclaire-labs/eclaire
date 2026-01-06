const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

// Arrow key selection menu
async function selectFromList(prompt, options, defaultIndex = 0) {
  return new Promise((resolve) => {
    let selectedIndex = defaultIndex;

    const renderMenu = () => {
      // Move cursor up to overwrite previous menu
      if (selectedIndex !== defaultIndex || options.length > 0) {
        process.stdout.write(`\x1b[${options.length}A`);
      }

      options.forEach((option, index) => {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? `${colors.cyan}❯${colors.reset}` : ' ';
        const text = isSelected ? `${colors.cyan}${option.label}${colors.reset}` : option.label;
        const desc = option.description ? ` ${colors.yellow}(${option.description})${colors.reset}` : '';
        console.log(`  ${prefix} ${text}${desc}`);
      });
    };

    console.log(prompt);
    options.forEach((option, index) => {
      const isSelected = index === selectedIndex;
      const prefix = isSelected ? `${colors.cyan}❯${colors.reset}` : ' ';
      const text = isSelected ? `${colors.cyan}${option.label}${colors.reset}` : option.label;
      const desc = option.description ? ` ${colors.yellow}(${option.description})${colors.reset}` : '';
      console.log(`  ${prefix} ${text}${desc}`);
    });

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const onKeypress = (str, key) => {
      if (key.name === 'up') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
        renderMenu();
      } else if (key.name === 'down') {
        selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
        renderMenu();
      } else if (key.name === 'return') {
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        resolve(options[selectedIndex]);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.exit(0);
      }
    };

    process.stdin.on('keypress', onKeypress);
    process.stdin.resume();
  });
}

// Choose database type with arrow key selection
async function chooseDatabaseType() {
  console.log(`\n  ${colors.cyan}Database Configuration${colors.reset}`);

  const options = [
    { label: 'PostgreSQL', value: 'postgres', description: 'default, requires Docker' },
    { label: 'SQLite', value: 'sqlite', description: 'simpler, no external DB' }
  ];

  const selected = await selectFromList('\n  Use arrow keys to select, Enter to confirm:', options, 0);
  console.log(`\n  → Selected: ${colors.green}${selected.label}${colors.reset}`);

  return selected.value;
}

// Configure database in .env file
async function configureDatabaseInEnv(databaseType, questionFn) {
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    console.log(`  ${colors.yellow}⚠️  .env file not found, skipping database configuration${colors.reset}`);
    return;
  }

  let content = fs.readFileSync(envPath, 'utf-8');

  if (databaseType === 'postgres') {
    // Set DATABASE_TYPE=postgres (handles commented or any existing value)
    content = content.replace(
      /^#?DATABASE_TYPE=\w*$/m,
      'DATABASE_TYPE=postgres'
    );
    fs.writeFileSync(envPath, content);
    console.log(`  ✅ Configured DATABASE_TYPE=postgres in .env`);

    // Offer to start PostgreSQL via Docker Compose
    console.log(`\n  ${colors.cyan}PostgreSQL Setup${colors.reset}`);
    console.log(`  PostgreSQL can be started via Docker Compose.`);
    const startPg = await questionFn(`\n  Start PostgreSQL with Docker Compose? [Y/n]: `);
    if (startPg.toLowerCase() !== 'n' && startPg.toLowerCase() !== 'no') {
      console.log(`\n  Starting PostgreSQL and Docling via Docker Compose...`);
      // Use compose.dev.yaml overlay to expose Postgres port to host
      const result = exec('docker compose -f compose.yaml -f compose.dev.yaml up postgres docling -d', true);
      if (result.success) {
        console.log(`  ${colors.green}✅ PostgreSQL and Docling started${colors.reset}`);
        console.log(`  ${colors.cyan}Check status with: docker compose ps${colors.reset}`);
      } else {
        console.log(`  ${colors.red}❌ Failed to start Docker Compose${colors.reset}`);
        console.log(`  ${colors.cyan}Try manually: docker compose -f compose.yaml -f compose.dev.yaml up postgres docling -d${colors.reset}`);
      }
    } else {
      console.log(`  ${colors.yellow}Skipping Docker Compose startup${colors.reset}`);
      console.log(`  ${colors.cyan}Start manually: docker compose -f compose.yaml -f compose.dev.yaml up postgres docling -d${colors.reset}`);
    }
  } else {
    // Set DATABASE_TYPE=sqlite (handles commented or any existing value)
    content = content.replace(
      /^#?DATABASE_TYPE=\w*$/m,
      'DATABASE_TYPE=sqlite'
    );
    // Also set QUEUE_BACKEND=sqlite for consistency (SQLite queue requires SQLite database)
    content = content.replace(
      /^#?QUEUE_BACKEND=\w*$/m,
      'QUEUE_BACKEND=sqlite'
    );
    fs.writeFileSync(envPath, content);
    console.log(`  ✅ Configured DATABASE_TYPE=sqlite and QUEUE_BACKEND=sqlite in .env`);
  }
}

// Generate secure random values
function generateSecureValue(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
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
async function checkDependencies() {
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
      minBuild: 7610,
      check: () => {
        if (!commandExists('llama-server')) {
          return { exists: false, version: 'not installed' };
        }
        try {
          // Get full output since version may not be on first line (GPU init messages appear first)
          const output = execSync('llama-server --version 2>&1', { encoding: 'utf-8', stdio: 'pipe' });
          const match = output.match(/version:\s*(\d+)/);
          const buildNumber = match ? parseInt(match[1], 10) : null;
          return {
            exists: true,
            version: buildNumber ? `build ${buildNumber}` : 'unknown',
            buildNumber
          };
        } catch {
          return { exists: true, version: 'unknown', buildNumber: null };
        }
      }
    },
    {
      name: 'docling-serve',
      command: 'docling-serve',
      optional: true,
      check: () => ({
        exists: commandExists('docling-serve'),
        version: commandExists('docling-serve') ? 'installed' : 'not installed'
      })
    },
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
  ];

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

    // Check llama.cpp minimum build version
    if (dep.minBuild && result.exists) {
      if (result.buildNumber && result.buildNumber < dep.minBuild) {
        console.log(`     ${colors.yellow}Warning: build ${result.buildNumber} is older than recommended ${dep.minBuild}${colors.reset}`);
        console.log(`     ${colors.cyan}Update llama.cpp for full compatibility${colors.reset}`);
      } else if (!result.buildNumber) {
        console.log(`     ${colors.yellow}Warning: could not determine build number${colors.reset}`);
      }
    }
  }

  if (!allGood) {
    throw new Error('Missing required dependencies. Please install them and try again.');
  }

  return true;
}

// Copy environment files
async function copyEnvFiles(force = false) {
  const filesToCopy = [
    {
      source: '.env.example',
      dest: '.env',
      generateSecrets: true
    },
    {
      source: 'config/ai/models.json.example',
      dest: 'config/ai/models.json'
    },
    {
      source: 'config/ai/providers.json.example',
      dest: 'config/ai/providers.json'
    },
    {
      source: 'config/ai/selection.json.example',
      dest: 'config/ai/selection.json'
    }
  ];

  let copiedCount = 0;
  let skippedCount = 0;

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

      // Generate secure values for .env
      if (file.generateSecrets) {
        console.log(`  🔐 Generating secure values...`);

        const betterAuthSecret = generateSecureValue(32);
        const masterEncryptionKey = generateSecureValue(32);
        const apiKeyHmacSecret = generateSecureValue(32);

        content = content.replace(
          /^BETTER_AUTH_SECRET=$/m,
          `BETTER_AUTH_SECRET=${betterAuthSecret}`
        );
        content = content.replace(
          /^MASTER_ENCRYPTION_KEY=$/m,
          `MASTER_ENCRYPTION_KEY=${masterEncryptionKey}`
        );
        content = content.replace(
          /^API_KEY_HMAC_KEY_V1=$/m,
          `API_KEY_HMAC_KEY_V1=${apiKeyHmacSecret}`
        );

        console.log(`  ✅ Generated BETTER_AUTH_SECRET`);
        console.log(`  ✅ Generated MASTER_ENCRYPTION_KEY`);
        console.log(`  ✅ Generated API_KEY_HMAC_KEY_V1`);
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
    'data/postgres',
    'data/pglite',
    'data/sqlite',
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

  console.log(`\n  ${colors.green}✅ llama-server found${colors.reset}`);

  console.log('\n  To start LLM servers (in separate terminals):');
  console.log(`    ${colors.cyan}llama-server -hf unsloth/Qwen3-14B-GGUF:Q4_K_XL --ctx-size 16384 --port 11500${colors.reset}`);
  console.log(`    ${colors.cyan}llama-server -hf unsloth/gemma-3-4b-it-qat-GGUF:Q4_K_XL --ctx-size 16384 --port 11501${colors.reset}`);
  console.log(`    ${colors.yellow}(Models download automatically on first run)${colors.reset}`);

  return true;
}

// Install pnpm dependencies from monorepo root
async function installDependencies() {
  console.log('\n  Installing pnpm dependencies from monorepo root...');

  const result = exec('pnpm install', true);

  if (!result.success) {
    console.log(`\n  ${colors.red}❌ Failed to install dependencies${colors.reset}`);
    console.log(`     Error: ${result.error}`);
    console.log(`  ${colors.cyan}Try running manually: pnpm install${colors.reset}`);
    return false;
  }

  console.log(`\n  ${colors.green}✅ All dependencies installed successfully${colors.reset}`);

  // Install patchright browsers for backend
  console.log('\n  Installing Patchright browsers for backend...');
  const patchrightResult = exec('cd apps/backend && pnpm dlx patchright install chromium', true);

  if (patchrightResult.success) {
    console.log(`  ✅ Patchright browsers installed successfully`);
  } else {
    console.log(`  ${colors.yellow}⚠️  Patchright browser installation failed${colors.reset}`);
    console.log(`     ${colors.cyan}Run manually: cd apps/backend && pnpm dlx patchright install chromium${colors.reset}`);
    console.log(`     This is needed for web scraping functionality`);
  }

  return true;
}

// Initialize database
async function initDatabase(databaseType = 'postgres') {
  // For PostgreSQL, check if it's running
  if (databaseType === 'postgres') {
    console.log('\n  Checking if PostgreSQL is running...');

    const pgCheck = exec('docker ps | grep eclaire-postgres', true);
    if (!pgCheck.success) {
      console.log(`  ${colors.yellow}⚠️  PostgreSQL is not running${colors.reset}`);
      console.log(`  ${colors.cyan}Start with: docker compose -f compose.yaml -f compose.dev.yaml up postgres -d${colors.reset}`);
      return false;
    }

    console.log('  ✓ PostgreSQL is running');
  } else {
    console.log('\n  Using SQLite database (no external dependencies needed)');
  }

  // Run app:upgrade which handles migrations AND sets installed_version
  console.log('  Running database upgrade (migrations + version)...');
  const upgradeResult = exec('pnpm app:upgrade');

  if (!upgradeResult.success) {
    console.log(`  ${colors.red}❌ Upgrade failed${colors.reset}`);
    return false;
  }

  console.log(`  ${colors.green}✅ Database initialized successfully${colors.reset}`);
  return true;
}

// Seed demo data (only for PostgreSQL)
async function seedDemoData() {
  console.log('  Running demo data seed...');
  const seedResult = exec('pnpm --filter @eclaire/backend db:seed:demo');

  if (!seedResult.success) {
    console.log(`  ${colors.red}❌ Demo seeding failed${colors.reset}`);
    return false;
  }

  console.log(`  ${colors.green}✅ Demo data seeded successfully${colors.reset}`);
  return true;
}

// Print setup summary
function printSummary(results) {
  console.log(`${colors.cyan}╔══════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║              Setup Summary                   ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════════╝${colors.reset}`);

  console.log(`\nEnvironment: ${colors.green}development${colors.reset}`);
  console.log('\nSteps completed:');

  const steps = [
    { name: 'System dependencies', key: 'dependencies' },
    { name: 'Environment files', key: 'envFiles' },
    { name: 'Data directories', key: 'directories' },
    { name: 'AI models check', key: 'models' },
    { name: 'NPM dependencies', key: 'npmDependencies' },
    { name: 'Database initialized', key: 'database' },
    { name: 'Demo data seeded', key: 'demoSeed' }
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
  console.log(`  🚀 ${colors.green}Your development environment is ready!${colors.reset}`);
  console.log('');
  console.log(`  To start the application:`);
  console.log(`     ${colors.cyan}pnpm dev${colors.reset}`);
  console.log('');
  console.log(`  Access the app at:`);
  console.log(`     Frontend: ${colors.blue}http://localhost:3000${colors.reset}`);
  console.log(`     Backend:  ${colors.blue}http://localhost:3001/health${colors.reset}`);
  console.log('');
  console.log(`  Create an account at the frontend to get started.`);
  console.log('');
  console.log(`  For AI model configuration:`);
  console.log(`     ${colors.cyan}docs/ai-models.md${colors.reset}`);
  console.log('');
}

module.exports = {
  checkDependencies,
  copyEnvFiles,
  chooseDatabaseType,
  configureDatabaseInEnv,
  createDataDirectories,
  checkModels,
  installDependencies,
  initDatabase,
  seedDemoData,
  printSummary,
  colors,
  exec,
  commandExists,
  getVersion
};
