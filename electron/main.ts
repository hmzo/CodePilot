import { app, BrowserWindow, Notification, nativeImage, dialog, session, utilityProcess, ipcMain, shell, Tray, Menu } from 'electron';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import { TerminalManager } from './terminal-manager';

/**
 * Return a copy of process.env without __NEXT_PRIVATE_* variables.
 *
 * The bundled Next.js standalone server sets these at runtime
 * (e.g. __NEXT_PRIVATE_STANDALONE_CONFIG, __NEXT_PRIVATE_ORIGIN).
 * If they leak into child-process environments they cause every
 * other Next.js project on the machine to skip its own config
 * loading, breaking builds and dev servers.
 */
function sanitizedProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('__NEXT_PRIVATE_') && value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

let mainWindow: BrowserWindow | null = null;
let serverProcess: Electron.UtilityProcess | null = null;
let serverPort: number | null = null;
let serverErrors: string[] = [];
let serverExited = false;
let serverExitCode: number | null = null;
let userShellEnv: Record<string, string> = {};
let resolvedProxyEnv: Record<string, string> = {};
let isQuitting = false;
let tray: Tray | null = null;
let bgNotifyTimer: ReturnType<typeof setInterval> | null = null;

const terminalManager = new TerminalManager();

const isDev = !app.isPackaged;

/**
 * Gracefully shut down the server process.
 * Sends kill() (SIGTERM) first, waits up to 3s for exit,
 * then force-kills via process.kill(pid, SIGKILL) as fallback.
 */
function killServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    const pid = serverProcess.pid;

    const timeout = setTimeout(() => {
      // Force kill — on Windows use taskkill to kill the entire process tree
      if (pid) {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
          } else {
            process.kill(pid, 'SIGKILL');
          }
        } catch { /* already dead */ }
      }
      serverProcess = null;
      resolve();
    }, 3000);

    serverProcess.on('exit', () => {
      clearTimeout(timeout);
      serverProcess = null;
      resolve();
    });

    // On Windows, SIGTERM is not supported — use taskkill to kill the tree
    if (process.platform === 'win32' && pid) {
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
    } else {
      serverProcess.kill();
    }
  });
}

/**
 * Check if the remote bridge is currently active by querying the local API.
 */
async function isBridgeActive(): Promise<boolean> {
  if (!serverPort) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require('http');
    return await new Promise<boolean>((resolve) => {
      const req = http.get(`http://127.0.0.1:${serverPort}/api/bridge`, (res: { statusCode?: number; on: (event: string, cb: (data?: Buffer) => void) => void }) => {
        let body = '';
        res.on('data', (chunk?: Buffer) => { if (chunk) body += chunk.toString(); });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data.running === true);
          } catch {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

/**
 * Stop the remote bridge by posting to the local API.
 */
async function stopBridge(): Promise<void> {
  if (!serverPort) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require('http');
    await new Promise<void>((resolve) => {
      const postData = JSON.stringify({ action: 'stop' });
      const req = http.request({
        hostname: '127.0.0.1',
        port: serverPort,
        path: '/api/bridge',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, () => { resolve(); });
      req.on('error', () => resolve());
      req.setTimeout(3000, () => { req.destroy(); resolve(); });
      req.write(postData);
      req.end();
    });
  } catch {
    // ignore — bridge may already be stopped
  }
}

/**
 * Create a system tray icon for background bridge mode.
 * Called when all windows are closed but the bridge is still active.
 */
function createTray(): void {
  if (tray) return;

  const iconPath = getIconPath();
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('CodePilot — Bridge Active');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open CodePilot',
      click: () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow(`http://127.0.0.1:${serverPort || 3000}`);
        } else {
          mainWindow?.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Bridge Status: Active',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Stop Bridge & Quit',
      click: async () => {
        await stopBridge();
        destroyTray();
        await killServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click on tray icon opens the window (macOS/Windows)
  tray.on('double-click', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(`http://127.0.0.1:${serverPort || 3000}`);
    } else {
      mainWindow?.focus();
    }
  });
}

function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  stopBgNotifyPoll();
}

/**
 * Parse notification API response. Canonical version: src/lib/bg-notify-parser.ts
 */
function parseBgNotifications(json: string): Array<{ title: string; body: string; priority: string }> {
  try {
    const parsed = JSON.parse(json);
    const notifications: Array<{ title: string; body: string; priority: string }> = parsed.notifications || [];
    return notifications.filter((n: { title: string }) => n.title);
  } catch {
    return [];
  }
}

/**
 * Background notification poller — runs in main process when no renderer window
 * is open (tray-only mode). Drains the server-side notification queue and shows
 * native Notification directly, bypassing the renderer's useNotificationPoll.
 */
function startBgNotifyPoll(): void {
  if (bgNotifyTimer) return;
  const port = serverPort || 3000;

  bgNotifyTimer = setInterval(async () => {
    // Stop polling if a renderer window exists (frontend will handle it)
    if (BrowserWindow.getAllWindows().length > 0) {
      stopBgNotifyPoll();
      return;
    }

    try {
      const http = await import('http');
      const data = await new Promise<string>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/notifications`, (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      });

      const notifications = parseBgNotifications(data);
      for (const notif of notifications) {
        try {
          const notification = new Notification({
            title: notif.title,
            body: notif.body || '',
          });
          notification.on('click', () => {
            // Re-open the main window when user clicks the notification
            if (BrowserWindow.getAllWindows().length === 0) {
              createWindow(`http://127.0.0.1:${port}`);
            }
            mainWindow?.show();
            mainWindow?.focus();
          });
          notification.show();
        } catch { /* best effort */ }
      }
    } catch {
      // Server may not be reachable — ignore
    }
  }, 5000);
}

