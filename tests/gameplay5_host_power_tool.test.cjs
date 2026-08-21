const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const gameplayPath = path.join(
  projectRoot,
  'Plugins',
  'IP2Live_Core',
  'gameplay',
  'gameplay5',
  'CIDRQuarantine',
  'ip_cidr_quarantine_gameplay.js'
);

let launchOptions = null;
let launchCount = 0;
const context = {
  console: { log() {}, warn() {}, error() {} },
  Date,
  Math,
  setTimeout,
  clearTimeout,
  IP2Live: {
    CIDRTools: {},
    HostPowerToolManager: {
      launchHostPowerTool(options) {
        launchCount++;
        launchOptions = options;
        return true;
      },
    },
  },
  window: {},
  Scene: { Base: class {} },
  Manager: { Stack: { requestPaintHUD: false }, GL: {} },
  Common: {
    ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 },
    Platform: { ctx: { canvas: { width: 1280, height: 720 } } },
  },
  Core: { Game: { current: { currentMapID: 12 } } },
  Data: {
    Keyboards: { checkCancelMenu() { return false; } },
    Systems: {
      soundConfirmation: { playSound() {} },
      soundCancel: { playSound() {} },
      soundCursor: { playSound() {} },
    },
  },
  Graphic: {},
  Model: {},
  Main: {},
  THREE: {},
  inject() {},
};

vm.runInNewContext(fs.readFileSync(gameplayPath, 'utf8'), context, { filename: gameplayPath });
const Screen = context.IP2Live.CIDRQuarantineGameplayScreen;
assert.ok(Screen, 'Gameplay 5 screen should be exported');

const problem = {
  id: 'host-tool-integration',
  questIndex: 1,
  difficulty: { warningDensity: 0.3, criticalDensity: 0.5 },
  directionWeights: { R: 1, L: 2, U: 3, D: 4 },
  start: { col: 1, row: 1 },
  end: { col: 0, row: 2 },
  viruses: [],
  solutionPath: [{ col: 1, row: 1 }, { col: 1, row: 2 }, { col: 0, row: 2 }],
  solutionBufferKeys: {},
  solutionMoves: ['D', 'L'],
  ipAddress: '173.0.16.121',
  ipInt: 2902466681,
  ipClass: 'B',
  originalCIDR: 16,
  requiredHosts: 51,
  targetAddedBits: 6,
  targetHostBits: 6,
  borrowedBits: 10,
  targetCIDR: 26,
  optimizedHostBits: 6,
  optimizedCapacity: 62,
  allocatedCIDR: '173.0.16.64/26',
};

const screen = new Screen({ problem });
const metrics = screen._metrics();
screen._buildInteractionRects(metrics);
assert.ok(screen.hostPowerToolRect, 'the calculator icon needs a click target');
assert.ok(screen.hostPowerToolRect.x >= metrics.panelX);
assert.ok(screen.hostPowerToolRect.x + screen.hostPowerToolRect.w <= metrics.panelX + metrics.panelW);
assert.ok(screen.hostPowerToolRect.y >= metrics.panelY);
assert.ok(screen.hostPowerToolRect.y + screen.hostPowerToolRect.h < metrics.gridY);

const pathBeforeOpening = JSON.stringify(screen.path);
const virusesBeforeOpening = JSON.stringify(screen.problem.viruses);
const toolButton = screen.hostPowerToolRect;
screen.onMouseDown(toolButton.x + toolButton.w / 2, toolButton.y + toolButton.h / 2);

assert.equal(launchCount, 1, 'clicking the icon should open exactly one calculator overlay');
assert.equal(screen.hostPowerToolOpen, true);
assert.equal(launchOptions.targetClass, 'B', 'the overlay must use the active Gameplay 5 IP class');
assert.equal(launchOptions.requiredHosts, 51, 'the overlay must use the active puzzle host requirement');
assert.equal(launchOptions.startExponent, 0, 'the tool should not reveal the answer on open');
assert.equal(launchOptions.align, 'right');
assert.equal(launchOptions.showIntro, false, 'the helper overlay should open without replaying the bridge tutorial');
assert.equal(launchOptions.sourceGameplayId, 'ip_cidr_quarantine');
assert.equal(launchOptions.backgroundScene, screen, 'the live Gameplay 5 renderer should remain behind the tool');
assert.equal(launchOptions.preserveBackground, true);
assert.equal(launchOptions.neutralFeedback, true, 'the helper must not reveal whether h is right or wrong');
assert.equal(launchOptions.lockScenario, true, 'the helper must remain tied to the current puzzle');
assert.equal(JSON.stringify(screen.path), pathBeforeOpening, 'opening the helper must preserve the route under it');
assert.equal(JSON.stringify(screen.problem.viruses), virusesBeforeOpening, 'opening the helper must preserve virus placement');

screen.onMouseDown(toolButton.x + 2, toolButton.y + 2);
assert.equal(launchCount, 1, 'a second click cannot stack another calculator');

launchOptions.onClose({
  exponent: 6,
  evaluation: { valid: true, usableHosts: 62, targetExponent: 6 },
});
assert.equal(screen.hostPowerToolOpen, false, 'closing the overlay should unlock its button');
assert.match(screen.statusText, /Apply your calculated host-bit value/);
assert.equal(context.Manager.Stack.requestPaintHUD, true);
assert.equal(JSON.stringify(screen.path), pathBeforeOpening, 'closing the helper must restore the same route state');

screen.onKeyPressed({ code: 'KeyH' });
assert.equal(launchCount, 2, 'H should provide a keyboard-accessible shortcut for the calculator icon');

