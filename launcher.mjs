#!/usr/bin/env node
/**
 * BCS Written Interactive Tree-Notebook — Offline Local Launcher
 * ---------------------------------------------------------------
 * Cross-platform (Windows / macOS / Linux). Run via START.bat,
 * START-MAC-LINUX.sh or:  node launcher.mjs
 *
 * What it does:
 *   0. Closes any leftover app instance that could lock files (EPERM fix)
 *   1. Installs npm packages (first run only — needs internet once)
 *   2. Prepares the SQLite database (prisma db push)
 *   3. Builds the app (first run only)
 *   4. Starts the local server  ->  http://localhost:3000
 *   5. Opens the browser automatically 2 seconds after the server is ready
 *
 * Why step 0 matters: on Windows, `prisma generate` must replace
 * node_modules/.prisma/client/query_engine-windows.dll.node. If an older
 * app instance is still running, that DLL is loaded in memory and Windows
 * refuses the replace with EPERM; the same happens when node_modules was
 * copied from a backup drive that set the read-only attribute. The launcher
 * now kills leftover instances, clears read-only bits and retries once more
 * before giving up.
 *
 * All data (tree, notes, uploads) lives in the db/ folder next to this file.
 *
 * NOTE: All console messages are plain ASCII on purpose — Windows cmd.exe
 * can mis-parse non-ASCII output, which breaks the user experience.
 */

import { spawn, spawnSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === "win32";
const NEXT_CLI = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const PRISMA_CLI = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
const APP_PORT_BASE = Number(process.env.PORT) || 3000;
const APP_PORT_SPAN = 20; // launcher may drift up to base+SPAN-1 when busy

/** Absolute SQLite URL for <this folder>/db/custom.db — same file for prisma CLI and Next. */
function databaseUrl() {
  const dbFile = path.resolve(ROOT, "db", "custom.db").replace(/\\/g, "/");
  return "file:" + dbFile;
}

function childEnv(extra = {}) {
  return {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: databaseUrl(),
    ...extra,
  };
}

function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function collectDbCandidates() {
  const found = new Map(); // path -> size
  const add = (p) => {
    if (!p) return;
    try {
      const resolved = path.resolve(p);
      if (!fs.existsSync(resolved)) return;
      const st = fs.statSync(resolved);
      if (!st.isFile() || st.size < 2048) return;
      if (!/\.db$/i.test(resolved)) return;
      found.set(resolved, st.size);
    } catch {
      /* ignore */
    }
  };

  add(path.join(ROOT, "db", "custom.db"));
  add(path.join(ROOT, "prisma", "db", "custom.db"));
  add("/home/z/my-project/db/custom.db");
  add(path.join(ROOT, "home", "z", "my-project", "db", "custom.db"));
  for (const letter of "CDEFGHIJ") {
    add(`${letter}:/home/z/my-project/db/custom.db`);
  }

  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name === "custom.db" || e.name === "dev.db") add(full);
    }
  };

  walk(ROOT, 0);
  try {
    walk(path.dirname(ROOT), 0); // sibling old app folders
  } catch {
    /* ignore */
  }

  return [...found.entries()].sort((a, b) => b[1] - a[1]);
}

