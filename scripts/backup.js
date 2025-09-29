#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

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

// Generate ISO timestamp with seconds
function getTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').split('.')[0] + 'Z';
}

// Create directory if it doesn't exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

// Copy file preserving directory structure
function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  ensureDir(destDir);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`${colors.green}✓${colors.reset} Copied: ${path.relative(PROJECT_ROOT, src)}`);
    return true;
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} Not found: ${path.relative(PROJECT_ROOT, src)}`);
    return false;
  }
}

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`${colors.yellow}⚠${colors.reset} Directory not found: ${path.relative(PROJECT_ROOT, src)}`);
    return false;
  }

  ensureDir(dest);
  const items = fs.readdirSync(src);

  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(`${colors.green}✓${colors.reset} Copied directory: ${path.relative(PROJECT_ROOT, src)}`);
  return true;
}

// Backup PostgreSQL database
function backupDatabase(backupDir) {
  console.log(`${colors.blue}📦${colors.reset} Creating database backup...`);

  const dbBackupPath = path.join(backupDir, 'eclaire_backup.sql');

  try {
    // Try to read database URL from .env files
    let dbUrl = 'postgresql://eclaire:eclaire@localhost:5432/eclaire';

    const envPaths = [
      path.join(PROJECT_ROOT, 'apps/backend/.env.dev'),
      path.join(PROJECT_ROOT, 'apps/backend/.env.prod')
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

    // Create pg_dump command
    const pgDumpCmd = [
      'pg_dump',
      '-h', host,
      '-p', port.toString(),
      '-U', username,
      '-d', dbName,
      '--verbose',
      '--no-password',
      '-f', dbBackupPath
    ];

    console.log(`${colors.cyan}→${colors.reset} Running: pg_dump -h ${host} -p ${port} -U ${username} -d ${dbName}`);

    execSync(pgDumpCmd.join(' '), {
      env,
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: PROJECT_ROOT
    });

    console.log(`${colors.green}✓${colors.reset} Database backup created: ${path.basename(dbBackupPath)}`);
    return true;

  } catch (error) {
    console.error(`${colors.red}✗${colors.reset} Database backup failed: ${error.message}`);
    return false;
  }
}

// Show what will be backed up
function showBackupPreview() {
  console.log(`${colors.bright}${colors.blue}📦 BACKUP PREVIEW${colors.reset}`);
  console.log(`${colors.blue}The following will be BACKED UP:${colors.reset}\n`);

  // 1. Database
  console.log(`${colors.bright}${colors.magenta}1. PostgreSQL Database${colors.reset}`);
  console.log(`${colors.green}   ✓${colors.reset} eclaire database (SQL dump)`);

  // 2. Data directories
  console.log(`\n${colors.bright}${colors.magenta}2. Data Directories${colors.reset}`);
  const dataDirs = [
    { name: 'data/db', path: path.join(PROJECT_ROOT, 'data/db') },
    { name: 'data/users', path: path.join(PROJECT_ROOT, 'data/users') }
  ];

  for (const { name, path: dirPath } of dataDirs) {
    const stats = getDirectoryStats(dirPath);
    if (stats.fileCount > 0) {
      console.log(`${colors.green}   ✓${colors.reset} ${name}/ (${stats.fileCount} files, ${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    } else {
      console.log(`${colors.yellow}   -${colors.reset} ${name}/ (empty or not found)`);
    }
  }

  // 3. Configuration files
  console.log(`\n${colors.bright}${colors.magenta}3. Configuration Files${colors.reset}`);
  const configFiles = [
    'config/models.json',
    'docker-compose.yml',
    'pm2.deps.config.js',
    'versions.json'
  ];

  for (const configFile of configFiles) {
    const configPath = path.join(PROJECT_ROOT, configFile);
    if (fs.existsSync(configPath)) {
      const size = fs.statSync(configPath).size;
      console.log(`${colors.green}   ✓${colors.reset} ${configFile} (${size} bytes)`);
    } else {
      console.log(`${colors.yellow}   -${colors.reset} ${configFile} (not found)`);
    }
  }

  // 4. Environment files
  console.log(`\n${colors.bright}${colors.magenta}4. Environment Files${colors.reset}`);
  const envFiles = [
    'apps/frontend/.env.dev',
    'apps/frontend/.env.prod',
    'apps/backend/.env.dev',
    'apps/backend/.env.prod',
    'apps/workers/.env.dev',
    'apps/workers/.env.prod'
  ];

  for (const envFile of envFiles) {
    const envPath = path.join(PROJECT_ROOT, envFile);
    if (fs.existsSync(envPath)) {
      const size = fs.statSync(envPath).size;
      console.log(`${colors.green}   ✓${colors.reset} ${envFile} (${size} bytes)`);
    } else {
      console.log(`${colors.yellow}   -${colors.reset} ${envFile} (not found)`);
    }
  }

  console.log(`\n${colors.bright}${colors.cyan}Backup will be saved to:${colors.reset} ${colors.yellow}backups/<ISO_TIMESTAMP>${colors.reset}`);
}

