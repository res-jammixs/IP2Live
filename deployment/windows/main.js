/*
 * Hardened IP2Live Windows host for RPG Paper Maker exports.
 * The renderer receives narrow logical storage operations, never filesystem paths.
 */

import { app, BrowserWindow, dialog, globalShortcut, ipcMain } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IP2LiveStorageService } from './storage-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APPLICATION_NAME = 'IP2Live';
const isDevelopment = process.argv.includes('--dev');

function resolveLocalAppData() {
    const fromEnvironment = String(process.env.LOCALAPPDATA || '').trim();
    if (fromEnvironment && path.isAbsolute(fromEnvironment)) return path.resolve(fromEnvironment);
    const appData = path.resolve(app.getPath('appData'));
    if (process.platform === 'win32' && path.basename(appData).toLowerCase() === 'roaming') {
        return path.join(path.dirname(appData), 'Local');
    }
    return appData;
}

const localAppData = resolveLocalAppData();
const applicationRoot = path.join(localAppData, APPLICATION_NAME);
app.setName(APPLICATION_NAME);
app.setPath('userData', path.join(applicationRoot, 'Browser'));
app.setPath('sessionData', path.join(applicationRoot, 'BrowserSession'));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const storage = new IP2LiveStorageService({
    rootPath: applicationRoot,
    appVersion: app.getVersion(),
    legacySaveDirectories: [
        path.join(__dirname, 'build', 'Saves'),
    ],
});

const getBackendCachePath = () => path.join(app.getPath('userData'), 'gpu-backend');

function readBackendCache() {
    try {
        const value = readFileSync(getBackendCachePath(), 'utf8').trim();
        if (value === 'vulkan' || value === 'gl') return value;
    } catch {}
    return null;
}

const getLinuxAngleBackend = () => readBackendCache() ?? 'gl';

async function detectGLRenderer() {
    const probe = new BrowserWindow({
        width: 1,
        height: 1,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    try {
        await probe.loadURL('about:blank');
        const renderer = await probe.webContents.executeJavaScript(`(() => {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return '';
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
            } catch { return ''; }
        })();`);
        return String(renderer ?? '').trim();
    } catch {
        return '';
    } finally {
        if (!probe.isDestroyed()) probe.destroy();
    }
}

async function ensureLinuxAngleBackend() {
    if (process.platform !== 'linux' || readBackendCache() !== null) return false;
    const renderer = await detectGLRenderer();
    if (!renderer) return false;
    if (/llvmpipe|softpipe|swrast|software/i.test(renderer)) {
        writeFileSync(getBackendCachePath(), 'vulkan');
        app.relaunch();
        app.exit(0);
        return true;
    }
    writeFileSync(getBackendCachePath(), 'gl');
    return false;
}

app.commandLine.appendSwitch('high-dpi-support', 'true');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
        app.commandLine.appendSwitch('use-angle', 'metal');
        app.commandLine.appendSwitch('use-gl', 'angle');
        app.commandLine.appendSwitch('enable-features', 'Metal');
    } else {
        app.commandLine.appendSwitch('use-angle', 'gl');
    }
} else if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('ozone-platform', 'x11');
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', getLinuxAngleBackend());
}

let window = null;
let quittingAfterFlush = false;

function requireTrustedRenderer(event) {
    if (!window || window.isDestroyed() || event.sender !== window.webContents) {
        throw new Error('Rejected IPC request from an untrusted renderer.');
    }
}

function trustedHandler(handler) {
    return async (event, payload) => {
        requireTrustedRenderer(event);
        return handler(payload);
    };
}

function boundedString(value, maximumLength = 8192) {
    return String(value === undefined || value === null ? '' : value).slice(0, maximumLength);
}

function registerStorageIPC() {
    ipcMain.handle('ip2live-storage:init', trustedHandler((payload) => storage.init(payload || {})));
    ipcMain.handle('ip2live-storage:write-save', trustedHandler((payload) => storage.writeSave(payload)));
    ipcMain.handle('ip2live-storage:read-save', trustedHandler((payload) => storage.readSave(payload)));
    ipcMain.handle('ip2live-storage:read-engine-settings', trustedHandler(() => storage.readEngineSettings()));
    ipcMain.handle('ip2live-storage:write-engine-settings', trustedHandler((payload) => storage.writeEngineSettings(payload && payload.content)));
    ipcMain.handle('ip2live-storage:write-progress', trustedHandler((payload) => storage.writeProgress(payload)));
    ipcMain.handle('ip2live-storage:append-telemetry', trustedHandler((payload) => storage.appendTelemetry(payload)));
    ipcMain.handle('ip2live-storage:read-telemetry', trustedHandler((payload) => storage.readTelemetry(payload || {})));
    ipcMain.handle('ip2live-storage:save-report', trustedHandler((payload) => storage.saveReport(payload)));
    ipcMain.handle('ip2live-storage:flush', trustedHandler(() => storage.flush()));
}