function copyDbWithSidecars(fromFile, toFile) {
  fs.mkdirSync(path.dirname(toFile), { recursive: true });
  fs.copyFileSync(fromFile, toFile);
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (fs.existsSync(fromFile + suffix)) {
      try {
        fs.copyFileSync(fromFile + suffix, toFile + suffix);
      } catch {
        /* ignore */
      }
    }
  }
  const fromUploads = path.join(path.dirname(fromFile), "uploads");
  const toUploads = path.join(path.dirname(toFile), "uploads");
  if (fs.existsSync(fromUploads) && fromUploads !== toUploads) {
    try {
      fs.mkdirSync(toUploads, { recursive: true });
      for (const name of fs.readdirSync(fromUploads)) {
        const src = path.join(fromUploads, name);
        const dst = path.join(toUploads, name);
        if (fs.statSync(src).isFile() && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Old packs stored notes at file:/home/z/my-project/db/custom.db
 * which on Windows is usually C:\home\z\my-project\db\custom.db — NOT the
 * db\ folder next to START.bat. Find the fattest custom.db and copy it home.
 */
function ensureDbLocation() {
  const destDir = path.join(ROOT, "db");
  const dest = path.join(destDir, "custom.db");
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.mkdirSync(path.join(destDir, "uploads"), { recursive: true });
  } catch {
    /* best-effort */
  }

  const destSize = fileSize(dest);
  const candidates = collectDbCandidates();
  const best = candidates.find(([p]) => path.resolve(p) !== path.resolve(dest));

  if (best && best[1] > destSize + 4096) {
    try {
      if (destSize > 0) {
        const bak = dest + ".bak-" + Date.now();
        fs.copyFileSync(dest, bak);
      }
      copyDbWithSidecars(best[0], dest);
      say(`${c.green}[i] Purano notes paoa geche — copy kora holo db\\custom.db e${c.reset}`);
      say(`${c.dim}    source: ${best[0]}  (${Math.round(best[1] / 1024)} KB)${c.reset}`);
    } catch (err) {
      say(`${c.yellow}[!] Database copy failed: ${err && err.message ? err.message : err}${c.reset}`);
    }
  } else if (destSize > 2048) {
    say(`${c.dim}[i] Database: db\\custom.db (${Math.round(destSize / 1024)} KB)${c.reset}`);
  } else {
    say(`${c.yellow}[!] db\\custom.db khali / paoa jayni.${c.reset}`);
    say(`${c.yellow}    Windows e purono notes sadharonoto ekhane thake:${c.reset}`);
    say(`${c.yellow}      C:\\home\\z\\my-project\\db\\custom.db${c.reset}`);
    say(`${c.yellow}    Oi file copy kore ei folder-er db\\custom.db te din, abar START.bat chalaban.${c.reset}`);
    if (candidates.length) {
      say(`${c.dim}    Khuje peyechi:${c.reset}`);
      for (const [p, sz] of candidates.slice(0, 6)) {
        say(`${c.dim}      ${p}  (${Math.round(sz / 1024)} KB)${c.reset}`);
      }
    }
  }

  // Pin .env to the SAME absolute file so prisma CLI and Next never diverge.
  try {
    fs.writeFileSync(path.join(ROOT, ".env"), `DATABASE_URL="${databaseUrl()}"\n`);
  } catch {
    /* ignore */
  }
}

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

const say = (msg = "") => process.stdout.write(msg + "\n");
const step = (n, total, msg) =>
  say(`${c.cyan}${c.bold}[${n}/${total}]${c.reset} ${msg}`);

/** Synchronous sleep that works on every platform (no `timeout`/`sleep` needed). */
function waitMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* busy-wait fallback */
    }
  }
}

/**
 * Recursively add write-permission bits to a file/folder tree (never removes
 * execute bits). Fixes the Windows EPERM that happens when node_modules was
 * copied from a backup drive: files carrying the read-only attribute cannot
 * be replaced by `prisma generate` / `npm install`.
 */
function chmodWritable(target) {
  let stats;
  try {
    stats = fs.statSync(target);
  } catch {
    return; // missing - nothing to do
  }
  try {
    const mode = stats.mode | 0o222; // add ugo-write, keep everything else
    if (mode !== stats.mode) fs.chmodSync(target, mode);
  } catch {
    /* best-effort */
  }
  if (!stats.isDirectory()) return;
  let entries;
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) chmodWritable(path.join(target, entry.name));
}

/**
 * Kill processes that are LISTENING on the app's port pool (base .. base+SPAN-1).
 * Windows: parse `netstat -ano` and taskkill each PID. Unix: lsof + SIGKILL.
 * Returns how many processes were terminated.
 */