function stopBgNotifyPoll(): void {
  if (bgNotifyTimer) {
    clearInterval(bgNotifyTimer);
    bgNotifyTimer = null;
  }
}

/**
 * Verify that better_sqlite3.node in standalone resources is compatible
 * with this Electron runtime's ABI. If it was built for a different
 * Node.js ABI (e.g. system Node v22 ABI 127 vs Electron's ABI 143),
 * show a clear error instead of a cryptic MODULE_NOT_FOUND crash.
 */
function checkNativeModuleABI(): void {
  if (isDev) return; // Skip in dev mode

  const standaloneDir = path.join(process.resourcesPath, 'standalone');

  // Find better_sqlite3.node recursively
  function findNodeFile(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findNodeFile(fullPath);
        if (found) return found;
      } else if (entry.name === 'better_sqlite3.node') {
        return fullPath;
      }
    }
    return null;
  }

  const nodeFile = findNodeFile(path.join(standaloneDir, 'node_modules'));
  if (!nodeFile) {
    console.warn('[ABI check] better_sqlite3.node not found in standalone resources');
    return;
  }

  try {
    // Attempt to load the native module to verify ABI compatibility
    process.dlopen({ exports: {} } as NodeModule, nodeFile);
    console.log(`[ABI check] better_sqlite3.node ABI is compatible (${nodeFile})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NODE_MODULE_VERSION')) {
      console.error(`[ABI check] ABI mismatch detected: ${msg}`);
      dialog.showErrorBox(
        'CodePilot - Native Module ABI Mismatch',
        `The bundled better-sqlite3 native module was compiled for a different Node.js version.\n\n` +
        `${msg}\n\n` +
        `This usually means the build process did not correctly recompile native modules for Electron.\n` +
        `Please rebuild the application or report this issue.`
      );
      app.quit();
    } else {
      // Other load errors (missing dependencies, etc.) -- log but don't block
      console.warn(`[ABI check] Could not verify better_sqlite3.node: ${msg}`);
    }
  }
}

/**
 * Read the user's full shell environment by running a login shell.
 * When Electron is launched from Dock/Finder (macOS) or desktop launcher
 * (Linux), process.env is very limited and won't include vars from
 * .zshrc/.bashrc (e.g. API keys, nvm PATH).
 */
function loadUserShellEnv(): Record<string, string> {
  // Windows GUI apps inherit the full user environment
  if (process.platform === 'win32') {
    return {};
  }
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const result = execFileSync(shell, ['-ilc', 'env'], {
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const env: Record<string, string> = {};
    for (const line of result.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.slice(0, idx);
        const value = line.slice(idx + 1);
        env[key] = value;
      }
    }
    console.log(`Loaded ${Object.keys(env).length} env vars from user shell`);
    return env;
  } catch (err) {
    console.warn('Failed to load user shell env:', err);
    return {};
  }
}

/**
 * Resolve system proxy via Chromium's proxy resolution.
 * Chinese users often use VPN tools (Clash, Surge, etc.) that set macOS system
 * proxy but don't export HTTP_PROXY to shell env. This detects the system proxy
 * and returns env vars to inject into child processes.
 */
async function resolveSystemProxy(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  try {
    const proxyList = await session.defaultSession.resolveProxy('https://registry.npmjs.org');
    if (!proxyList || proxyList === 'DIRECT') return env;

    // Chromium returns an ordered list: "PROXY host:port; SOCKS5 host:port; DIRECT"
    // Split on ';' and use the first non-DIRECT entry.
    for (const entry of proxyList.split(';')) {
      const trimmed = entry.trim();
      if (!trimmed || trimmed === 'DIRECT') continue;

      const httpMatch = trimmed.match(/^(?:PROXY|HTTPS)\s+([\w.-]+:\d+)$/i);
      if (httpMatch) {
        env.HTTP_PROXY = `http://${httpMatch[1]}`;
        env.HTTPS_PROXY = `http://${httpMatch[1]}`;
        console.log('[proxy] System proxy detected:', env.HTTPS_PROXY);
        return env;
      }

      const socksMatch = trimmed.match(/^SOCKS5?\s+([\w.-]+:\d+)$/i);
      if (socksMatch) {
        env.HTTP_PROXY = `socks5://${socksMatch[1]}`;
        env.HTTPS_PROXY = `socks5://${socksMatch[1]}`;
        console.log('[proxy] System SOCKS proxy detected:', env.HTTPS_PROXY);
        return env;
      }
    }
  } catch (err) {
    console.warn('[proxy] Failed to resolve system proxy:', err);
  }
  return env;
}