screen.hostPowerToolOpen = false;
screen.path = problem.solutionPath.map((tile) => ({ col: tile.col, row: tile.row }));
const stats = screen._pathStats();
assert.equal(stats.addedBits, 6, 'D +4 and L +2 should form host power h=6');
assert.equal(stats.currentHostBits, 6, 'the route total must directly represent h');
assert.equal(stats.currentCapacity, 62, 'Gameplay 5 must use 2^h - 2 usable hosts');
assert.equal(stats.currentCIDR, 26, 'CIDR must be derived as 32-h');
assert.equal(stats.borrowedBits, 10, 'Class B borrows 16-h bits after h is solved');
assert.equal(screen._evaluatePath().ok, true, '51 required hosts must accept an h=6 connected route');

for (let index = 0; index < 20; index++) {
  const generated = new Screen({ spec: { profile: { index: 2 } } });
  generated.path = generated.problem.solutionPath.map((tile) => ({ col: tile.col, row: tile.row }));
  const generatedStats = generated._pathStats();
  assert.equal(generatedStats.currentHostBits, generated.problem.optimizedHostBits,
    'every generated A-to-B solution path must total the taught host exponent');
  assert.equal(generatedStats.currentCapacity, generated.problem.optimizedCapacity);
  assert.equal(generatedStats.currentCIDR, generated.problem.targetCIDR);
  assert.equal(generated._evaluatePath().ok, true, 'every generated solution route must be winnable');
}

const loader = fs.readFileSync(path.join(projectRoot, 'Plugins', 'IP2Live_Core', 'code.js'), 'utf8');
assert.match(loader, /20260821_ip_cidr_quarantine_03_/,
  'the Gameplay 5 loader cache key must change so packaged Electron does not reuse stale code');

const hostGameplayPath = path.join(
  projectRoot,
  'Plugins',
  'IP2Live_Core',
  'gameplay',
  'gameplay4_5',
  'HostPowerReactor',
  'ip_host_power_gameplay.js'
);
const hostToolPath = path.join(
  projectRoot,
  'Plugins',
  'IP2Live_Core',
  'gameplay',
  'gameplay4_5',
  'HostPowerReactor',
  'ip_host_power_tool.js'
);
const renderedText = [];
const gradient = { addColorStop() {} };
const toolCanvas = { width: 1280, height: 720 };
const toolCanvasContext = new Proxy({
  canvas: toolCanvas,
  createLinearGradient() { return gradient; },
  createRadialGradient() { return gradient; },
  fillText(value) { renderedText.push(String(value)); },
}, {
  get(target, property) {
    if (property in target) return target[property];
    return function canvasNoop() {};
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});
let backgroundHudDraws = 0;
let background3DDraws = 0;
const backgroundScene = {
  drawHUD() { backgroundHudDraws++; },
  draw3D() { background3DDraws++; },
};
const toolContext = {
  console: { log() {}, warn() {}, error() {} },
  Date,
  Math,
  setTimeout,
  clearTimeout,
  IP2Live: {},
  window: {},
  Scene: { Base: class {} },
  Manager: { Stack: { requestPaintHUD: false }, GL: {} },
  Common: {
    ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 },
    Platform: { ctx: toolCanvasContext },
  },
  Core: {},
  Data: {
    Keyboards: { checkCancelMenu() { return false; } },
    Systems: {
      soundConfirmation: { playSound() {} },
      soundCancel: { playSound() {} },
      soundCursor: { playSound() {} },
    },
  },
  Graphic: {},
  Model: {},
  Main: {},
  THREE: {},
  inject() {},
};
vm.runInNewContext(fs.readFileSync(hostGameplayPath, 'utf8'), toolContext, { filename: hostGameplayPath });
vm.runInNewContext(fs.readFileSync(hostToolPath, 'utf8'), toolContext, { filename: hostToolPath });
const ToolScreen = toolContext.IP2Live.HostPowerToolScreen;
const neutralTool = new ToolScreen({
  targetClass: 'B',
  requiredHosts: 51,
  startExponent: 6,
  backgroundScene,
  preserveBackground: true,
  neutralFeedback: true,
  lockScenario: true,
});
neutralTool.draw3D();
neutralTool.drawHUD();
assert.equal(background3DDraws, 1, 'the overlay should retain the underlying Gameplay 5 3D frame');
assert.equal(backgroundHudDraws, 1, 'the overlay should repaint Gameplay 5 instead of showing a black canvas');
assert.equal(neutralTool._statusColor(), '#62e7f4', 'neutral helper feedback should always use cyan');
assert.equal(neutralTool.classRects.length, 0, 'the active puzzle class cannot be changed inside its helper');
assert.equal(neutralTool.buttons.length, 2, 'the locked helper only needs reset and close actions');
assert.ok(renderedText.includes('62 USABLE'));
assert.ok(renderedText.some((value) => value.includes('CIDR /26') && value.includes('BORROWED 10')));
assert.equal(renderedText.some((value) => /LOW|TOO MUCH|JUST RIGHT|ADD \d+ BIT|REMOVE \d+ BIT/.test(value)), false,
  'the Gameplay 5 calculator must not disclose whether the chosen h is right or wrong');

for (const exponent of [5, 6, 7]) {
  neutralTool.exponent = exponent;
  neutralTool.evaluation = neutralTool.rules.evaluate(51, exponent);
  assert.equal(neutralTool._statusColor(), '#62e7f4', 'under, exact, and over values must share the same neutral color');
}