function killPortHolders(base = APP_PORT_BASE) {
  const selfPid = process.pid;
  const pids = new Set();
  if (IS_WIN) {
    let res;
    try {
      res = spawnSync("netstat", ["-ano", "-p", "tcp"], {
        encoding: "utf8",
        timeout: 20000,
        windowsHide: true,
      });
    } catch {
      return 0;
    }
    if (res.status !== 0 || !res.stdout) return 0;
    for (const line of res.stdout.split("\n")) {
      if (!/LISTENING/i.test(line)) continue;
      const portMatch = line.match(/:(\d+)\s/); // first match = local port
      const pidMatch = line.match(/LISTENING\s+(\d+)\s*$/i);
      if (!portMatch || !pidMatch) continue;
      const port = Number(portMatch[1]);
      if (port >= base && port < base + APP_PORT_SPAN) pids.add(Number(pidMatch[1]));
    }
    let killed = 0;
    for (const pid of pids) {
      if (!pid || pid === selfPid) continue;
      try {
        const k = spawnSync("taskkill", ["/F", "/PID", String(pid)], {
          encoding: "utf8",
          timeout: 15000,
          windowsHide: true,
        });
        if (k.status === 0) killed++;
      } catch {
        /* best-effort */
      }
    }
    return killed;
  }
  // macOS / Linux
  let killed = 0;
  for (let p = base; p < base + APP_PORT_SPAN; p++) {
    try {
      const res = spawnSync("lsof", ["-ti", `tcp:${p}`], {
        encoding: "utf8",
        timeout: 5000,
      });
      if (res.status !== 0 || !res.stdout) continue;
      for (const line of res.stdout.split("\n")) {
        const pid = Number(line.trim());
        if (!pid || pid === selfPid) continue;
        try {
          process.kill(pid, "SIGKILL");
          killed++;
        } catch {
          /* already gone */
        }
      }
    } catch {
      break; // lsof not available - give up quietly
    }
  }
  return killed;
}

/**
 * Windows extra safety net: terminate node.exe processes whose command line
 * references this app folder (a crashed instance may hold the Prisma DLL
 * without listening on any port). The current launcher process is excluded.
 */
function killAppNodeProcesses() {
  if (!IS_WIN) return false;
  const rootEsc = ROOT.replace(/'/g, "''");
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${rootEsc}*' -and $_.ProcessId -ne ${process.pid} } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try {
    const res = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", timeout: 30000, windowsHide: true }
    );
    return res.status === 0;
  } catch {
    return false; // PowerShell missing/blocked - skip quietly
  }
}

/**
 * Step 0 of every start: make sure no leftover copy of this app is holding
 * files that `npm install` / `prisma generate` need to replace.
 */
function freeAppInstances() {
  const killed = killPortHolders();
  const psOk = killAppNodeProcesses();
  if (killed > 0) {
    say(
      `${c.yellow}[i] Purano app instance paoa gese - bondho kora holo (${killed} ta process).${c.reset}`
    );
    say(`${c.dim}    (Old server instance was still running - closed it to avoid file locks.)${c.reset}`);
    waitMs(800); // give Windows a moment to release the file handles
  } else if (psOk) {
    say(`${c.dim}[i] Kono purano instance lock korche na - thik ache.${c.reset}`);
  }
  return killed;
}