function registerEngineIPC() {
    ipcMain.on('window-error', (event) => {
        try {
            requireTrustedRenderer(event);
            if (isDevelopment && window && !window.isDestroyed()) window.webContents.openDevTools({ mode: 'undocked' });
            if (window && !window.isDestroyed()) window.setFullScreen(false);
        } catch (error) {
            console.warn('[IP2Live] Blocked window-error IPC:', error.message);
        }
    });

    ipcMain.on('dialog-error-message', (event, error) => {
        try {
            requireTrustedRenderer(event);
            dialog.showMessageBox({
                title: 'IP2Live Error',
                type: 'error',
                message: boundedString(error, 12000) || 'An unknown game error occurred.',
            }).catch(console.error);
        } catch (blocked) {
            console.warn('[IP2Live] Blocked dialog IPC:', blocked.message);
        }
    });

    ipcMain.on('change-window-title', (event, title) => {
        try {
            requireTrustedRenderer(event);
            if (window && !window.isDestroyed()) window.setTitle(boundedString(title, 160));
        } catch (error) {
            console.warn('[IP2Live] Blocked title IPC:', error.message);
        }
    });

    ipcMain.on('change-window-size', (event, width, height, fullscreen) => {
        try {
            requireTrustedRenderer(event);
            const w = Math.max(320, Math.min(7680, Math.round(Number(width) || 640)));
            const h = Math.max(240, Math.min(4320, Math.round(Number(height) || 480)));
            if (!window || window.isDestroyed()) return;
            if (fullscreen === true) {
                window.setResizable(true);
                window.setFullScreen(true);
            } else {
                window.setFullScreen(false);
                window.setContentSize(w, h);
                window.center();
            }
        } catch (error) {
            console.warn('[IP2Live] Blocked window-size IPC:', error.message);
        }
    });

    // Compatibility only. The renderer path is parsed as a logical RPG Paper Maker
    // resource name; it is never resolved or used as a filesystem destination.
    ipcMain.on('save-file', (event, requestedPath, content) => {
        try {
            requireTrustedRenderer(event);
            const logicalPath = boundedString(requestedPath, 256).replace(/\\/g, '/').replace(/^\.\//, '');
            const saveMatch = /^build\/Saves\/([1-9]\d{0,2})\.json$/i.exec(logicalPath);
            if (saveMatch) {
                const raw = boundedString(content, storage.limits.maxSaveBytes + 1);
                if (Buffer.byteLength(raw, 'utf8') > storage.limits.maxSaveBytes) throw new Error('Legacy save exceeds size limit.');
                const data = JSON.parse(raw);
                storage.writeSave({
                    slot: Number(saveMatch[1]),
                    data,
                    metadata: { migratedFromLegacyEngineIPC: true, savedAt: Date.now() },
                }).catch((error) => console.error('[IP2Live] Legacy engine save failed:', error));
                return;
            }
            if (/^build\/settings-game\.json$/i.test(logicalPath)) {
                storage.writeEngineSettings(content).catch((error) => console.error('[IP2Live] Engine settings save failed:', error));
                return;
            }
            throw new Error(`Unsupported logical save target: ${logicalPath}`);
        } catch (error) {
            console.warn('[IP2Live] Rejected legacy save-file IPC:', error.message);
        }
    });
}

function createWindow() {
    window = new BrowserWindow({
        title: APPLICATION_NAME,
        width: 640,
        height: 480,
        resizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: isDevelopment,
            preload: path.join(__dirname, 'preload.cjs'),
        },
    });

    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
        const current = window && !window.isDestroyed() ? window.webContents.getURL() : '';
        if (current && url !== current) event.preventDefault();
    });
    window.webContents.on('did-finish-load', () => {
        if (!window || window.isDestroyed()) return;
        window.show();
        window.focus();
        window.webContents.focus();
    });
    window.on('closed', () => { window = null; });
    window.loadFile('index.html');
}

if (hasSingleInstanceLock) {
    app.on('second-instance', () => {
        if (!window || window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
        window.webContents.focus();
    });

    registerStorageIPC();
    registerEngineIPC();

    app.whenReady().then(async () => {
        try {
            await storage.init({ applicationId: APPLICATION_NAME });
        } catch (error) {
            dialog.showErrorBox('IP2Live Storage Error', `Local game storage could not initialize.\n\n${boundedString(error && error.message, 4000)}`);
            app.quit();
            return;
        }
        if (await ensureLinuxAngleBackend()) return;
        if (isDevelopment) {
            for (const shortcut of ['CommandOrControl+Alt+I', 'CommandOrControl+Shift+I']) {
                globalShortcut.register(shortcut, () => {
                    if (window && !window.isDestroyed()) window.webContents.openDevTools({ mode: 'undocked' });
                });
            }
        }
        createWindow();
    }).catch((error) => {
        dialog.showErrorBox('IP2Live Startup Error', boundedString(error && error.stack || error, 8000));
        app.quit();
    });

    app.on('before-quit', (event) => {
        if (quittingAfterFlush) return;
        event.preventDefault();
        quittingAfterFlush = true;
        storage.flush().finally(() => app.quit());
    });

    app.on('window-all-closed', () => app.quit());

    app.on('activate', () => {
        if (!window) createWindow();
    });

    app.on('will-quit', () => globalShortcut.unregisterAll());
}
