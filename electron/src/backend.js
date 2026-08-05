const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");

const BACKEND_PORT = 8001;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

function backendDir(isPackaged) {
  return isPackaged ? path.join(process.resourcesPath, "backend") : path.join(__dirname, "..", "..", "backend");
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkHealth()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startBackend(isPackaged) {
  const cwd = backendDir(isPackaged);
  // uv manages the Python venv and dependencies; must be installed on the host machine.
  const child = spawn("uv", ["run", "uvicorn", "app.main:app", "--port", String(BACKEND_PORT)], {
    cwd,
    env: process.env,
    stdio: "pipe",
  });

  child.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[backend] ${d}`));

  return child;
}

module.exports = { startBackend, waitForBackend, BACKEND_PORT };
