'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const ENGINE_SEND_CHANNELS = new Set([
    'window-error',
    'dialog-error-message',
    'change-window-title',
    'change-window-size',
    'save-file',
]);

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('ipcRenderer', Object.freeze({
    send(channel, ...args) {
        if (!ENGINE_SEND_CHANNELS.has(channel)) {
            throw new Error(`Blocked RPG Paper Maker IPC channel: ${String(channel)}`);
        }
        ipcRenderer.send(channel, ...args);
    },
}));

contextBridge.exposeInMainWorld('ip2liveStorage', Object.freeze({
    init(options) {
        return invoke('ip2live-storage:init', options || {});
    },
    writeSave(payload) {
        return invoke('ip2live-storage:write-save', payload);
    },
    readSave(payload) {
        return invoke('ip2live-storage:read-save', payload);
    },
    readEngineSettings() {
        return invoke('ip2live-storage:read-engine-settings');
    },
    writeEngineSettings(content) {
        return invoke('ip2live-storage:write-engine-settings', { content: String(content || '') });
    },
    writeProgress(payload) {
        return invoke('ip2live-storage:write-progress', payload);
    },
    appendTelemetry(payload) {
        return invoke('ip2live-storage:append-telemetry', payload);
    },
    readTelemetry(payload) {
        return invoke('ip2live-storage:read-telemetry', payload || {});
    },
    saveReport(payload) {
        return invoke('ip2live-storage:save-report', payload);
    },
    flush() {
        return invoke('ip2live-storage:flush');
    },
}));
