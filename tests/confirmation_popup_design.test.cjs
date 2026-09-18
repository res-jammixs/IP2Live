const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const popupPath = path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'screens', 'confir-popup.js');
const source = fs.readFileSync(popupPath, 'utf8');

assert.match(source, /const panelW = 560/);
assert.match(source, /const panelH = this\.value \? 286 : 232/);
assert.match(source, /oxaniumMediumLoaded/);
assert.match(source, /_drawBevelFacets\(/);
assert.match(source, /_drawCornerArmor\(/);
assert.match(source, /const confirmAccent = this\.danger \? '#FF003C' : '#FFE600'/);
assert.doesNotMatch(source, /systemLabel|SYS::|ESC \/\/|ENTER \/\/|monospace/);

class BaseScene {
    constructor() {
        if (typeof this.initialize === 'function') this.initialize();
    }
}

const context = {
    console,
    window: {},
    Scene: { Base: BaseScene },
    Common: {
        ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 },
        Platform: { ctx: { canvas: { width: 1920, height: 1080 } } },
    },
    IP2Live: {},
    Manager: { Stack: { requestPaintHUD: false } },
    Data: {},
};
vm.runInNewContext(source, context);

const Popup = context.window.confirPopup;
const identityPopup = new Popup({
    title: 'CONFIRM NAME',
    value: 'Siton_G01',
    danger: false,
});
const identityLayout = identityPopup._layout();
assert.equal(identityLayout.panelW, 560);
assert.equal(identityLayout.panelH, 286);
assert.equal(identityLayout.cancel.w, 172);
assert.equal(identityLayout.confirm.w, 172);
assert.ok(identityLayout.confirm.x > identityLayout.cancel.x + identityLayout.cancel.w);

const quitPopup = new Popup({ title: 'QUIT GAME?', danger: true });
const quitLayout = quitPopup._layout();
assert.equal(quitLayout.panelH, 232);
assert.equal(quitPopup.danger, true);
assert.deepEqual(Array.from(quitPopup.buttonMix), [1, 0]);

for (const relativePath of [
    'Plugins/IP2Live_Core/modules/screens/name-input.js',
    'Plugins/IP2Live_Core/modules/screens/main-menu.js',
    'Plugins/IP2Live_Core/modules/screens/pause-menu.js',
    'Plugins/IP2Live_Core/modules/screens/load-game.js',
]) {
    const callerSource = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(callerSource, /systemLabel:\s*'SYS::/);
}

console.log('Confirmation popup design tests passed.');
