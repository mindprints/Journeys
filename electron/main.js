'use strict';

const {
  app, BrowserWindow, Menu, dialog, ipcMain, shell,
} = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Env ───────────────────────────────────────────────────────────────────────

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

// db is required early; server is required lazily inside app.whenReady()
// so we can open the project DB before server.js evaluates its own db.open() guard.
const db = require('../db');

// ── State ─────────────────────────────────────────────────────────────────────

let mainWindow     = null;
let settingsWindow = null;
let serverPort     = null;
let currentDbPath  = null;

const APP_ROOT        = path.join(__dirname, '..');
const DEFAULT_DB      = path.join(APP_ROOT, 'library.journey');
const SETTINGS_PATH   = path.join(app.getPath('userData'), 'journeys-settings.json');
const API_KEYS_PATH   = path.join(app.getPath('userData'), 'journeys-apikeys.json');
const JOURNEY_FILTER  = [{ name: 'Journeys Project', extensions: ['journey'] }];

const KEY_DEFAULTS = {
  OPENROUTER_API_KEY:       '',
  OPENROUTER_CONTENT_MODEL: 'openai/gpt-4o-mini',
  OPENROUTER_IMAGE_MODEL:   'google/gemini-3.1-flash-image-preview',
  OPENROUTER_TOPIC_MODEL:   'minimax/minimax-m2.7',
  OPENROUTER_MODEL:         '',
  BRAVE_API_KEY:            '',
  OPENVERSE_CLIENT_ID:      '',
  OPENVERSE_CLIENT_SECRET:  '',
};

// ── Project settings (last-open project) ─────────────────────────────────────

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2)); } catch (_) {}
}

// ── API key storage ───────────────────────────────────────────────────────────

function loadApiKeys() {
  try {
    const stored = JSON.parse(fs.readFileSync(API_KEYS_PATH, 'utf8'));
    return { ...KEY_DEFAULTS, ...stored };
  } catch { return { ...KEY_DEFAULTS }; }
}

function persistApiKeys(keys) {
  const merged = { ...KEY_DEFAULTS, ...keys };
  try { fs.writeFileSync(API_KEYS_PATH, JSON.stringify(merged, null, 2)); } catch (_) {}
  // Inject into process.env so server.js and any future spawns pick up the new values immediately
  for (const [k, v] of Object.entries(merged)) {
    if (v) process.env[k] = v;
  }
}

function injectApiKeys() {
  // Load from userData and inject into process.env, overriding .env values so the
  // Settings screen is always authoritative in the packaged app.
  for (const [k, v] of Object.entries(loadApiKeys())) {
    if (v) process.env[k] = v;
  }
}

// ── Settings window ───────────────────────────────────────────────────────────

function openSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 620, height: 740,
    parent: mainWindow || undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox:          true,
    },
    title:     'Settings — Journeys',
    show:      false,
    resizable: false,
  });
  settingsWindow.loadURL(`http://127.0.0.1:${serverPort}/settings.html`);
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.setMenu(null);
}

ipcMain.handle('settings:get-keys', () => loadApiKeys());
ipcMain.handle('settings:save-keys', (_e, keys) => { persistApiKeys(keys); return { ok: true }; });

// ── Project switching ─────────────────────────────────────────────────────────

function projectNameFrom(dbPath) {
  return path.basename(dbPath, '.journey');
}

function updateWindowTitle() {
  if (!mainWindow || !currentDbPath) return;
  mainWindow.setTitle(`${projectNameFrom(currentDbPath)} — Journeys`);
}

function openProject(dbPath) {
  db.open(dbPath);
  currentDbPath = dbPath;
  saveSettings({ lastProject: dbPath });
  updateWindowTitle();
  autoImportIfEmpty();
  db.migrateAssetsFromDisk(APP_ROOT);
  if (mainWindow) mainWindow.webContents.reload();
  console.log(`[project] opened: ${dbPath}`);
}

function switchProject(dbPath) {
  // Close current, open new — data already on disk (synchronous SQLite writes)
  db.close();
  openProject(dbPath);
}

// ── Auto-import on new/empty DB ───────────────────────────────────────────────

function autoImportIfEmpty() {
  if (db.postersAll().length > 0) return;
  console.log('[electron] DB is empty — auto-importing from JSON files...');
  const jsonDirs = [
    path.join(APP_ROOT, 'ai_posters'),
    path.join(APP_ROOT, 'JSON_Posters', 'Posters'),
  ];
  for (const dir of jsonDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        if (data.version || data.front || data.figure || data.title) db.importPosterJson(file, data);
      } catch (_) {}
    }
  }
  const cfgPath = path.join(APP_ROOT, 'JSON_Posters', 'category-config.json');
  if (fs.existsSync(cfgPath)) {
    try { db.importCategoryConfig(JSON.parse(fs.readFileSync(cfgPath, 'utf8'))); } catch (_) {}
  }
  const journeysDir = path.join(APP_ROOT, 'JSON_Posters', 'Journeys');
  if (fs.existsSync(journeysDir)) {
    for (const file of fs.readdirSync(journeysDir).filter(f => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(journeysDir, file), 'utf8'));
        if (data.name && Array.isArray(data.posters)) db.saveJourney(file, data);
      } catch (_) {}
    }
  }
  console.log(`[electron] auto-imported ${db.postersAll().length} posters`);
}

