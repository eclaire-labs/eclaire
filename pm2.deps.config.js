// ecosystem.config.js
const path = require('path');

// Use absolute paths so logs land in the right place no matter where PM2 starts from
const CWD = __dirname;
const LOG = (...p) => path.join(CWD, 'data', 'logs', ...p);

module.exports = {
  apps: [
    // 1) Redis (dockerized; PM2 won't autorestart the container)
    {
      name: 'redis',
      cwd: CWD,
      interpreter: 'none',
      script: 'bash',
      args: [
        '-lc',
        // Use `exec` so signals propagate correctly to docker
        'docker network create eclaire-net 2>/dev/null || true && exec docker run --rm --name eclaire-redis -p 6379:6379 --network eclaire-net --expose 6379 -v "$(pwd)/data/redis:/data" redis:8-alpine redis-server --appendonly yes --save ""'
      ],
      autorestart: false,
      out_file: LOG('redis.log'),
      error_file: LOG('redis.log'),
      kill_timeout: 5000,
    },

    // 2) Postgres (dockerized; PM2 won't autorestart the container)
    {
      name: 'postgres',
      cwd: CWD,
      interpreter: 'none',
      script: 'bash',
      args: [
        '-lc',
        'docker network create eclaire-net 2>/dev/null || true && exec docker run --rm --name eclaire-postgres -e POSTGRES_DB=eclaire -e POSTGRES_USER=eclaire -e POSTGRES_PASSWORD=eclaire -p 5432:5432 --network eclaire-net --expose 5432 -v "$(pwd)/data/db:/var/lib/postgresql/data" postgres:17.5'
      ],
      autorestart: false,
      out_file: LOG('postgres.log'),
      error_file: LOG('postgres.log'),
      kill_timeout: 5000,
    },

    // 3) Llama backend (native process; PM2 will restart on crash)
    {
      name: 'llama_backend',
      cwd: CWD,
      interpreter: 'none',
      script: 'llama-server',
      args: '-hf unsloth/Qwen3-14B-GGUF:Q4_K_XL --port 11434',
      autorestart: true,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 20,
      out_file: LOG('llama_backend.log'),
      error_file: LOG('llama_backend.log'),
      log_date_format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    },


    // 4) Llama workers (native process; PM2 will restart on crash)
    {
      name: 'llama_workers',
      cwd: CWD,
      interpreter: 'none',
      script: 'llama-server',
      args: '-hf unsloth/gemma-3-4b-it-qat-GGUF:Q4_K_XL --port 11435',
      autorestart: true,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 20,
      out_file: LOG('llama_workers.log'),
      error_file: LOG('llama_workers.log'),
      // Add PM2 timestamps for this app (others already timestamp themselves)
      log_date_format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    },

    // 5) Docling (native process; PM2 will restart on crash)
    {
      name: 'docling',
      cwd: CWD,
      interpreter: 'none',
      script: 'docling-serve',
      args: 'run --host 0.0.0.0 --port 5001',
      autorestart: true,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 20,
      out_file: LOG('docling.log'),
      error_file: LOG('docling.log'),
      log_date_format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    }
  ],
};