function run(cmd, args, { label, shell = false, hint, retries = 1 } = {}) {
  let lastStatus = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (attempt > 1) {
      say(`${c.yellow}[!] Abar cheshta korchi (attempt ${attempt}/${retries}) - 3 second por...${c.reset}`);
      waitMs(3000); // transient locks (antivirus scans) usually clear quickly
    }
    const res = spawnSync(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell, // shell only for npm (PATH lookup of npm.cmd); JS CLIs run via node directly so paths with spaces are safe
      env: childEnv(),
    });
    if (res.status === 0) return res;
    lastStatus = res.status;
  }
  say("");
  say(`${c.red}[X] Step failed: ${label || "command"} (exit code ${lastStatus}).${c.reset}`);
  if (hint) {
    say(`${c.dim}    ${hint}${c.reset}`);
  } else {
    say(`${c.dim}    Read the error message above, then double-click START.bat again.${c.reset}`);
  }
  process.exit(lastStatus ?? 1);
}

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

/**
 * Latest modification time across all source files (skips build artifacts and
 * data folders). Used to detect "code changed after the last build".
 */
function latestSourceMtime(root) {
  let latest = 0;
  const skip = new Set(["node_modules", ".next", "db", "logs", ".git"]);
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > latest) latest = m;
        } catch {
          /* unreadable file - ignore */
        }
      }
    }
  };
  walk(root);
  return latest;
}

/**
 * True when the app needs a production build: never built before, OR any
 * source file is newer than the last build marker (.next/BUILD_ID).
 * This makes app updates work automatically - drop in new code, run
 * START.bat, and the launcher rebuilds by itself.
 */