// Main backup function
async function createBackup() {
  console.log(`${colors.bright}${colors.cyan}🚀 Eclaire System Backup${colors.reset}`);
  console.log('');

  // Show what will be backed up
  showBackupPreview();
  console.log('');

  // Ask for confirmation
  const proceed = await askQuestion(`${colors.bright}${colors.blue}Do you want to proceed with this backup? (y/N): ${colors.reset}`);
  if (!proceed.toLowerCase().startsWith('y')) {
    console.log(`${colors.yellow}Backup cancelled${colors.reset}`);
    return false;
  }

  console.log(`\n${colors.bright}${colors.cyan}🚀 Starting backup process...${colors.reset}\n`);

  // Create backup directory
  const timestamp = getTimestamp();
  const backupDir = path.join(PROJECT_ROOT, 'backups', timestamp);

  console.log(`${colors.blue}📁${colors.reset} Creating backup directory: backups/${timestamp}`);
  ensureDir(backupDir);

  let totalFiles = 0;
  let successCount = 0;

  // 1. Backup database
  console.log(`\n${colors.bright}${colors.magenta}1. Database Backup${colors.reset}`);
  if (backupDatabase(backupDir)) {
    successCount++;
  }
  totalFiles++;

  // 2. Backup data directories
  console.log(`\n${colors.bright}${colors.magenta}2. Data Directories${colors.reset}`);
  const dataDirs = [
    { src: path.join(PROJECT_ROOT, 'data/db'), dest: path.join(backupDir, 'data/db') },
    { src: path.join(PROJECT_ROOT, 'data/users'), dest: path.join(backupDir, 'data/users') }
  ];

  for (const { src, dest } of dataDirs) {
    if (copyDir(src, dest)) {
      successCount++;
    }
    totalFiles++;
  }

  // 3. Backup configuration files
  console.log(`\n${colors.bright}${colors.magenta}3. Configuration Files${colors.reset}`);
  const configFiles = [
    { src: path.join(PROJECT_ROOT, 'config/models.json'), dest: path.join(backupDir, 'config/models.json') },
    { src: path.join(PROJECT_ROOT, 'docker-compose.yml'), dest: path.join(backupDir, 'docker-compose.yml') },
    { src: path.join(PROJECT_ROOT, 'pm2.deps.config.js'), dest: path.join(backupDir, 'pm2.deps.config.js') },
    { src: path.join(PROJECT_ROOT, 'versions.json'), dest: path.join(backupDir, 'versions.json') }
  ];

  for (const { src, dest } of configFiles) {
    if (copyFile(src, dest)) {
      successCount++;
    }
    totalFiles++;
  }

  // 4. Backup environment files
  console.log(`\n${colors.bright}${colors.magenta}4. Environment Files${colors.reset}`);
  const envFiles = [
    { src: path.join(PROJECT_ROOT, 'apps/frontend/.env.dev'), dest: path.join(backupDir, 'apps/frontend/.env.dev') },
    { src: path.join(PROJECT_ROOT, 'apps/frontend/.env.prod'), dest: path.join(backupDir, 'apps/frontend/.env.prod') },
    { src: path.join(PROJECT_ROOT, 'apps/backend/.env.dev'), dest: path.join(backupDir, 'apps/backend/.env.dev') },
    { src: path.join(PROJECT_ROOT, 'apps/backend/.env.prod'), dest: path.join(backupDir, 'apps/backend/.env.prod') },
    { src: path.join(PROJECT_ROOT, 'apps/workers/.env.dev'), dest: path.join(backupDir, 'apps/workers/.env.dev') },
    { src: path.join(PROJECT_ROOT, 'apps/workers/.env.prod'), dest: path.join(backupDir, 'apps/workers/.env.prod') }
  ];

  for (const { src, dest } of envFiles) {
    if (copyFile(src, dest)) {
      successCount++;
    }
    totalFiles++;
  }

  // Summary
  console.log(`\n${colors.bright}${colors.cyan}📊 Backup Summary${colors.reset}`);
  console.log(`Backup Location: ${colors.yellow}backups/${timestamp}${colors.reset}`);
  console.log(`Files/Directories: ${colors.green}${successCount}/${totalFiles} successful${colors.reset}`);

  // Calculate backup size
  try {
    const result = execSync(`du -sh "${backupDir}"`, { encoding: 'utf-8' });
    const size = result.split('\t')[0];
    console.log(`Backup Size: ${colors.cyan}${size}${colors.reset}`);
  } catch (error) {
    // Ignore size calculation errors
  }

  if (successCount === totalFiles) {
    console.log(`\n${colors.bright}${colors.green}✅ Backup completed successfully!${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.yellow}⚠️  Backup completed with warnings${colors.reset}`);
    console.log(`${totalFiles - successCount} items could not be backed up`);
  }

  console.log(`\n${colors.cyan}💡 To restore this backup, extract all files back to their original locations.${colors.reset}`);
}