/**
 * Check if Git Bash (bash.exe) is available on Windows.
 * Mirrors the detection logic in platform.ts:findGitBash().
 */
function findGitBashSync(): boolean {
  if (process.platform !== 'win32') return true;
  // 1. User-specified env var
  const envBash = process.env.CLAUDE_CODE_GIT_BASH_PATH || userShellEnv.CLAUDE_CODE_GIT_BASH_PATH;
  if (envBash && fs.existsSync(envBash)) return true;
  // 2. Common paths
  if (fs.existsSync('C:\\Program Files\\Git\\bin\\bash.exe')) return true;
  if (fs.existsSync('C:\\Program Files (x86)\\Git\\bin\\bash.exe')) return true;
  // 3. Derive from `where git`
  try {
    const result = execFileSync('where', ['git'], {
      timeout: 3000, encoding: 'utf-8', shell: true, stdio: 'pipe',
    });
    for (const line of result.trim().split(/\r?\n/)) {
      const gitExe = line.trim();
      if (!gitExe) continue;
      const bashPath = path.join(path.dirname(path.dirname(gitExe)), 'bin', 'bash.exe');
      if (fs.existsSync(bashPath)) return true;
    }
  } catch { /* where git failed */ }
  return false;
}

/**
 * Resolve the directory containing the bundled Claude Code binary.
 * Production: process.resourcesPath/claude. Development: <cwd>/vendor/claude-code.
 * Returns undefined if neither exists, so callers won't pollute PATH with
 * dead entries.
 */
function getBundledClaudeDir(): string | undefined {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';

  if (!isDev && process.resourcesPath) {
    const dir = path.join(process.resourcesPath, 'claude');
    if (fs.existsSync(path.join(dir, exe))) return dir;
  }

  const devDir = path.join(process.cwd(), 'vendor', 'claude-code');
  if (fs.existsSync(path.join(devDir, exe))) return devDir;

  return undefined;
}

/**
 * Build an expanded PATH that includes common locations for node, npm globals,
 * claude, nvm, homebrew, etc. The bundled Claude Code binary directory is
 * prepended so any subprocess (SDK, terminal, git hooks) resolves `claude`
 * to the version we ship.
 */
function getExpandedShellPath(): string {
  const home = os.homedir();
  const shellPath = userShellEnv.PATH || process.env.PATH || '';
  const sep = path.delimiter;
  const bundledClaudeDir = getBundledClaudeDir();
  const prefix = bundledClaudeDir ? [bundledClaudeDir] : [];

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const winExtra = [
      path.join(appData, 'npm'),
      path.join(localAppData, 'npm'),
      path.join(home, '.npm-global', 'bin'),
      path.join(home, '.local', 'bin'),
      path.join(home, '.claude', 'bin'),
    ];
    const allParts = [...prefix, shellPath, ...winExtra].join(sep).split(sep).filter(Boolean);
    return [...new Set(allParts)].join(sep);
  } else {
    const basePath = `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`;
    const raw = [
      ...prefix,
      basePath,
      `${home}/.npm-global/bin`,
      `${home}/.local/bin`,
      `${home}/.claude/bin`,
      shellPath,
    ].join(':');
    const allParts = raw.split(':').filter(Boolean);
    return [...new Set(allParts)].join(':');
  }
}

