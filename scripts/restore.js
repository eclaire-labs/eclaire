#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

// Project root directory
const PROJECT_ROOT = path.join(__dirname, '..');

// Create readline interface for user prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Find the most recent backup directory
function getMostRecentBackup() {
  const backupsDir = path.join(PROJECT_ROOT, 'backups');
  if (!fs.existsSync(backupsDir)) {
    return null;
  }

  const backupDirs = fs.readdirSync(backupsDir)
    .map(dir => ({
      name: dir,
      path: path.join(backupsDir, dir),
      mtime: fs.statSync(path.join(backupsDir, dir)).mtime
    }))
    .filter(item => fs.statSync(item.path).isDirectory())
    .sort((a, b) => b.mtime - a.mtime);

  return backupDirs.length > 0 ? backupDirs[0].path : null;
}

// Get file stats for comparison
function getFileStats(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stats = fs.statSync(filePath);
  return {
    size: stats.size,
    modified: stats.mtime.toISOString().split('T')[0] // Just the date part
  };
}

// Get directory stats
function getDirectoryStats(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { fileCount: 0, size: 0 };
  }

  try {
    const sizeResult = execSync(`du -sk "${dirPath}" | awk '{print $1 * 1024}'`, { encoding: 'utf-8' });
    const size = parseInt(sizeResult.trim());

    const countResult = execSync(`find "${dirPath}" -type f | wc -l`, { encoding: 'utf-8' });
    const fileCount = parseInt(countResult.trim());

    return { size, fileCount };
  } catch (error) {
    return { fileCount: 0, size: 0 };
  }
}

