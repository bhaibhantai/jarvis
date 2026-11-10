import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()
const WORKSPACE = path.resolve(process.env.JARVIS_WORKSPACE || path.join(HOME, 'Documents', 'JARVIS Workspace'))
const MEMORY_FILE = path.join(process.env.JARVIS_DATA_DIR || path.join(HOME, '.jarvis'), 'memory.json')
await fs.mkdir(WORKSPACE, { recursive: true })
await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true })

const apps = {
  notepad: 'notepad.exe',
  calculator: 'calc.exe',
  calc: 'calc.exe',
  explorer: 'explorer.exe',
  files: 'explorer.exe',
  paint: 'mspaint.exe',
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  browser: 'msedge.exe',
  terminal: 'wt.exe',
  vscode: 'code.cmd',
  'visual studio code': 'code.cmd',
}

const definitions = [
  { type: 'function', function: { name: 'open_app', description: 'Open an installed Windows application. Supported: Notepad, Calculator, File Explorer, Paint, Chrome, Edge, Terminal, VS Code.', parameters: { type: 'object', properties: { app: { type: 'string', enum: Object.keys(apps) } }, required: ['app'], additionalProperties: false } } },
  { type: 'function', function: { name: 'open_url', description: 'Open a public web address in the default browser. Only http and https URLs are accepted.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false } } },
  { type: 'function', function: { name: 'system_status', description: 'Get basic Windows computer status including OS, hostname, free memory and CPU count.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  { type: 'function', function: { name: 'list_workspace', description: 'List files and folders in the JARVIS Workspace or a subfolder. This is read-only.', parameters: { type: 'object', properties: { folder: { type: 'string', description: 'Optional relative subfolder, default root.' } }, additionalProperties: false } } },
  { type: 'function', function: { name: 'search_workspace', description: 'Find files by name inside the JARVIS Workspace. This is read-only.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } },
  { type: 'function', function: { name: 'create_folder', description: 'Create a folder in the JARVIS Workspace. Requires user approval.', parameters: { type: 'object', properties: { folder: { type: 'string' } }, required: ['folder'], additionalProperties: false } } },
  { type: 'function', function: { name: 'create_text_file', description: 'Create a UTF-8 text file in the JARVIS Workspace. Requires user approval. Will not overwrite an existing file.', parameters: { type: 'object', properties: { file: { type: 'string' }, content: { type: 'string' } }, required: ['file', 'content'], additionalProperties: false } } },
  { type: 'function', function: { name: 'remember_note', description: 'Save a short user-approved note to JARVIS long-term memory. Requires user approval.', parameters: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'], additionalProperties: false } } },
  { type: 'function', function: { name: 'recall_memory', description: 'Read saved JARVIS memory notes.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
]

function safeWorkspacePath(relativePath = '') {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error('Use a relative path inside the JARVIS Workspace.')
  const target = path.resolve(WORKSPACE, relativePath)
  const rel = path.relative(WORKSPACE, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('That path is outside the JARVIS Workspace.')
  return target
}

function launch(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true, shell: false })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

async function requestApproval(ws, askId, title, detail) {
  const approvalId = 'p' + Math.random().toString(36).slice(2)
  ws.send(JSON.stringify({ type: 'approval', ask: askId, id: approvalId, title, detail }))
  return new Promise(resolve => {
    const timer = setTimeout(() => { pendingApprovals.delete(approvalId); resolve(false) }, 60000)
    pendingApprovals.set(approvalId, approved => { clearTimeout(timer); resolve(approved === true) })
  })
}
const pendingApprovals = new Map()
export function answerApproval(id, approved) {
  const resolve = pendingApprovals.get(id)
  if (!resolve) return false
  pendingApprovals.delete(id)
  resolve(approved)
  return true
}

export const toolSchemas = definitions
export const workspacePath = WORKSPACE

export async function executeDesktopTool(name, args, ws, askId) {
  switch (name) {
    case 'open_app': {
      const key = String(args.app || '').toLowerCase()
      const executable = apps[key]
      if (!executable) throw new Error('That application is not on the supported allowlist.')
      await launch(executable)
      return { ok: true, message: key + ' opened.' }
    }
    case 'open_url': {
      const url = new URL(String(args.url || ''))
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https links are allowed.')
      await launch('rundll32.exe', ['url.dll,FileProtocolHandler', url.href])
      return { ok: true, message: 'Opened ' + url.hostname + ' in the default browser.' }
    }
    case 'system_status': {
      const total = os.totalmem(), free = os.freemem()
      return { os: os.type() + ' ' + os.release(), hostname: os.hostname(), cpuCores: os.cpus().length, memoryTotalGB: +(total / 1073741824).toFixed(1), memoryFreeGB: +(free / 1073741824).toFixed(1), workspace: WORKSPACE }
    }
    case 'list_workspace': {
      const dir = safeWorkspacePath(args.folder || '')
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return { folder: path.relative(WORKSPACE, dir) || '.', entries: await Promise.all(entries.slice(0, 100).map(async e => ({ name: e.name, type: e.isDirectory() ? 'folder' : 'file' }))) }
    }
    case 'search_workspace': {
      const q = String(args.query || '').toLowerCase().slice(0, 100)
      if (!q) throw new Error('Enter a search term.')
      const found = []
      async function walk(dir, depth = 0) {
        if (depth > 5 || found.length >= 100) return
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name)
          if (e.name.toLowerCase().includes(q)) found.push(path.relative(WORKSPACE, full))
          if (e.isDirectory() && !e.isSymbolicLink()) await walk(full, depth + 1)
          if (found.length >= 100) break
        }
      }
      await walk(WORKSPACE)
      return { matches: found }
    }
    case 'create_folder': {
      const target = safeWorkspacePath(args.folder)
      if (!await requestApproval(ws, askId, 'Create folder', 'Create this folder?\n' + target)) return { ok: false, message: 'User declined the operation.' }
      await fs.mkdir(target, { recursive: true })
      return { ok: true, created: path.relative(WORKSPACE, target) }
    }
    case 'create_text_file': {
      const target = safeWorkspacePath(args.file)
      if (!/\.(txt|md|csv|json)$/i.test(target)) throw new Error('Only .txt, .md, .csv and .json files can be created by this tool.')
      if (!await requestApproval(ws, askId, 'Create text file', 'Create this new file?\n' + target + '\n\nExisting files will not be overwritten.')) return { ok: false, message: 'User declined the operation.' }
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, String(args.content ?? ''), { encoding: 'utf8', flag: 'wx' })
      return { ok: true, created: path.relative(WORKSPACE, target) }
    }
    case 'remember_note': {
      const note = String(args.note || '').trim().slice(0, 1000)
      if (!note) throw new Error('Memory note is empty.')
      if (!await requestApproval(ws, askId, 'Save to JARVIS memory', note)) return { ok: false, message: 'User declined the operation.' }
      let notes = []
      try { notes = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8')) } catch {}
      notes.push({ note, savedAt: new Date().toISOString() })
      await fs.writeFile(MEMORY_FILE, JSON.stringify(notes.slice(-200), null, 2), 'utf8')
      return { ok: true, message: 'Note saved to long-term memory.' }
    }
    case 'recall_memory': {
      try { return { notes: JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8')) } } catch { return { notes: [] } }
    }
    default: throw new Error('Unknown desktop tool: ' + name)
  }
}