function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
  });
}

async function waitForServer(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();
  let lastError = '';
  while (Date.now() - start < timeout) {
    // If the server process already exited, fail fast
    if (serverExited) {
      throw new Error(
        `Server process exited with code ${serverExitCode}.\n\n${serverErrors.join('\n')}`
      );
    }
    try {
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const http = require('http');
        // Use options object with family:4 to force IPv4 — avoids Windows
        // IPv6 resolution issues where 127.0.0.1 may fail to connect.
        const req = http.get({
          hostname: '127.0.0.1',
          port,
          path: '/api/health',
          family: 4,
          timeout: 2000,
        }, (res: { statusCode?: number }) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', (err: Error) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('request timeout'));
        });
      });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(
    `Server startup timeout after ${timeout / 1000}s.\n\nLast health-check error: ${lastError}\n\n${serverErrors.length > 0 ? 'Server output:\n' + serverErrors.slice(-10).join('\n') : 'No server output captured.'}`
  );
}

function startServer(port: number): Electron.UtilityProcess {
  const standaloneDir = path.join(process.resourcesPath, 'standalone');
  const serverPath = path.join(standaloneDir, 'server.js');

  console.log(`Server path: ${serverPath}`);
  console.log(`Standalone dir: ${standaloneDir}`);

  serverErrors = [];
  serverExited = false;
  serverExitCode = null;

  const home = os.homedir();
  const constructedPath = getExpandedShellPath();

  const env: Record<string, string> = {
    ...userShellEnv,
    ...sanitizedProcessEnv(),
    // Ensure user shell env vars override (especially API keys)
    ...userShellEnv,
    // Inject system proxy (only if not already set in shell env)
    ...(!userShellEnv.HTTP_PROXY && !userShellEnv.HTTPS_PROXY ? resolvedProxyEnv : {}),
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    CLAUDE_GUI_DATA_DIR: path.join(home, '.codepilot'),
    HOME: home,
    USERPROFILE: home,
    PATH: constructedPath,
  };

  // Use Electron's utilityProcess to run the server in a child process
  // without spawning a separate Dock icon on macOS.
  const child = utilityProcess.fork(serverPath, [], {
    env,
    cwd: standaloneDir,
    stdio: 'pipe',
    serviceName: 'codepilot-server',
  });

  child.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    console.log(`[server] ${msg}`);
    serverErrors.push(msg);
  });

  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    console.error(`[server:err] ${msg}`);
    serverErrors.push(msg);
  });

  child.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
    serverExited = true;
    serverExitCode = code;
    serverProcess = null;
  });

  return child;
}

