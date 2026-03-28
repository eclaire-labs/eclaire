#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { execSync } = require("node:child_process");

// Colors for console output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  reset: "\x1b[0m",
  bright: "\x1b[1m",
};

// Project root directory
const PROJECT_ROOT = path.join(__dirname, "..");

// Create readline interface for user prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify readline question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Get directory stats for reporting
function getDirectoryStats(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { fileCount: 0, size: 0 };
  }

  try {
    const sizeResult = execSync(
      `du -sk "${dirPath}" | awk '{print $1 * 1024}'`,
      { encoding: "utf-8" },
    );
    const size = parseInt(sizeResult.trim(), 10);

    const countResult = execSync(`find "${dirPath}" -type f | wc -l`, {
      encoding: "utf-8",
    });
    const fileCount = parseInt(countResult.trim(), 10);

    return { size, fileCount };
  } catch (_error) {
    return { fileCount: 0, size: 0 };
  }
}

// Show what will be deleted
function showCleanupPreview() {
  console.log(`${colors.bright}${colors.red}⚠️  CLEANUP PREVIEW${colors.reset}`);
  console.log(
    `${colors.red}The following will be PERMANENTLY DELETED:${colors.reset}\n`,
  );

  // 1. Database
  console.log(
    `${colors.bright}${colors.magenta}1. PostgreSQL Database${colors.reset}`,
  );
  console.log(
    `${colors.red}   ✗${colors.reset} eclaire database (will be DROPPED)`,
  );

  // 2. Data directory
  console.log(
    `\n${colors.bright}${colors.magenta}2. Data Directory${colors.reset}`,
  );
  const dataDir = path.join(PROJECT_ROOT, "data");
  const dataStats = getDirectoryStats(dataDir);

  if (dataStats.fileCount > 0) {
    console.log(
      `${colors.red}   ✗${colors.reset} data/ directory (${dataStats.fileCount} files, ${(dataStats.size / 1024 / 1024).toFixed(1)}MB)`,
    );

    // Show subdirectories
    const subdirs = ["db", "users", "logs", "browser-data"];
    for (const subdir of subdirs) {
      const subdirPath = path.join(dataDir, subdir);
      const subdirStats = getDirectoryStats(subdirPath);
      if (subdirStats.fileCount > 0) {
        console.log(
          `${colors.red}     ✗${colors.reset} data/${subdir}/ (${subdirStats.fileCount} files, ${(subdirStats.size / 1024 / 1024).toFixed(1)}MB)`,
        );
      }
    }
  } else {
    console.log(
      `${colors.yellow}   -${colors.reset} data/ directory (empty or not found)`,
    );
  }

  // 3. Environment files
  console.log(
    `\n${colors.bright}${colors.magenta}3. Environment Files${colors.reset}`,
  );
  const envFiles = [".env"];

  for (const envFile of envFiles) {
    const envPath = path.join(PROJECT_ROOT, envFile);
    if (fs.existsSync(envPath)) {
      const size = fs.statSync(envPath).size;
      console.log(
        `${colors.red}   ✗${colors.reset} ${envFile} (${size} bytes)`,
      );
    } else {
      console.log(`${colors.yellow}   -${colors.reset} ${envFile} (not found)`);
    }
  }

  // 4. Configuration files
  console.log(
    `\n${colors.bright}${colors.magenta}4. Configuration Files${colors.reset}`,
  );
  const configDir = path.join(PROJECT_ROOT, "config/ai");
  const configStats = getDirectoryStats(configDir);
  if (configStats.fileCount > 0) {
    console.log(
      `${colors.red}   ✗${colors.reset} config/ai/ (${configStats.fileCount} files, ${(configStats.size / 1024 / 1024).toFixed(1)}MB)`,
    );
  } else {
    console.log(
      `${colors.yellow}   -${colors.reset} config/ai/ (empty or not found)`,
    );
  }

  // What will NOT be deleted
  console.log(
    `\n${colors.bright}${colors.green}Items that will NOT be deleted:${colors.reset}`,
  );
  console.log(`${colors.green}   ✓${colors.reset} Downloaded models`);
  console.log(`${colors.green}   ✓${colors.reset} Node modules`);
  console.log(`${colors.green}   ✓${colors.reset} Build artifacts (dist/)`);
  console.log(`${colors.green}   ✓${colors.reset} Backups directory`);
  console.log(`${colors.green}   ✓${colors.reset} Source code and git history`);
}