// ── File dialog handlers ──────────────────────────────────────────────────────

async function handleNew() {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title:       'New Journeys Project',
    defaultPath: path.join(app.getPath('documents'), 'untitled.journey'),
    filters:     JOURNEY_FILTER,
  });
  if (canceled || !filePath) return;
  // If the file already exists delete it so we get a clean DB
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  switchProject(filePath);
}

async function handleOpen() {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title:       'Open Journeys Project',
    defaultPath: app.getPath('documents'),
    filters:     JOURNEY_FILTER,
    properties:  ['openFile'],
  });
  if (canceled || !filePaths.length) return;
  switchProject(filePaths[0]);
}

async function handleSaveAs() {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title:       'Save Project As…',
    defaultPath: path.join(
      path.dirname(currentDbPath || app.getPath('documents')),
      projectNameFrom(currentDbPath || 'untitled') + '-copy.journey'
    ),
    filters: JOURNEY_FILTER,
  });
  if (canceled || !filePath) return;
  // VACUUM INTO makes a clean compacted copy of the current DB
  db.raw().prepare('VACUUM INTO ?').run(filePath);
  switchProject(filePath);
}

// ── IPC (called from renderer via preload bridge) ─────────────────────────────

ipcMain.handle('project:new',    () => handleNew());
ipcMain.handle('project:open',   () => handleOpen());
ipcMain.handle('project:saveAs', () => handleSaveAs());
ipcMain.handle('project:name',   () => currentDbPath ? projectNameFrom(currentDbPath) : 'Journeys');

// ── Native menu ───────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label:       'New Project…',
          accelerator: 'CmdOrCtrl+N',
          click:       () => handleNew(),
        },
        {
          label:       'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click:       () => handleOpen(),
        },
        {
          label:       'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click:       () => handleSaveAs(),
        },
        { type: 'separator' },
        {
          label:       'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click:       () => openSettingsWindow(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Window ────────────────────────────────────────────────────────────────────

const APP_ICON = path.join(__dirname, '..', 'logos', 'app.ico');

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox:          true,
    },
    title: 'Journeys',
    icon:  APP_ICON,
    show:  false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
  mainWindow.once('ready-to-show', () => {
    updateWindowTitle();
    mainWindow.show();
  });

  // External links → system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Startup ───────────────────────────────────────────────────────────────────

function resolveStartupProject() {
  // 1. File passed as CLI arg (double-click .journey in Explorer)
  const argFile = process.argv.slice(app.isPackaged ? 1 : 2).find(a => a.endsWith('.journey'));
  if (argFile && fs.existsSync(argFile)) return argFile;

  // 2. Last opened project (if it still exists)
  const settings = loadSettings();
  if (settings.lastProject && fs.existsSync(settings.lastProject)) return settings.lastProject;

  // 3. Packaged: copy seed library.journey from resources to userData (writable) on first run
  if (app.isPackaged) {
    const userLib = path.join(app.getPath('userData'), 'library.journey');
    if (!fs.existsSync(userLib)) {
      const seed = path.join(process.resourcesPath, 'library.journey');
      if (fs.existsSync(seed)) fs.copyFileSync(seed, userLib);
    }
    return userLib;
  }

  // 4. Dev: repo root library.journey
  return DEFAULT_DB;
}

// Enforce single instance so double-clicking a .journey file focuses the
// existing window rather than opening a second app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.journeys.app');
  buildMenu();

  // Open the project DB BEFORE requiring server.js so its db.isOpen() guard
  // sees the DB as already open and skips the standalone auto-open.
  const startupDb = resolveStartupProject();
  db.open(startupDb);
  currentDbPath = startupDb;
  saveSettings({ lastProject: startupDb });
  autoImportIfEmpty();

  // Inject API keys from userData before the server loads so all env-reads see them
  injectApiKeys();

  // Lazy-require server AFTER db is open so its guard doesn't double-open
  const { startServer } = require('../server');
  serverPort = await startServer(0);

  createWindow(serverPort);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(serverPort);
  });
});

// Handle .journey files opened via Windows "Open with" after app is already running
app.on('second-instance', (_event, argv) => {
  const argFile = argv.find(a => a.endsWith('.journey'));
  if (argFile && fs.existsSync(argFile)) switchProject(argFile);
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
