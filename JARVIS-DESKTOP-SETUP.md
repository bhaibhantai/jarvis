# J.A.R.V.I.S. Windows desktop build

## Desktop architecture
This branch packages the existing React holographic HUD in Electron. Electron stores the OpenRouter key using `safeStorage` (Windows DPAPI-backed encryption) and starts a local-only utility process for the OpenRouter bridge. The API key is not embedded in the renderer or committed to the repository.

## Build on Windows
1. Install Node.js 22 LTS.
2. Open PowerShell in the repository folder.
3. Run `npm install`.
4. Run `npm run desktop:dev` for the desktop development window.
5. Run `npm run desktop:dist` to create a Windows NSIS installer in `release/`.

The first launch asks for an OpenRouter API key. Create one at https://openrouter.ai/keys. The default model is `openai/gpt-4o-mini`; set `JARVIS_OPENROUTER_MODEL` before launching to select another OpenRouter model with tool-calling support.

## Implemented desktop tools
The local bridge exposes a deliberately restricted tool set:
- Open allowlisted Windows apps: Notepad, Calculator, File Explorer, Paint, Chrome, Edge, Terminal and VS Code.
- Open an HTTP or HTTPS URL in the default browser.
- Read basic system status.
- List and search files inside the dedicated J.A.R.V.I.S. Workspace.
- Create folders and new text/Markdown/CSV/JSON files inside that workspace, only after a native Windows confirmation dialog. Existing files are never overwritten.
- Save and recall short memory notes. Saving a note requires explicit confirmation.

The workspace defaults to `%USERPROFILE%\\Documents\\JARVIS Workspace`. Memory is stored locally under `%USERPROFILE%\\.jarvis\\memory.json`. Workspace paths are restricted, symbolic links are refused, and the assistant has no arbitrary shell, delete, or unrestricted filesystem tool.

## Voice and safety
The existing HUD includes microphone speech recognition and spoken responses. Electron requests microphone permission for this desktop app. Wake-word and speech-recognition availability depend on the Windows/Electron runtime and must be verified on the target machine. File writes and memory changes require an explicit native confirmation; interrupting a turn cancels a pending approval.

## Not yet implemented / not yet verified
This is an incremental desktop assistant, not a claim of complete Iron Man-style automation. Full browser DOM automation, arbitrary Windows UI control, deleting or moving arbitrary files, email/calendar integrations, smart-home control, offline wake-word reliability, and broad cross-session conversational recall still need separate implementation and testing. The current memory tool stores user-approved notes; it does not automatically remember every conversation.

## CI packaging
Windows packaging automation is configured in `.github/workflows/windows-desktop.yml`. A successful CI build proves the installer was packaged, not that every device-specific microphone, model, or desktop action has been manually tested.