function shouldRebuild(root = ROOT) {
  const marker = path.join(root, ".next", "BUILD_ID");
  if (!fs.existsSync(marker)) return true; // never built
  try {
    const buildTime = fs.statSync(marker).mtimeMs;
    return latestSourceMtime(root) > buildTime;
  } catch {
    return true; // when in doubt, rebuild
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  for (let p = APP_PORT_BASE; p < APP_PORT_BASE + APP_PORT_SPAN; p++) {
    if (await isPortFree(p)) return p;
  }
  return APP_PORT_BASE;
}

function openBrowser(url) {
  try {
    if (IS_WIN) {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", shell: false }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    say(`${c.yellow}[!] Could not auto-open browser - open this manually: ${url}${c.reset}`);
  }
}

function waitForServer(port, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`, {
          redirect: "manual",
          signal: AbortSignal.timeout(3000),
        });
        // Any HTTP response means the server is up
        if (res.status) return resolve(true);
      } catch {
        /* not up yet */
      }
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("server-timeout"));
      }
      setTimeout(attempt, 700);
    };
    attempt();
  });
}

async function main() {
  say("");
  say(`${c.bold}====================================================${c.reset}`);
  say(`${c.bold}  BCS Written Interactive Tree-Notebook${c.reset}`);
  say(`${c.bold}  Local Server Launcher${c.reset}`);
  say(`${c.bold}====================================================${c.reset}`);
  say("");

  // Pack version proof (written by scripts/build-zip.mjs at packaging time).
  // If this line is missing, the folder was extracted from an OLD ZIP download.
  const stampPath = path.join(ROOT, "BUILD-STAMP.txt");
  if (fs.existsSync(stampPath)) {
    const stampLines = fs
      .readFileSync(stampPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const buildLine = stampLines.find((l) => l.startsWith("Pack build"));
    const zipLine = stampLines.find((l) => l.startsWith("ZIP name"));
    if (buildLine) say(`${c.green}  >> ${buildLine}${c.reset}`);
    if (zipLine) say(`${c.dim}     (${zipLine})${c.reset}`);
    say("");
  } else {
    say(`${c.yellow}  [!] OLD PACK DETECTED: BUILD-STAMP.txt not found here.${c.reset}`);
    say(`${c.yellow}      Ei folder purano ZIP theke extract kora hoyeche.${c.reset}`);
    say(`${c.yellow}      Notun ZIP download kore NOTUN folder-e extract korun.${c.reset}`);
    say("");
  }

  // 0. Node version check (Next.js 16 needs Node >= 20.9)
  if (nodeMajor() < 20) {
    say(`${c.red}[X] Your Node.js version (v${process.versions.node}) is too old.${c.reset}`);
    say(`${c.red}    This app needs Node.js 20 or newer.${c.reset}`);
    say(`${c.dim}    Fix: download the LTS version from https://nodejs.org${c.reset}`);
    say(`${c.dim}    install korun, PC ekbar restart din, abar START.bat chalate din.${c.reset}`);
    process.exit(1);
  }

  const total = 4;

  // 0. Close leftover app instances (they lock the Prisma DLL on Windows and
  //    make `prisma generate` fail with EPERM during npm install).
  freeAppInstances();

  // 1. Dependencies
  // Install when node_modules/next is missing, OR when package.json is newer
  // than the last recorded install (new dependencies were added -> npm install
  // must run once with internet to pick them up).
  const nextDir = path.join(ROOT, "node_modules", "next");
  const pkgLock = path.join(ROOT, "node_modules", ".package-lock.json");
  const needsInstall =
    !fs.existsSync(nextDir) ||
    (fs.existsSync(path.join(ROOT, "package.json")) &&
      (!fs.existsSync(pkgLock) ||
        fs.statSync(path.join(ROOT, "package.json")).mtimeMs >
          fs.statSync(pkgLock).mtimeMs));

  if (needsInstall) {
    const freshInstall = !fs.existsSync(nextDir);
    step(1, total, `${c.bold}Installing packages (npm install)...${c.reset}`);
    if (freshInstall) {
      say(`${c.dim}    First run needs internet - koyek minute somoy lagte pare, opekha korun...${c.reset}`);
    } else {
      say(`${c.dim}    Notun dependency paoa gayeche - internet lagbe, koyek minute nite pare...${c.reset}`);
    }
    // Clear read-only flags copied from backup drives - otherwise Windows
    // cannot replace files (EPERM) during install / prisma generate.
    chmodWritable(path.join(ROOT, "node_modules"));
    run(IS_WIN ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], {
      label: "npm install",
      shell: IS_WIN,
      retries: 3,
      hint:
        "1) Task Manager khule shob node.exe End Task korun (purano server lock korche), " +
        "2) Antivirus temporarily off kore dekhun, " +
        "3) Internet check kore abar START.bat double-click korun.",
    });
  } else {
    step(1, total, "Packages already installed [OK]");
  }

  // 2. Database (creates db/custom.db on first run; safe & instant afterwards)
  ensureDbLocation();
  step(2, total, "Preparing database...");
  // NOTE: "db" and "push" MUST be separate arguments - passing "db push"
  // as one string makes Prisma CLI fail with: Unknown command "db push"
  // db push regenerates the Prisma client too -> same DLL lock risk ->
  // clear read-only bits on the client folders and retry on failure.
  chmodWritable(path.join(ROOT, "node_modules", ".prisma"));
  chmodWritable(path.join(ROOT, "node_modules", "@prisma"));
  chmodWritable(path.join(ROOT, "db"));
  if (fs.existsSync(PRISMA_CLI)) {
    run(process.execPath, [PRISMA_CLI, "db", "push"], {
      label: "prisma db push",
      retries: 3,
      hint: "Database toiri korte parche na. Task Manager-e shob node.exe End Task kore, abar START.bat double-click korun.",
    });
  } else {
    say(`${c.yellow}[!] Prisma CLI not found in node_modules - trying npx fallback...${c.reset}`);
    run(IS_WIN ? "npx.cmd" : "npx", ["prisma", "db", "push"], {
      label: "prisma db push (npx)",
      shell: IS_WIN,
      retries: 3,
      hint: "npm install abar chalanor jonno node_modules folder delete kore START.bat double-click korun.",
    });
  }

  // 3. Production build (first run, or whenever the code changed)
  const buildMarker = path.join(ROOT, ".next", "BUILD_ID");
  if (shouldRebuild()) {
    const codeChanged = fs.existsSync(buildMarker);
    if (codeChanged) {
      step(3, total, `${c.bold}Code changed detected - rebuilding the app...${c.reset}`);
      say(`${c.dim}    Notun update boshano hocche. 2-5 minutes lagbe, ekbar-i lagbe.${c.reset}`);
    } else {
      step(3, total, `${c.bold}Building the app...${c.reset}`);
      say(`${c.dim}    First run: 2-5 minutes lagbe. Dhairyya dharun, ekbar-i lagbe.${c.reset}`);
    }
    chmodWritable(path.join(ROOT, ".next")); // copied .next can be read-only too
    run(process.execPath, [NEXT_CLI, "build"], {
      label: "next build",
      retries: 2,
      hint: "Build kaj kore nai. Uporer error message-ti porun. Fix: laptop e ekbar restart din, abar START.bat double-click korun.",
    });
  } else {
    step(3, total, "Build already exists [OK]");
  }

  // 4. Start local server
  const port = await pickPort();
  const url = `http://localhost:${port}`;
  step(4, total, `Starting local server: ${c.bold}${url}${c.reset}`);

  const server = spawn(process.execPath, [NEXT_CLI, "start", "-p", String(port)], {
    cwd: ROOT,
    env: childEnv({
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
    }),
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });

  const cleanup = () => {
    try {
      server.kill();
    } catch {}
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("exit", cleanup);
  server.on("exit", (code) => {
    if (code && code !== 0) {
      say(`${c.red}Server stopped (code ${code}). Window bondho na kore abar START.bat chalaban.${c.reset}`);
    }
  });

  try {
    await waitForServer(port);
  } catch {
    say(`${c.red}[X] Server is taking too long to start. Read the messages above${c.reset}`);
    say(`${c.red}    and double-click START.bat again.${c.reset}`);
    process.exit(1);
  }

  // Self-check: verify the API layer really answers after startup. If this
  // fails, the page may open but every button will show "Failed to fetch".
  try {
    const h = await fetch(`http://127.0.0.1:${port}/api/stats`, {
      signal: AbortSignal.timeout(15000),
    });
    if (h.ok) {
      say(`${c.green}>> API self-check OK - shob button kaj korbe.${c.reset}`);
    } else {
      say(`${c.yellow}[!] API self-check returned HTTP ${h.status} - jodi app-e somossa hoy,${c.reset}`);
      say(`${c.yellow}    ei window bondho kore abar START.bat chalaban.${c.reset}`);
    }
  } catch {
    say(`${c.yellow}[!] API self-check failed - server opekha korche. Koyek second por${c.reset}`);
    say(`${c.yellow}    page refresh korun; somossa hole START.bat abar chalaban.${c.reset}`);
  }

  say("");
  say(`${c.green}${c.bold}>> SERVER READY! Browser khulche 2 second er moddhe...${c.reset}`);
  await new Promise((r) => setTimeout(r, 2000)); // user-requested 2-second delay
  openBrowser(url);
  say(`${c.green}>> Browser opened: ${c.bold}${url}${c.reset}`);
  say("");
  say(`${c.dim}  * Study korar somoy ei window-ti khola rakhun - eta-i apnar local server.`);
  say(`  * Bandh korte: ei window-te Ctrl+C chapun, othoba window bondho korun.`);
  say(`  * Porerbar: shudhu START.bat double-click korun - internet lagbe na.`);
  say(`  * Shob note, file db/ folder-er bhitore save hoy - backup nite chaile`);
  say(`    shudhu db/ folder-ti copy korun.`);
  say(`${c.reset}`);
  say("");
}

// Only auto-run when executed directly (node launcher.mjs / START.bat).
// When imported as a module (e.g. for testing), main() is not triggered.
const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((err) => {
    say(`${c.red}Unexpected problem: ${err && err.message ? err.message : err}${c.reset}`);
    process.exit(1);
  });
}

export { shouldRebuild, latestSourceMtime, freeAppInstances, chmodWritable, killPortHolders };