// Drop PostgreSQL database
async function dropDatabase(dryRun = false) {
  console.log(
    `${colors.bright}${colors.magenta}🗑️  Database Cleanup${colors.reset}`,
  );

  if (dryRun) {
    console.log(`${colors.cyan}→${colors.reset} Would drop eclaire database`);
    return true;
  }

  try {
    // Get database connection info (same logic as backup/restore scripts)
    let dbUrl = "postgresql://eclaire:eclaire@localhost:5432/eclaire";
    const envPaths = [path.join(PROJECT_ROOT, ".env")];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        const match = envContent.match(/DATABASE_URL=(.+)/);
        if (match) {
          dbUrl = match[1].replace(/["']/g, "");
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
    const dockerHosts = ["eclaire-postgres"];
    if (dockerHosts.includes(host)) {
      // Try to resolve the hostname, if it fails, we're likely on the host machine
      try {
        execSync(`nslookup ${host}`, { stdio: "pipe" });
      } catch (_error) {
        // Hostname doesn't resolve, use localhost instead
        host = "localhost";
        console.log(
          `${colors.cyan}ℹ️${colors.reset}  Resolved Docker hostname ${url.hostname} to localhost`,
        );
      }
    }

    // Set PGPASSWORD environment variable
    const env = { ...process.env };
    if (password) {
      env.PGPASSWORD = password;
    }

    console.log(`${colors.cyan}→${colors.reset} Dropping database: ${dbName}`);

    // First, terminate any active connections to the database
    try {
      execSync(
        `psql -h ${host} -p ${port} -U ${username} -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();"`,
        {
          env,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch (_error) {
      // Ignore errors if there are no active connections or database doesn't exist
    }

    // Drop database (do NOT recreate) - connect to postgres database to avoid "cannot drop currently open database" error
    execSync(
      `psql -h ${host} -p ${port} -U ${username} -d postgres -c "DROP DATABASE IF EXISTS ${dbName};"`,
      {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    console.log(
      `${colors.green}✓${colors.reset} Database dropped successfully`,
    );
    return true;
  } catch (error) {
    // Check if this is a PostgreSQL connection error
    if (
      error.message.includes("Connection refused") ||
      error.message.includes("connection to server")
    ) {
      console.error(`${colors.red}✗${colors.reset} PostgreSQL is not running`);
      console.log(
        `${colors.cyan}ℹ️${colors.reset}  The database cannot be dropped while PostgreSQL is stopped.`,
      );
      console.log(
        `${colors.cyan}ℹ️${colors.reset}  Please start PostgreSQL first, then run cleanup again.`,
      );
      console.log("");
      console.log("To start PostgreSQL:");
      console.log(
        `  ${colors.cyan}•${colors.reset} Docker: ${colors.yellow}docker start eclaire-postgres${colors.reset}`,
      );
      console.log(
        `  ${colors.cyan}•${colors.reset} Or check your PostgreSQL service status`,
      );
    } else {
      console.error(
        `${colors.red}✗${colors.reset} Database cleanup failed: ${error.message}`,
      );
    }
    return false;
  }
}

// Remove data directory completely
async function removeDataDirectory(dryRun = false) {
  console.log(
    `\n${colors.bright}${colors.magenta}📁 Data Directory Cleanup${colors.reset}`,
  );

  const dataDir = path.join(PROJECT_ROOT, "data");

  if (!fs.existsSync(dataDir)) {
    console.log(`${colors.yellow}⚠${colors.reset} data/ directory not found`);
    return true;
  }

  const dataStats = getDirectoryStats(dataDir);
  console.log(
    `${colors.cyan}Target:${colors.reset} data/ directory (${dataStats.fileCount} files, ${(dataStats.size / 1024 / 1024).toFixed(1)}MB)`,
  );

  if (dryRun) {
    console.log(
      `${colors.cyan}→${colors.reset} Would remove entire data/ directory`,
    );
    return true;
  }

  try {
    console.log(`${colors.cyan}→${colors.reset} Removing data/ directory...`);
    execSync(`rm -rf "${dataDir}"`);
    console.log(
      `${colors.green}✓${colors.reset} data/ directory removed successfully`,
    );
    return true;
  } catch (error) {
    console.error(
      `${colors.red}✗${colors.reset} Failed to remove data/ directory: ${error.message}`,
    );
    return false;
  }
}

// Remove environment files
async function removeEnvironmentFiles(dryRun = false) {
  console.log(
    `\n${colors.bright}${colors.magenta}🔐 Environment Files Cleanup${colors.reset}`,
  );

  const envFiles = [".env"];

  let successCount = 0;
  let totalCount = 0;

  for (const envFile of envFiles) {
    const envPath = path.join(PROJECT_ROOT, envFile);
    totalCount++;

    if (!fs.existsSync(envPath)) {
      console.log(`${colors.yellow}⚠${colors.reset} ${envFile}: Not found`);
      successCount++; // Count as success since goal is to not have the file
      continue;
    }

    if (dryRun) {
      console.log(`${colors.cyan}→${colors.reset} Would remove: ${envFile}`);
      successCount++;
      continue;
    }

    try {
      fs.unlinkSync(envPath);
      console.log(`${colors.green}✓${colors.reset} Removed: ${envFile}`);
      successCount++;
    } catch (error) {
      console.error(
        `${colors.red}✗${colors.reset} Failed to remove ${envFile}: ${error.message}`,
      );
    }
  }

  return successCount === totalCount;
}

// Remove config files
async function removeConfigFiles(dryRun = false) {
  console.log(
    `\n${colors.bright}${colors.magenta}⚙️  Configuration Files Cleanup${colors.reset}`,
  );

  const configDir = path.join(PROJECT_ROOT, "config/ai");

  if (!fs.existsSync(configDir)) {
    console.log(`${colors.yellow}⚠${colors.reset} config/ai/: Not found`);
    return true;
  }

  const configStats = getDirectoryStats(configDir);
  console.log(
    `${colors.cyan}Target:${colors.reset} config/ai/ directory (${configStats.fileCount} files)`,
  );

  if (dryRun) {
    console.log(
      `${colors.cyan}→${colors.reset} Would remove: config/ai/ directory`,
    );
    return true;
  }

  try {
    execSync(`rm -rf "${configDir}"`);
    console.log(
      `${colors.green}✓${colors.reset} Removed: config/ai/ directory`,
    );
    return true;
  } catch (error) {
    console.error(
      `${colors.red}✗${colors.reset} Failed to remove config/ai/: ${error.message}`,
    );
    return false;
  }
}

// Main cleanup function
async function performCleanup(options = {}) {
  const { dryRun = false } = options;

  console.log(
    `${colors.bright}${colors.red}🧹 Eclaire System Cleanup${colors.reset}`,
  );

  if (dryRun) {
    console.log(
      `${colors.bright}${colors.blue}🔍 DRY RUN MODE - No changes will be made${colors.reset}`,
    );
  }
  console.log("");

  // Pre-flight warnings
  if (!dryRun) {
    console.log(
      `${colors.bright}${colors.yellow}⚠️  IMPORTANT: Before proceeding${colors.reset}`,
    );
    console.log(
      `${colors.yellow}Please stop these services first:${colors.reset}`,
    );
    console.log(`  • Frontend server (pnpm run dev)`);
    console.log(`  • Backend server (pnpm run dev)`);
    console.log(`  • Workers service (pnpm run dev)`);
    console.log("");
  }

  // Show what will be deleted
  showCleanupPreview();
  console.log("");

  // First confirmation
  if (!dryRun) {
    const proceed = await askQuestion(
      `${colors.bright}${colors.red}Do you want to proceed with this cleanup? (y/N): ${colors.reset}`,
    );
    if (!proceed.toLowerCase().startsWith("y")) {
      console.log(`${colors.yellow}Cleanup cancelled${colors.reset}`);
      return false;
    }

    // Second confirmation - require exact text
    console.log(
      `\n${colors.bright}${colors.red}⚠️  FINAL WARNING ⚠️${colors.reset}`,
    );
    console.log(
      `${colors.red}This will PERMANENTLY DELETE all the data listed above!${colors.reset}`,
    );
    const confirmation = await askQuestion(
      `${colors.bright}Type "I AGREE" to confirm deletion: ${colors.reset}`,
    );

    if (confirmation !== "I AGREE") {
      console.log(
        `${colors.yellow}Cleanup cancelled (confirmation text did not match)${colors.reset}`,
      );
      return false;
    }
  }

  console.log(
    `\n${colors.bright}${colors.cyan}🚀 Starting cleanup process...${colors.reset}\n`,
  );

  let successCount = 0;
  const totalOperations = 4;

  // 1. Drop database
  if (await dropDatabase(dryRun)) {
    successCount++;
  }

  // 2. Remove data directory
  if (await removeDataDirectory(dryRun)) {
    successCount++;
  }

  // 3. Remove environment files
  if (await removeEnvironmentFiles(dryRun)) {
    successCount++;
  }

  // 4. Remove config files
  if (await removeConfigFiles(dryRun)) {
    successCount++;
  }

  // Summary
  console.log(
    `\n${colors.bright}${colors.cyan}📊 Cleanup Summary${colors.reset}`,
  );

  if (dryRun) {
    console.log(
      `${colors.blue}🔍 Dry run completed - no changes were made${colors.reset}`,
    );
  } else if (successCount === totalOperations) {
    console.log(
      `${colors.bright}${colors.green}✅ Cleanup completed successfully!${colors.reset}`,
    );
    console.log(
      `${colors.green}${successCount}/${totalOperations}${colors.reset} operations successful`,
    );

    // Post-cleanup reminders
    console.log(
      `\n${colors.bright}${colors.yellow}📝 Next Steps:${colors.reset}`,
    );
    console.log(
      `${colors.yellow}Don't forget to stop external dependencies:${colors.reset}`,
    );
    console.log(
      `  • Docker containers: ${colors.cyan}docker stop eclaire-postgres${colors.reset}`,
    );
    console.log(
      `  • Or stop all: ${colors.cyan}docker stop $(docker ps -q)${colors.reset}`,
    );
    console.log(
      `\n${colors.cyan}💡 To set up a fresh system, run your setup script or restore from backup.${colors.reset}`,
    );
  } else {
    console.log(
      `${colors.bright}${colors.red}❌ Cleanup completed with errors${colors.reset}`,
    );
    console.log(
      `${colors.red}${successCount}/${totalOperations}${colors.reset} operations successful`,
    );
  }

  return successCount === totalOperations;
}

// Parse command line arguments
const args = new Set(process.argv.slice(2));
const showHelp = args.has("--help") || args.has("-h");
const dryRun = args.has("--dry-run");

if (showHelp) {
  console.log(`${colors.bright}Eclaire Cleanup Script${colors.reset}`);
  console.log("");
  console.log("Resets Eclaire to a clean state by removing:");
  console.log("  • PostgreSQL database (dropped, not recreated)");
  console.log("  • Complete data/ directory");
  console.log("  • Environment file (.env)");
  console.log("  • Configuration files (config/ai/*.json)");
  console.log("");
  console.log("Usage: node scripts/cleanup.js [options]");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help      Show this help message");
  console.log(
    "  --dry-run       Preview what would be deleted without making changes",
  );
  console.log("");
  console.log(
    `${colors.bright}${colors.red}⚠️  WARNING: This will permanently delete data!${colors.reset}`,
  );
  console.log(
    `${colors.yellow}Always stop services first and consider making a backup.${colors.reset}`,
  );
  rl.close();
  process.exit(0);
}

// Main execution
(async () => {
  try {
    const success = await performCleanup({ dryRun });
    rl.close();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(
      `${colors.red}💥 Cleanup failed: ${error.message}${colors.reset}`,
    );
    rl.close();
    process.exit(1);
  }
})();