function getIconPath(): string {
  if (isDev) {
    return path.join(process.cwd(), 'build', 'icon.png');
  }
  if (process.platform === 'win32') {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  if (process.platform === 'linux') {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(process.resourcesPath, 'icon.icns');
}

/** Inline loading HTML shown while the server starts up */
const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0a0a0a; color: #a0a0a0;
    -webkit-app-region: drag;
  }
  .container { text-align: center; }
  .spinner {
    width: 28px; height: 28px; margin: 0 auto 14px;
    border: 2.5px solid rgba(255,255,255,0.1);
    border-top-color: rgba(255,255,255,0.5);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { font-size: 13px; opacity: 0.7; }
</style>
</head>
<body>
<div class="container">
  <div class="spinner"></div>
  <p>Starting CodePilot...</p>
</div>
</body>
</html>`)}`;

function createWindow(url?: string) {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 600,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.vibrancy = 'sidebar';
  } else if (process.platform === 'win32') {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#00000000',
      symbolColor: '#888888',
      height: 44,
    };
  }

  mainWindow = new BrowserWindow(windowOptions);

  // External links: open in system default browser instead of Electron
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      shell.openExternal(targetUrl);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    // Allow navigating within the app (localhost dev server)
    const appOrigin = new URL(mainWindow!.webContents.getURL()).origin;
    if (new URL(targetUrl).origin !== appOrigin) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.loadURL(url || LOADING_HTML);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Load user's full shell environment (API keys, PATH, etc.)
  userShellEnv = loadUserShellEnv();

  // Detect system proxy for Chinese users behind VPN (Clash, Surge, etc.)
  resolvedProxyEnv = await resolveSystemProxy();

  // Verify native module ABI compatibility before starting the server
  checkNativeModuleABI();

  // Clear cache on version upgrade
  const currentVersion = app.getVersion();
  const versionFilePath = path.join(app.getPath('userData'), 'last-version.txt');
  try {
    const lastVersion = fs.existsSync(versionFilePath)
      ? fs.readFileSync(versionFilePath, 'utf-8').trim()
      : '';
    if (lastVersion && lastVersion !== currentVersion) {
      console.log(`Version changed from ${lastVersion} to ${currentVersion}, clearing cache...`);
      await session.defaultSession.clearCache();
      await session.defaultSession.clearStorageData({
        storages: ['cachestorage', 'serviceworkers'],
      });
      console.log('Cache cleared successfully');
    }
    fs.writeFileSync(versionFilePath, currentVersion, 'utf-8');
  } catch (err) {
    console.warn('Failed to check/clear version cache:', err);
  }

  // Set macOS Dock icon
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = getIconPath();
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  // --- Install IPC handlers ---
  // Claude Code itself ships bundled with CodePilot (see scripts/before-pack.js
  // + electron-builder.yml), so the only end-user-triggerable install action
  // left here is bootstrapping Git for Windows on machines that lack it.
  ipcMain.handle('install:git', async () => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Git installation is only needed on Windows' };
    }
    try {
      const expandedPath = getExpandedShellPath();
      const execEnv = { ...sanitizedProcessEnv(), ...userShellEnv, PATH: expandedPath };

      const result = await new Promise<{ success: boolean; output: string }>((resolve) => {
        let output = '';
        const child = spawn('winget', [
          'install', 'Git.Git',
          '--silent',
          '--accept-package-agreements',
          '--accept-source-agreements',
        ], {
          env: execEnv,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
        child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });
        child.on('error', (err) => { resolve({ success: false, output: err.message }); });
        child.on('close', (code) => { resolve({ success: code === 0, output: output.trim() }); });
      });

      return result;
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  });

  // --- End install IPC handlers ---

  // Open a folder in the system file manager (Finder / Explorer)
  ipcMain.handle('shell:open-path', async (_event: Electron.IpcMainInvokeEvent, folderPath: string) => {
    return shell.openPath(folderPath);
  });

  // Reveal a file/folder in the system file manager (selects it in parent folder)
  ipcMain.handle('shell:show-item-in-folder', async (_event: Electron.IpcMainInvokeEvent, itemPath: string) => {
    shell.showItemInFolder(itemPath);
    return { ok: true };
  });

  // Bridge status IPC
  ipcMain.handle('bridge:is-active', async () => {
    return isBridgeActive();
  });

  // Native folder picker dialog
  ipcMain.handle('dialog:open-folder', async (_event, options?: { defaultPath?: string; title?: string }) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title || 'Select a project folder',
      defaultPath: options?.defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  // --- Widget export IPC handler ---
  // Uses an isolated BrowserWindow for secure, high-fidelity widget screenshot.
  // The window is hidden, has its own session partition, no preload, no IPC access.
  ipcMain.handle('widget:export-png', async (_event, { html, width }: { html: string; width: number }) => {
    const exportWindow = new BrowserWindow({
      show: false,
      width,
      height: 2000,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: `export-${Date.now()}`, // isolated session, destroyed with window
        // No preload — no IPC access from this window
      },
    });

    // Block all navigation and window.open — prevents data exfiltration via top-level nav
    exportWindow.webContents.on('will-navigate', (e) => e.preventDefault());
    exportWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    try {
      // Load the widget HTML directly
      await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      // Wait for widget scripts to finish (scriptsReady signal or timeout)
      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };
        // Listen for console message from widget:scriptsReady
        exportWindow.webContents.on('console-message', (_e, _level, message) => {
          if (message === '__scriptsReady__') done();
        });
        // Fallback timeout for widgets without CDN/scripts
        setTimeout(done, 6000);
      });

      // Extra delay for final paint
      await new Promise(r => setTimeout(r, 300));

      // Get actual content height and resize
      const contentHeight = await exportWindow.webContents.executeJavaScript('document.body.scrollHeight');
      exportWindow.setSize(width, Math.min(contentHeight + 20, 4000));
      await new Promise(r => setTimeout(r, 100));

      // Capture using Chromium's native screenshot
      const image = await exportWindow.webContents.capturePage();
      return image.toPNG().toString('base64');
    } finally {
      exportWindow.destroy();
    }
  });

  // --- Terminal IPC handlers ---
  terminalManager.setOnData((id, data) => {
    mainWindow?.webContents.send('terminal:data', { id, data });
  });

  terminalManager.setOnExit((id, code) => {
    mainWindow?.webContents.send('terminal:exit', { id, code });
  });

  ipcMain.handle('terminal:create', async (_event, opts: { id: string; cwd: string; cols: number; rows: number }) => {
    terminalManager.create(opts.id, {
      cwd: opts.cwd,
      cols: opts.cols,
      rows: opts.rows,
      env: userShellEnv,
    });
  });

  ipcMain.on('terminal:write', (_event, data: { id: string; data: string }) => {
    terminalManager.write(data.id, data.data);
  });

  ipcMain.handle('terminal:resize', async (_event, data: { id: string; cols: number; rows: number }) => {
    terminalManager.resize(data.id, data.cols, data.rows);
  });

  ipcMain.handle('terminal:kill', async (_event, id: string) => {
    terminalManager.kill(id);
  });

  // --- End terminal IPC handlers ---

  // --- Notification IPC handler ---
  ipcMain.handle('notification:show', async (_event, options: {
    title: string;
    body: string;
    onClick?: { type: string; payload: string };
  }) => {
    try {
      const notification = new Notification({
        title: options.title,
        body: options.body || '',
      });
      if (options.onClick) {
        notification.on('click', () => {
          mainWindow?.show();
          mainWindow?.focus();
          mainWindow?.webContents.send('notification:click', options.onClick);
        });
      }
      notification.show();
      return true;
    } catch (err) {
      console.error('[notification] Failed to show:', err);
      return false;
    }
  });

  // Proxy resolution IPC — allows renderer/API routes to query system proxy
  ipcMain.handle('proxy:resolve', async (_event, url: string) => {
    try {
      return await session.defaultSession.resolveProxy(url);
    } catch {
      return 'DIRECT';
    }
  });

  try {
    let port: number;

    if (isDev) {
      port = 3000;
      console.log(`Dev mode: connecting to http://127.0.0.1:${port}`);
      serverPort = port;
      createWindow(`http://127.0.0.1:${port}`);
    } else {
      port = await getPort();
      console.log(`Starting server on port ${port}...`);
      serverProcess = startServer(port);
      serverPort = port;

      // Show window immediately with loading screen
      createWindow();

      // Wait for server in background, then navigate to real URL
      await waitForServer(port);
      console.log('Server is ready');
      if (mainWindow) {
        mainWindow.loadURL(`http://127.0.0.1:${port}`);
      }

      // Trigger bridge auto-start via explicit POST (only checks setting once)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const http = require('http');
      const autoStartData = JSON.stringify({ action: 'auto-start' });
      const autoStartReq = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/bridge',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(autoStartData),
        },
      }, () => {});
      autoStartReq.on('error', () => {});
      autoStartReq.write(autoStartData);
      autoStartReq.end();
    }

  } catch (err) {
    console.error('Failed to start:', err);
    dialog.showErrorBox(
      'CodePilot - Failed to Start',
      `The internal server could not start.\n\n${err instanceof Error ? err.message : String(err)}\n\nPlease try restarting the application.`
    );
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  // If bridge is active, keep the server running and show a tray icon
  const bridgeActive = await isBridgeActive();
  if (bridgeActive) {
    console.log('Bridge is active — keeping server alive in background with tray icon');
    createTray();
    // Start background notification polling since no renderer will be available
    startBgNotifyPoll();
    return;
  }

  destroyTray();
  await killServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  // If tray is active (bridge background mode), destroy it when user re-opens
  destroyTray();

  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      if (!isDev && !serverProcess) {
        const port = await getPort();
        serverProcess = startServer(port);
        // Show loading window immediately
        createWindow();
        await waitForServer(port);
        serverPort = port;
        if (mainWindow) {
          mainWindow.loadURL(`http://127.0.0.1:${port}`);
        }
      } else {
        createWindow(`http://127.0.0.1:${serverPort || 3000}`);
      }

    } catch (err) {
      console.error('Failed to restart server:', err);
    }
  }
});

app.on('before-quit', async (e) => {
  // Kill all terminal processes
  terminalManager.killAll();

  destroyTray();

  if (serverProcess && !isQuitting) {
    isQuitting = true;
    e.preventDefault();
    // Stop bridge gracefully before killing the server
    await stopBridge();
    await killServer();
    app.quit();
  }
});
