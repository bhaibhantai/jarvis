# J.A.R.V.I.S. Windows desktop build

## Current desktop foundation
This branch adds an Electron shell, a Windows-encrypted OpenRouter key setup window, and a local loopback-only OpenRouter streaming bridge. The existing React HUD is loaded inside the desktop window.

## Build on Windows
1. Install Node.js 22 LTS.
2. Open PowerShell in the repository folder.
3. Run `npm install`.
4. Run `npm run desktop:dev` for the desktop development window.
5. Run `npm run desktop:dist` to create a Windows installer in `release/`.

The first launch asks for an OpenRouter API key. Create one at https://openrouter.ai/keys. The key is encrypted with Electron safeStorage (Windows DPAPI-backed storage) and passed only to the local bridge process; it is not stored in source files or browser storage.

## AI model
Default: `openai/gpt-4o-mini`. Override with `JARVIS_OPENROUTER_MODEL` in the process environment.

## Important capability boundary
This first desktop integration enables streamed OpenRouter conversation in the existing HUD. It does not yet port the Claude Agent SDK's MCP tool execution, browser automation, native Windows control, or persistent cross-session memory. Those capabilities need dedicated OpenRouter-compatible tools and explicit permission gates; the interface must not imply they are already active.


Windows packaging automation is configured in `.github/workflows/windows-desktop.yml`.
