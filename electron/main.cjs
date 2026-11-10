const { app, BrowserWindow, ipcMain, safeStorage, dialog, utilityProcess, session } = require('electron')
const { join } = require('node:path')
const fs = require('node:fs')

let mainWindow
let keyWindow
let bridge
const keyFile = join(app.getPath('userData'), 'openrouter-key.bin')

function readKey() {
  if (!fs.existsSync(keyFile) || !safeStorage.isEncryptionAvailable()) return ''
  try { return safeStorage.decryptString(fs.readFileSync(keyFile)) } catch { return '' }
}
function saveKey(key) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.')
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(keyFile, safeStorage.encryptString(key), { mode: 0o600 })
}
function startBridge() {
  if (bridge) return
  bridge = utilityProcess.fork(join(__dirname, '..', 'bridge', 'openrouter-server.mjs'), [], {
    env: { ...process.env, OPENROUTER_API_KEY: readKey() },
    stdio: 'inherit', serviceName: 'JARVIS Local Desktop Agent',
  })
  bridge.once('exit', () => { bridge = null })
}
function createKeyWindow() {
  const win = new BrowserWindow({
    width: 520, height: 390, resizable: false, autoHideMenuBar: true,
    backgroundColor: '#06111d',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  keyWindow = win
  win.loadFile(join(__dirname, 'key.html'))
  return win
}
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1050, minHeight: 700,
    title: 'J.A.R.V.I.S.', backgroundColor: '#01060c',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'))
}
ipcMain.handle('jarvis:key-status', () => Boolean(readKey()))
ipcMain.handle('jarvis:save-key', (_event, key) => {
  if (typeof key !== 'string' || !key.startsWith('sk-or-') || key.length < 20) throw new Error('Enter a valid OpenRouter API key.')
  saveKey(key.trim())
  if (bridge) { bridge.kill(); bridge = null }
  startBridge()
  if (keyWindow && !keyWindow.isDestroyed()) keyWindow.close()
  createMainWindow()
  return true
})
ipcMain.handle('jarvis:open-settings', () => createKeyWindow())
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'microphone' || permission === 'camera')
  })
  if (!safeStorage.isEncryptionAvailable()) {
    dialog.showErrorBox('Secure storage unavailable', 'J.A.R.V.I.S. cannot securely store your OpenRouter key on this Windows account.')
    app.quit(); return
  }
  if (!readKey()) createKeyWindow()
  else { startBridge(); createMainWindow() }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { if (bridge) bridge.kill() })
