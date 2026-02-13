#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');

const args = process.argv.slice(2);

function getArgValue(name, fallback = '') {
  const prefix = `${name}=`;
  const match = args.find(arg => arg.startsWith(prefix));
  if (!match) return fallback;
  return match.slice(prefix.length).trim();
}

const backendCommand = getArgValue('--backend', process.env.RESTART_BACKEND_CMD || 'npm start');
const frontendCommand = getArgValue('--frontend', process.env.RESTART_FRONTEND_CMD || '');
const portArg = getArgValue('--ports', process.env.RESTART_PORTS || '3010,3000,4000,5173,4173');
const ports = Array.from(
  new Set(
    portArg
      .split(',')
      .map(value => Number.parseInt(value.trim(), 10))
      .filter(Number.isInteger)
  )
);

function runCommand(command, commandArgs) {
  return spawnSync(command, commandArgs, { stdio: 'pipe', encoding: 'utf8', shell: false });
}

function findPidsForPort(port) {
  const result = runCommand('netstat', ['-ano']);
  if (result.status !== 0) {
    return [];
  }
  const lines = String(result.stdout || '').split(/\r?\n/);
  const regex = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)$`, 'i');
  const pids = new Set();
  lines.forEach(line => {
    const match = line.match(regex);
    if (match && match[1]) {
      pids.add(Number.parseInt(match[1], 10));
    }
  });
  return Array.from(pids).filter(Number.isInteger);
}

function killPid(pid) {
  const result = runCommand('taskkill', ['/PID', String(pid), '/T', '/F']);
  return result.status === 0;
}

function killPorts(targetPorts) {
  const killed = [];
  const failed = [];
  targetPorts.forEach(port => {
    const pids = findPidsForPort(port);
    pids.forEach(pid => {
      if (killPid(pid)) {
        killed.push({ port, pid });
      } else {
        failed.push({ port, pid });
      }
    });
  });
  return { killed, failed };
}

function startCommand(command, name) {
  const child = spawn(command, {
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  child.on('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[restart] ${name} exited with ${detail}`);
  });
  return child;
}

const { killed, failed } = killPorts(ports);
if (killed.length) {
  killed.forEach(item => {
    console.log(`[restart] killed PID ${item.pid} on port ${item.port}`);
  });
} else {
  console.log('[restart] no listening processes found on target ports');
}

if (failed.length) {
  failed.forEach(item => {
    console.log(`[restart] failed to kill PID ${item.pid} on port ${item.port}`);
  });
}

console.log(`[restart] starting backend: ${backendCommand}`);
const backendChild = startCommand(backendCommand, 'backend');
let frontendChild = null;

if (frontendCommand) {
  console.log(`[restart] starting frontend: ${frontendCommand}`);
  frontendChild = startCommand(frontendCommand, 'frontend');
} else {
  console.log('[restart] no frontend command configured; frontend is expected to be served by backend static files');
}

const shutdown = () => {
  if (frontendChild && !frontendChild.killed) {
    frontendChild.kill();
  }
  if (backendChild && !backendChild.killed) {
    backendChild.kill();
  }
};

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
