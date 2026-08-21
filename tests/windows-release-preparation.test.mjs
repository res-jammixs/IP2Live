import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseScript = path.join(repositoryRoot, 'tools', 'prepare-windows-release.ps1');

async function write(root, relativePath, content = '') {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
}

function runPowerShell(argumentsList) {
    return new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', releaseScript,
            ...argumentsList,
        ], { cwd: repositoryRoot, windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

test('prepares a clean release and exactly replaces the exported project plugin', async (t) => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ip2live-release-test-'));
    t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
    const source = path.join(temporaryRoot, 'source-export');
    const project = path.join(temporaryRoot, 'project');
    const destination = path.join(temporaryRoot, 'prepared-release');

    await write(source, 'Game.exe');
    await write(source, 'resources/app/index.html', '<html></html>');
    await write(source, 'resources/app/main.js', "window.loadFile('index.html');\n");
    await write(source, 'resources/app/preload.js', "window.ipcRenderer = require('electron').ipcRenderer;\n");
    await write(source, 'resources/app/package.json', JSON.stringify({
        name: 'game', version: '1.0.0', main: 'main.js', type: 'module',
    }));
    await write(
        source,
        'resources/app/build/Scripts/Common/Platform.js',
        'window.ipcRenderer.send("save-file"); static async registerSave() {}\n',
    );
    await write(source, 'resources/app/build/Plugins/IP2Live_Core/code.js', '// stale export\n');
    await write(source, 'resources/app/build/Plugins/IP2Live_Core/stale.js', '// must not survive sync\n');
    await write(source, 'resources/app/build/Saves/1.json', '{}');
    await write(source, 'resources/app/build/Saves/readme.txt', 'runtime directory placeholder');
    await write(source, '.git/config', 'must not ship');
    await write(source, 'resources/app/build/nested/.git/config', 'must not ship either');

    const projectSongs = {
        list: [{ k: 1, v: [
            { id: -1, name: '<None>', br: true },
            { id: 1, name: 'Custom Track.mp3', br: false },
        ] }],
    };
    await write(project, 'songs.json', JSON.stringify(projectSongs));
    await write(project, 'Plugins/IP2Live_Core/code.js', "const DesktopStorageReady = 'desktop_storage.js';\n");
    await write(project, 'Plugins/IP2Live_Core/modules/desktop_storage.js', '// current bridge\n');
    await write(project, 'Plugins/IP2Live_Core/current.js', '// current project plugin\n');
    await write(project, 'Plugins/IP2Live_Core/.git/config', 'must not ship');
    await write(source, 'resources/app/build/songs.json', JSON.stringify({
        list: [{ k: 1, v: [{ id: 1, name: 'Custom Track.mp3', data: 'ZmFrZQ==' }] }],
    }));

    const result = await runPowerShell([
        '-SourceExportPath', source,
        '-DestinationPath', destination,
        '-ProjectRoot', project,
        '-ReleaseVersion', '2.3.4',
    ]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);

    const appRoot = path.join(destination, 'resources', 'app');
    await fs.access(path.join(appRoot, 'main.js'));
    await fs.access(path.join(appRoot, 'preload.cjs'));
    await fs.access(path.join(appRoot, 'storage-service.js'));
    const preparedPreload = await fs.readFile(path.join(appRoot, 'preload.cjs'), 'utf8');
    const preparedMain = await fs.readFile(path.join(appRoot, 'main.js'), 'utf8');
    assert.match(preparedPreload, /readEngineSettings/);
    assert.match(preparedPreload, /writeEngineSettings/);
    assert.match(preparedMain, /ip2live-storage:read-engine-settings/);
    assert.match(preparedMain, /ip2live-storage:write-engine-settings/);
    assert.match(preparedMain, /requestSingleInstanceLock\(\)/);
    assert.match(preparedMain, /app\.on\('second-instance'/);
    assert.match(preparedMain, /window\.isMinimized\(\).*window\.restore\(\)/s);
    assert.match(preparedMain, /window\.show\(\).*window\.focus\(\).*window\.webContents\.focus\(\)/s);
    assert.ok(
        preparedMain.indexOf('requestSingleInstanceLock()') < preparedMain.lastIndexOf('registerStorageIPC();'),
        'the single-instance lock must be requested before IPC and normal startup registration',
    );
    await assert.rejects(fs.access(path.join(appRoot, 'preload.js')));
    await assert.rejects(fs.access(path.join(destination, '.git')));
    await assert.rejects(fs.access(path.join(appRoot, 'build', 'nested', '.git')));
    await assert.rejects(fs.access(path.join(appRoot, 'build', 'Saves', '1.json')));
    await fs.access(path.join(appRoot, 'build', 'Saves', 'readme.txt'));

    const pluginRoot = path.join(appRoot, 'build', 'Plugins', 'IP2Live_Core');
    await fs.access(path.join(pluginRoot, 'current.js'));
    await fs.access(path.join(pluginRoot, 'modules', 'desktop_storage.js'));
    await assert.rejects(fs.access(path.join(pluginRoot, 'stale.js')));
    await assert.rejects(fs.access(path.join(pluginRoot, '.git')));

    const packageDocument = JSON.parse(await fs.readFile(path.join(appRoot, 'package.json'), 'utf8'));
    assert.equal(packageDocument.name, 'ip2live');
    assert.equal(packageDocument.productName, 'IP2Live');
    assert.equal(packageDocument.version, '2.3.4');

    const manifest = JSON.parse(await fs.readFile(path.join(appRoot, 'ip2live-runtime-manifest.json'), 'utf8'));
    assert.equal(manifest.projectPluginSynced, true);
    assert.deepEqual(manifest.verifiedCustomSongs, ['Custom Track.mp3']);
});

test('stops with re-export guidance when a registered custom song is absent', async (t) => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ip2live-song-test-'));
    t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
    const source = path.join(temporaryRoot, 'source-export');
    const project = path.join(temporaryRoot, 'project');
    const destination = path.join(temporaryRoot, 'prepared-release');

    await write(source, 'Game.exe');
    await write(source, 'resources/app/index.html');
    await write(source, 'resources/app/main.js', "loadFile('index.html')\n");
    await write(source, 'resources/app/preload.js');
    await write(source, 'resources/app/package.json', JSON.stringify({ name: 'game', main: 'main.js', type: 'module' }));
    await write(source, 'resources/app/build/Scripts/Common/Platform.js', 'window.ipcRenderer.send(); static async registerSave() {}');
    await write(source, 'resources/app/build/Plugins/IP2Live_Core/code.js');
    await write(source, 'resources/app/build/songs.json', JSON.stringify({ list: [] }));
    await write(project, 'songs.json', JSON.stringify({
        list: [{ k: 1, v: [{ id: 1, name: 'Missing Music.mp3', br: false }] }],
    }));
    await write(project, 'Plugins/IP2Live_Core/code.js', "const DesktopStorageReady = 'desktop_storage.js';");
    await write(project, 'Plugins/IP2Live_Core/modules/desktop_storage.js');

    const result = await runPowerShell([
        '-SourceExportPath', source,
        '-DestinationPath', destination,
        '-ProjectRoot', project,
    ]);
    assert.notEqual(result.code, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Re-export after registering songs\s+in RPG Paper Maker/);
    await assert.rejects(fs.access(destination));
});