// Restore PostgreSQL database
async function restoreDatabase(backupDir, dryRun = false) {
  console.log(`${colors.bright}${colors.magenta}📦 Database Restoration${colors.reset}`);

  const dbBackupPath = path.join(backupDir, 'eclaire_backup.sql');

  if (!fs.existsSync(dbBackupPath)) {
    console.error(`${colors.red}✗${colors.reset} Database backup not found: ${path.basename(dbBackupPath)}`);
    return false;
  }

  if (dryRun) {
    console.log(`${colors.cyan}→${colors.reset} Would restore database from: ${path.basename(dbBackupPath)}`);
    return true;
  }

  try {
    // Get database connection info (same logic as backup script)
    let dbUrl = 'postgresql://eclaire:eclaire@localhost:5432/eclaire';
    const envPaths = [
      path.join(PROJECT_ROOT, '.env')
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/DATABASE_URL=(.+)/);
        if (match) {
          dbUrl = match[1].replace(/["']/g, '');
          break;
        }
      }
    }

    // Parse database URL
    const url = new URL(dbUrl);
    const dbName = url.pathname.slice(1);
    let host = url.hostname;
    const port = url.port || 5432;
    const username = url.username;
    const password = url.password;

    // Resolve Docker hostnames to localhost when running from host machine
    const dockerHosts = ['eclaire-postgres', 'eclaire-redis'];
    if (dockerHosts.includes(host)) {
      // Try to resolve the hostname, if it fails, we're likely on the host machine
      try {
        execSync(`nslookup ${host}`, { stdio: 'pipe' });
      } catch (error) {
        // Hostname doesn't resolve, use localhost instead
        host = 'localhost';
        console.log(`${colors.cyan}ℹ️${colors.reset}  Resolved Docker hostname ${url.hostname} to localhost`);
      }
    }

    // Set PGPASSWORD environment variable
    const env = { ...process.env };
    if (password) {
      env.PGPASSWORD = password;
    }

    console.log(`${colors.cyan}→${colors.reset} Restoring database: ${dbName}`);

    // First, terminate any active connections to the database
    try {
      execSync(`psql -h ${host} -p ${port} -U ${username} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();"`, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      // Ignore errors if there are no active connections or database doesn't exist
    }

    // Drop and recreate database - connect to postgres database to avoid "cannot drop currently open database" error
    execSync(`psql -h ${host} -p ${port} -U ${username} -d postgres -c "DROP DATABASE IF EXISTS ${dbName};"`, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    execSync(`psql -h ${host} -p ${port} -U ${username} -d postgres -c "CREATE DATABASE ${dbName};"`, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Restore from backup
    execSync(`psql -h ${host} -p ${port} -U ${username} -d ${dbName} -f "${dbBackupPath}"`, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    console.log(`${colors.green}✓${colors.reset} Database restored successfully`);
    return true;

  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Database restoration failed: ${error.message}`);
    return false;
  }
}

// Copy directory recursively
function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }

  // Remove destination if it exists
  if (fs.existsSync(dest)) {
    execSync(`rm -rf "${dest}"`);
  }

  // Ensure parent directory exists
  const destParent = path.dirname(dest);
  if (!fs.existsSync(destParent)) {
    fs.mkdirSync(destParent, { recursive: true });
  }

  // Copy the directory
  execSync(`cp -R "${src}" "${dest}"`);
  return true;
}

// Restore data/users directory
async function restoreDataUsers(backupDir, dryRun = false) {
  console.log(`\n${colors.bright}${colors.magenta}📁 Data Directory Restoration${colors.reset}`);

  const srcDir = path.join(backupDir, 'data/users');
  const destDir = path.join(PROJECT_ROOT, 'data/users');

  if (!fs.existsSync(srcDir)) {
    console.log(`${colors.yellow}⚠${colors.reset} No data/users directory found in backup`);
    return true;
  }

  const srcStats = getDirectoryStats(srcDir);
  const destStats = getDirectoryStats(destDir);

  console.log(`${colors.cyan}Source:${colors.reset} ${srcStats.fileCount} files (${(srcStats.size / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`${colors.cyan}Current:${colors.reset} ${destStats.fileCount} files (${(destStats.size / 1024 / 1024).toFixed(1)}MB)`);

  if (dryRun) {
    console.log(`${colors.cyan}→${colors.reset} Would restore data/users directory`);
    return true;
  }

  const answer = await askQuestion(`${colors.yellow}?${colors.reset} Restore data/users directory? This will replace ALL user data files (y/N): `);
  if (!answer.toLowerCase().startsWith('y')) {
    console.log(`${colors.yellow}↷${colors.reset} Skipped data/users restoration`);
    return true;
  }

  try {
    console.log(`${colors.cyan}→${colors.reset} Restoring data/users directory...`);
    copyDirectory(srcDir, destDir);
    console.log(`${colors.green}✓${colors.reset} data/users restored successfully`);
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Failed to restore data/users: ${error.message}`);
    return false;
  }
}

// Restore individual file with prompt
async function restoreFileWithPrompt(backupPath, destPath, filename, dryRun = false) {
  if (!fs.existsSync(backupPath)) {
    console.log(`${colors.yellow}⚠${colors.reset} ${filename}: Not found in backup`);
    return true;
  }

  const backupStats = getFileStats(backupPath);
  const currentStats = getFileStats(destPath);

  let statusText = '';
  if (!currentStats) {
    statusText = 'New file';
  } else if (backupStats.size !== currentStats.size || backupStats.modified !== currentStats.modified) {
    statusText = `Current: ${(currentStats.size / 1024).toFixed(1)}KB (${currentStats.modified}) → Backup: ${(backupStats.size / 1024).toFixed(1)}KB (${backupStats.modified})`;
  } else {
    statusText = 'No changes';
  }

  if (dryRun) {
    console.log(`${colors.cyan}→${colors.reset} ${filename}: ${statusText}`);
    return true;
  }

  if (currentStats && (backupStats.size !== currentStats.size || backupStats.modified !== currentStats.modified)) {
    console.log(`${colors.cyan}${filename}:${colors.reset} ${statusText}`);
    const answer = await askQuestion(`${colors.yellow}?${colors.reset} Restore this file? (y/N): `);
    if (!answer.toLowerCase().startsWith('y')) {
      console.log(`${colors.yellow}↷${colors.reset} Skipped ${filename}`);
      return true;
    }
  }

  try {
    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(backupPath, destPath);
    console.log(`${colors.green}✓${colors.reset} ${filename} restored`);
    return true;
  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Failed to restore ${filename}: ${error.message}`);
    return false;
  }
}

// Show what will be restored
function showRestorePreview(backupDir) {
  console.log(`${colors.bright}${colors.yellow}⚠️  RESTORE PREVIEW${colors.reset}`);

  // Show backup info
  const backupName = path.basename(backupDir);
  const isTimestamp = /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z/.test(backupName);

  if (isTimestamp) {
    // Parse timestamp
    const timestamp = backupName.replace(/T/, ' ').replace(/-/g, ':').replace('Z', '');
    const backupDate = new Date(backupName.replace(/-/g, ':').replace('T', 'T').replace('Z', 'Z'));
    console.log(`${colors.cyan}Backup:${colors.reset} ${backupName} (${backupDate.toLocaleString()})`);
  } else {
    console.log(`${colors.cyan}Backup:${colors.reset} ${backupName}`);
  }

  // Check if this is the most recent backup
  const mostRecentBackup = getMostRecentBackup();
  if (mostRecentBackup && path.basename(mostRecentBackup) === backupName) {
    console.log(`${colors.green}✓${colors.reset} This is the most recent backup`);
  } else if (mostRecentBackup) {
    const mostRecentName = path.basename(mostRecentBackup);
    console.log(`${colors.yellow}⚠${colors.reset} This is NOT the most recent backup (latest: ${mostRecentName})`);
  }

  console.log(`\n${colors.yellow}The following will be RESTORED (OVERWRITING current data):${colors.reset}\n`);

  // 1. Database
  console.log(`${colors.bright}${colors.magenta}1. PostgreSQL Database${colors.reset}`);
  const dbBackupPath = path.join(backupDir, 'eclaire_backup.sql');
  if (fs.existsSync(dbBackupPath)) {
    const stats = fs.statSync(dbBackupPath);
    console.log(`${colors.red}   ✗${colors.reset} eclaire database (will be DROPPED and recreated from backup: ${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
  } else {
    console.log(`${colors.yellow}   -${colors.reset} No database backup found`);
  }

  // 2. Data directories
  console.log(`\n${colors.bright}${colors.magenta}2. Data Directories${colors.reset}`);
  const dataDir = path.join(backupDir, 'data/users');
  const currentDataDir = path.join(PROJECT_ROOT, 'data/users');

  const backupStats = getDirectoryStats(dataDir);
  const currentStats = getDirectoryStats(currentDataDir);

  if (backupStats.fileCount > 0) {
    console.log(`${colors.red}   ✗${colors.reset} data/users/ directory will be REPLACED`);
    console.log(`${colors.cyan}     Current:${colors.reset} ${currentStats.fileCount} files (${(currentStats.size / 1024 / 1024).toFixed(1)}MB)`);
    console.log(`${colors.cyan}     Backup:${colors.reset} ${backupStats.fileCount} files (${(backupStats.size / 1024 / 1024).toFixed(1)}MB)`);
  } else {
    console.log(`${colors.yellow}   -${colors.reset} No data/users directory in backup`);
  }

  // 3. Configuration files
  console.log(`\n${colors.bright}${colors.magenta}3. Configuration Files${colors.reset}`);
  const configFiles = [
    'compose.yaml',
    'pm2.deps.config.js'
  ];
  const configDirs = [
    'config/ai'
  ];

  for (const configFile of configFiles) {
    const backupPath = path.join(backupDir, configFile);
    const currentPath = path.join(PROJECT_ROOT, configFile);

    if (fs.existsSync(backupPath)) {
      const backupStats = getFileStats(backupPath);
      const currentStats = getFileStats(currentPath);

      if (!currentStats) {
        console.log(`${colors.green}   ✓${colors.reset} ${configFile} (new file from backup)`);
      } else if (backupStats.size !== currentStats.size || backupStats.modified !== currentStats.modified) {
        console.log(`${colors.red}   ✗${colors.reset} ${configFile} will be OVERWRITTEN`);
        console.log(`${colors.cyan}     Current:${colors.reset} ${(currentStats.size / 1024).toFixed(1)}KB (${currentStats.modified})`);
        console.log(`${colors.cyan}     Backup:${colors.reset} ${(backupStats.size / 1024).toFixed(1)}KB (${backupStats.modified})`);
      } else {
        console.log(`${colors.yellow}   =${colors.reset} ${configFile} (no changes)`);
      }
    } else {
      console.log(`${colors.yellow}   -${colors.reset} ${configFile} (not in backup)`);
    }
  }

  for (const configDir of configDirs) {
    const backupPath = path.join(backupDir, configDir);
    const currentPath = path.join(PROJECT_ROOT, configDir);

    const backupStats = getDirectoryStats(backupPath);
    const currentStats = getDirectoryStats(currentPath);

    if (backupStats.fileCount > 0) {
      if (currentStats.fileCount === 0) {
        console.log(`${colors.green}   ✓${colors.reset} ${configDir}/ (new directory from backup, ${backupStats.fileCount} files)`);
      } else {
        console.log(`${colors.red}   ✗${colors.reset} ${configDir}/ directory will be REPLACED`);
        console.log(`${colors.cyan}     Current:${colors.reset} ${currentStats.fileCount} files (${(currentStats.size / 1024 / 1024).toFixed(1)}MB)`);
        console.log(`${colors.cyan}     Backup:${colors.reset} ${backupStats.fileCount} files (${(backupStats.size / 1024 / 1024).toFixed(1)}MB)`);
      }
    } else {
      console.log(`${colors.yellow}   -${colors.reset} ${configDir}/ (not in backup)`);
    }
  }

  // 4. Environment files
  console.log(`\n${colors.bright}${colors.magenta}4. Environment Files${colors.reset}`);
  const envFiles = [
    '.env'
  ];

  for (const envFile of envFiles) {
    const backupPath = path.join(backupDir, envFile);
    const currentPath = path.join(PROJECT_ROOT, envFile);

    if (fs.existsSync(backupPath)) {
      const backupStats = getFileStats(backupPath);
      const currentStats = getFileStats(currentPath);

      if (!currentStats) {
        console.log(`${colors.green}   ✓${colors.reset} ${envFile} (new file from backup)`);
      } else if (backupStats.size !== currentStats.size || backupStats.modified !== currentStats.modified) {
        console.log(`${colors.red}   ✗${colors.reset} ${envFile} will be OVERWRITTEN`);
      } else {
        console.log(`${colors.yellow}   =${colors.reset} ${envFile} (no changes)`);
      }
    } else {
      console.log(`${colors.yellow}   -${colors.reset} ${envFile} (not in backup)`);
    }
  }

  console.log(`\n${colors.bright}${colors.red}⚠️  WARNING: This will permanently overwrite current data!${colors.reset}`);
}

// Main restore function
async function restoreBackup(backupDir, options = {}) {
  const { dryRun = false } = options;

  console.log(`${colors.bright}${colors.cyan}🔄 Restoring Eclaire System${colors.reset}`);
  console.log(`Backup Directory: ${colors.yellow}${path.relative(PROJECT_ROOT, backupDir)}${colors.reset}`);

  if (dryRun) {
    console.log(`${colors.bright}${colors.blue}🔍 DRY RUN MODE - No changes will be made${colors.reset}`);
  }
  console.log('');

  // Show what will be restored
  showRestorePreview(backupDir);
  console.log('');

  // First confirmation
  if (!dryRun) {
    const proceed = await askQuestion(`${colors.bright}${colors.yellow}Do you want to proceed with this restoration? (y/N): ${colors.reset}`);
    if (!proceed.toLowerCase().startsWith('y')) {
      console.log(`${colors.yellow}Restoration cancelled${colors.reset}`);
      return false;
    }

    // Second confirmation - require exact text
    console.log(`\n${colors.bright}${colors.red}⚠️  FINAL WARNING ⚠️${colors.reset}`);
    console.log(`${colors.red}This will PERMANENTLY OVERWRITE current data with backup data!${colors.reset}`);
    const confirmation = await askQuestion(`${colors.bright}Type "I AGREE" to confirm restoration: ${colors.reset}`);

    if (confirmation !== 'I AGREE') {
      console.log(`${colors.yellow}Restoration cancelled (confirmation text did not match)${colors.reset}`);
      return false;
    }
  }

  console.log(`\n${colors.bright}${colors.cyan}🚀 Starting restoration process...${colors.reset}\n`);

  let successCount = 0;
  let totalOperations = 0;

  // 1. Restore database
  totalOperations++;
  if (await restoreDatabase(backupDir, dryRun)) {
    successCount++;
  } else {
    console.error(`${colors.red}💥 Database restoration failed - aborting restore process${colors.reset}`);
    rl.close();
    return false;
  }

  // 2. Restore data/users
  totalOperations++;
  if (await restoreDataUsers(backupDir, dryRun)) {
    successCount++;
  } else {
    console.error(`${colors.red}💥 Data/users restoration failed - aborting restore process${colors.reset}`);
    rl.close();
    return false;
  }

  // 3. Restore configuration files
  console.log(`\n${colors.bright}${colors.magenta}⚙️ Configuration Files${colors.reset}`);
  const configFiles = [
    { src: 'compose.yaml', dest: 'compose.yaml' },
    { src: 'pm2.deps.config.js', dest: 'pm2.deps.config.js' }
  ];

  for (const { src, dest } of configFiles) {
    totalOperations++;
    const backupPath = path.join(backupDir, src);
    const destPath = path.join(PROJECT_ROOT, dest);
    const filename = path.basename(src);

    if (await restoreFileWithPrompt(backupPath, destPath, filename, dryRun)) {
      successCount++;
    } else {
      console.error(`${colors.red}💥 Configuration file restoration failed - aborting restore process${colors.reset}`);
      rl.close();
      return false;
    }
  }

  // Restore config directories
  const configDirs = [
    { src: 'config/ai', dest: 'config/ai' }
  ];

  for (const { src, dest } of configDirs) {
    totalOperations++;
    const backupPath = path.join(backupDir, src);
    const destPath = path.join(PROJECT_ROOT, dest);

    if (!fs.existsSync(backupPath)) {
      console.log(`${colors.yellow}⚠${colors.reset} ${src}/: Not found in backup`);
      successCount++;
      continue;
    }

    const backupStats = getDirectoryStats(backupPath);
    const currentStats = getDirectoryStats(destPath);

    if (dryRun) {
      console.log(`${colors.cyan}→${colors.reset} Would restore ${src}/ (${backupStats.fileCount} files)`);
      successCount++;
      continue;
    }

    if (currentStats.fileCount > 0) {
      console.log(`${colors.cyan}${src}/:${colors.reset} Current: ${currentStats.fileCount} files → Backup: ${backupStats.fileCount} files`);
      const answer = await askQuestion(`${colors.yellow}?${colors.reset} Restore this directory? (y/N): `);
      if (!answer.toLowerCase().startsWith('y')) {
        console.log(`${colors.yellow}↷${colors.reset} Skipped ${src}/`);
        successCount++;
        continue;
      }
    }

    try {
      copyDirectory(backupPath, destPath);
      console.log(`${colors.green}✓${colors.reset} ${src}/ restored`);
      successCount++;
    } catch (error) {
      console.error(`${colors.red}✗${colors.reset} Failed to restore ${src}/: ${error.message}`);
      rl.close();
      return false;
    }
  }

  // 4. Restore environment files
  console.log(`\n${colors.bright}${colors.magenta}🔐 Environment Files${colors.reset}`);
  const envFiles = [
    { src: '.env', dest: '.env' }
  ];

  for (const { src, dest } of envFiles) {
    totalOperations++;
    const backupPath = path.join(backupDir, src);
    const destPath = path.join(PROJECT_ROOT, dest);
    const filename = src;

    if (await restoreFileWithPrompt(backupPath, destPath, filename, dryRun)) {
      successCount++;
    } else {
      console.error(`${colors.red}💥 Environment file restoration failed - aborting restore process${colors.reset}`);
      rl.close();
      return false;
    }
  }

  // Summary
  console.log(`\n${colors.bright}${colors.cyan}📊 Restoration Summary${colors.reset}`);
  if (dryRun) {
    console.log(`${colors.blue}🔍 Dry run completed - no changes were made${colors.reset}`);
  } else if (successCount === totalOperations) {
    console.log(`${colors.bright}${colors.green}✅ Restoration completed successfully!${colors.reset}`);
    console.log(`${colors.green}${successCount}/${totalOperations}${colors.reset} operations successful`);
  } else {
    console.log(`${colors.bright}${colors.yellow}⚠️  Restoration completed with some issues${colors.reset}`);
    console.log(`${colors.yellow}${successCount}/${totalOperations}${colors.reset} operations successful`);
  }
}

module.exports = { restoreBackup, getMostRecentBackup };

// CLI execution
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const showHelp = args.includes('--help') || args.includes('-h');
  const dryRun = args.includes('--dry-run');
  const latest = args.includes('--latest');

  const backupIndex = args.indexOf('--backup');
  const backupPath = backupIndex !== -1 ? args[backupIndex + 1] : null;

  if (showHelp) {
    console.log(`${colors.bright}Eclaire Restore Script${colors.reset}`);
    console.log('');
    console.log('Restores the Eclaire system from a backup including:');
    console.log('  • PostgreSQL database');
    console.log('  • Data/users directory');
    console.log('  • Configuration files');
    console.log('  • Environment files');
    console.log('');
    console.log('Usage: node scripts/restore.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  -h, --help            Show this help message');
    console.log('  --backup <path>       Restore from specific backup directory');
    console.log('  --latest              Restore from the most recent backup');
    console.log('  --dry-run             Preview what would be restored without making changes');
    console.log('');
    console.log(`${colors.yellow}⚠️  Warning: This will overwrite current data!${colors.reset}`);
    rl.close();
    process.exit(0);
  }

  (async () => {
    try {
      let targetBackup = null;

      if (backupPath) {
        targetBackup = path.resolve(backupPath);
        if (!fs.existsSync(targetBackup)) {
          console.error(`${colors.red}❌ Backup directory not found: ${targetBackup}${colors.reset}`);
          rl.close();
          process.exit(1);
        }
      } else if (latest) {
        targetBackup = getMostRecentBackup();
        if (!targetBackup) {
          console.error(`${colors.red}❌ No backups found in backups/ directory${colors.reset}`);
          rl.close();
          process.exit(1);
        }
      } else {
        // Default to latest backup when no arguments provided
        targetBackup = getMostRecentBackup();
        if (!targetBackup) {
          console.error(`${colors.red}❌ No backups found in backups/ directory${colors.reset}`);
          rl.close();
          process.exit(1);
        }
      }

      await restoreBackup(targetBackup, { dryRun });
      rl.close();

    } catch (error) {
      console.error(`${colors.red}💥 Restoration failed: ${error.message}${colors.reset}`);
      rl.close();
      process.exit(1);
    }
  })();
}