// Generate file checksum
function getFileChecksum(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Get directory size and file count
function getDirectoryStats(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { size: 0, fileCount: 0 };
  }

  try {
    const sizeResult = execSync(`du -sk "${dirPath}" | awk '{print $1 * 1024}'`, { encoding: 'utf-8' });
    const size = parseInt(sizeResult.trim());

    const countResult = execSync(`find "${dirPath}" -type f | wc -l`, { encoding: 'utf-8' });
    const fileCount = parseInt(countResult.trim());

    return { size, fileCount };
  } catch (error) {
    console.error(`${colors.yellow}⚠${colors.reset} Could not get stats for ${dirPath}: ${error.message}`);
    return { size: 0, fileCount: 0 };
  }
}

// Validate PostgreSQL backup
function validateDatabase(backupPath, dbConfig) {
  console.log(`${colors.blue}🔍${colors.reset} Validating database backup...`);

  const tempDbName = 'eclaire_validate_temp';
  const { host, port, username, password } = dbConfig;

  const env = { ...process.env };
  if (password) {
    env.PGPASSWORD = password;
  }

  try {
    // Drop temp database if it exists
    try {
      execSync(`psql -h ${host} -p ${port} -U ${username} -c "DROP DATABASE IF EXISTS ${tempDbName};"`, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      // Ignore if database doesn't exist
    }

    // Create temp database
    execSync(`psql -h ${host} -p ${port} -U ${username} -c "CREATE DATABASE ${tempDbName};"`, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Restore backup to temp database
    execSync(`psql -h ${host} -p ${port} -U ${username} -d ${tempDbName} -f "${backupPath}"`, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Get table count
    const tableCountResult = execSync(`psql -h ${host} -p ${port} -U ${username} -d ${tempDbName} -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"`, {
      env,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const tableCount = parseInt(tableCountResult.trim());

    // Get total row count from major tables
    const rowCountResult = execSync(`psql -h ${host} -p ${port} -U ${username} -d ${tempDbName} -t -c "SELECT SUM(n_tup_ins + n_tup_upd) FROM pg_stat_user_tables;"`, {
      env,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const totalRows = parseInt(rowCountResult.trim()) || 0;

    // Drop temp database
    execSync(`psql -h ${host} -p ${port} -U ${username} -c "DROP DATABASE ${tempDbName};"`, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    console.log(`${colors.green}✓${colors.reset} Database validation passed: ${tableCount} tables, ~${totalRows} rows`);
    return { valid: true, tableCount, totalRows };

  } catch (error) {
    // Clean up temp database if it exists
    try {
      execSync(`psql -h ${host} -p ${port} -U ${username} -c "DROP DATABASE IF EXISTS ${tempDbName};"`, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    console.error(`${colors.red}✗${colors.reset} Database validation failed: ${error.message}`);
    return { valid: false, error: error.message };
  }
}

// Validate backup integrity
function validateBackup(backupDir) {
  console.log(`${colors.bright}${colors.cyan}🔍 Validating Backup${colors.reset}`);
  console.log(`Backup Directory: ${colors.yellow}${path.relative(PROJECT_ROOT, backupDir)}${colors.reset}\n`);

  const validationReport = {
    timestamp: new Date().toISOString(),
    backupPath: backupDir,
    checks: {}
  };

  let allValid = true;

  // 1. Validate database backup
  console.log(`${colors.bright}${colors.magenta}1. Database Validation${colors.reset}`);
  const dbBackupPath = path.join(backupDir, 'eclaire_backup.sql');

  if (fs.existsSync(dbBackupPath)) {
    // Parse database config (same logic as backup function)
    let dbUrl = 'postgresql://eclaire:eclaire@localhost:5432/eclaire';
    const envPaths = [
      path.join(PROJECT_ROOT, 'apps/backend/.env.dev'),
      path.join(PROJECT_ROOT, 'apps/backend/.env.prod')
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

    const url = new URL(dbUrl);
    let host = url.hostname;

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

    const dbConfig = {
      host,
      port: url.port || 5432,
      username: url.username,
      password: url.password
    };

    const dbValidation = validateDatabase(dbBackupPath, dbConfig);
    validationReport.checks.database = dbValidation;
    if (!dbValidation.valid) allValid = false;
  } else {
    console.error(`${colors.red}✗${colors.reset} Database backup not found`);
    validationReport.checks.database = { valid: false, error: 'Backup file not found' };
    allValid = false;
  }

  // 2. Validate data directories
  console.log(`\n${colors.bright}${colors.magenta}2. Data Directory Validation${colors.reset}`);
  const dataDirs = [
    { name: 'data/db', src: path.join(PROJECT_ROOT, 'data/db'), backup: path.join(backupDir, 'data/db') },
    { name: 'data/users', src: path.join(PROJECT_ROOT, 'data/users'), backup: path.join(backupDir, 'data/users') }
  ];

  validationReport.checks.dataDirectories = {};

  for (const { name, src, backup } of dataDirs) {
    const srcStats = getDirectoryStats(src);
    const backupStats = getDirectoryStats(backup);

    const valid = fs.existsSync(backup) && backupStats.fileCount > 0;
    const sizeDiff = Math.abs(srcStats.size - backupStats.size);
    const fileDiff = Math.abs(srcStats.fileCount - backupStats.fileCount);

    if (valid && fileDiff === 0) {
      console.log(`${colors.green}✓${colors.reset} ${name}: ${backupStats.fileCount} files (${(backupStats.size / 1024 / 1024).toFixed(1)}MB)`);
    } else if (valid) {
      console.log(`${colors.yellow}⚠${colors.reset} ${name}: ${backupStats.fileCount} files (${fileDiff} file difference)`);
    } else {
      console.log(`${colors.red}✗${colors.reset} ${name}: Directory missing or empty`);
      allValid = false;
    }

    validationReport.checks.dataDirectories[name] = {
      valid,
      srcFiles: srcStats.fileCount,
      backupFiles: backupStats.fileCount,
      srcSize: srcStats.size,
      backupSize: backupStats.size,
      sizeDifference: sizeDiff,
      fileDifference: fileDiff
    };
  }

  // 3. Validate configuration files
  console.log(`\n${colors.bright}${colors.magenta}3. Configuration File Validation${colors.reset}`);
  const configFiles = [
    { src: path.join(PROJECT_ROOT, 'config/models.json'), backup: path.join(backupDir, 'config/models.json') },
    { src: path.join(PROJECT_ROOT, 'docker-compose.yml'), backup: path.join(backupDir, 'docker-compose.yml') },
    { src: path.join(PROJECT_ROOT, 'pm2.deps.config.js'), backup: path.join(backupDir, 'pm2.deps.config.js') },
    { src: path.join(PROJECT_ROOT, 'versions.json'), backup: path.join(backupDir, 'versions.json') }
  ];

  validationReport.checks.configFiles = {};
  let configValid = 0;
  let configTotal = 0;

  for (const { src, backup } of configFiles) {
    const filename = path.basename(src);
    configTotal++;

    const srcChecksum = getFileChecksum(src);
    const backupChecksum = getFileChecksum(backup);

    const valid = srcChecksum && backupChecksum && srcChecksum === backupChecksum;

    if (valid) {
      console.log(`${colors.green}✓${colors.reset} ${filename}: Checksum matches`);
      configValid++;
    } else if (!srcChecksum) {
      console.log(`${colors.yellow}⚠${colors.reset} ${filename}: Source file not found`);
    } else if (!backupChecksum) {
      console.log(`${colors.red}✗${colors.reset} ${filename}: Backup file missing`);
      allValid = false;
    } else {
      console.log(`${colors.red}✗${colors.reset} ${filename}: Checksum mismatch`);
      allValid = false;
    }

    validationReport.checks.configFiles[filename] = {
      valid,
      srcChecksum,
      backupChecksum
    };
  }

  // 4. Summary
  console.log(`\n${colors.bright}${colors.cyan}📊 Validation Summary${colors.reset}`);

  if (allValid) {
    console.log(`${colors.bright}${colors.green}✅ Backup validation PASSED${colors.reset}`);
  } else {
    console.log(`${colors.bright}${colors.red}❌ Backup validation FAILED${colors.reset}`);
  }

  console.log(`Config Files: ${colors.green}${configValid}/${configTotal} valid${colors.reset}`);

  validationReport.overall = {
    valid: allValid,
    configFilesValid: configValid,
    configFilesTotal: configTotal
  };

  // Save validation report
  const reportPath = path.join(backupDir, 'validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(validationReport, null, 2));
  console.log(`${colors.cyan}📝${colors.reset} Validation report saved: ${path.basename(reportPath)}`);

  return allValid;
}

// Parse command line arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const validateFlag = args.includes('--validate');
const validateBackupIndex = args.indexOf('--validate-backup');
const validateBackupPath = validateBackupIndex !== -1 ? args[validateBackupIndex + 1] : null;

if (showHelp) {
  console.log(`${colors.bright}Eclaire Backup & Validation Script${colors.reset}`);
  console.log('');
  console.log('Creates a complete backup of the Eclaire system including:');
  console.log('  • PostgreSQL database dump');
  console.log('  • Data directories (db, users)');
  console.log('  • Configuration files');
  console.log('  • Environment files');
  console.log('');
  console.log('Usage: node scripts/backup.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help                Show this help message');
  console.log('  --validate                Validate the most recent backup');
  console.log('  --validate-backup <path>  Validate a specific backup directory');
  console.log('');
  console.log(`Backup will be created in: ${colors.yellow}backups/<ISO_TIMESTAMP>${colors.reset}`);
  console.log(`Validation creates: ${colors.yellow}validation-report.json${colors.reset}`);
  process.exit(0);
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

// Main execution logic
(async () => {
try {
  if (validateBackupPath) {
    // Validate specific backup
    const backupPath = path.resolve(validateBackupPath);
    if (!fs.existsSync(backupPath)) {
      console.error(`${colors.red}❌ Backup directory not found: ${backupPath}${colors.reset}`);
      process.exit(1);
    }
    console.log(`${colors.cyan}🔍 Validating specific backup: ${backupPath}${colors.reset}\n`);
    const isValid = validateBackup(backupPath);
    process.exit(isValid ? 0 : 1);

  } else if (validateFlag) {
    // Validate most recent backup
    const mostRecentBackup = getMostRecentBackup();
    if (!mostRecentBackup) {
      console.error(`${colors.red}❌ No backups found in backups/ directory${colors.reset}`);
      process.exit(1);
    }
    console.log(`${colors.cyan}🔍 Validating most recent backup: ${path.basename(mostRecentBackup)}${colors.reset}\n`);
    const isValid = validateBackup(mostRecentBackup);
    process.exit(isValid ? 0 : 1);

  } else {
    // Create backup (default behavior)
    await createBackup();
  }
} catch (error) {
  console.error(`${colors.red}💥 Operation failed: ${error.message}${colors.reset}`);
  process.exit(1);
} finally {
  rl.close();
}
})();