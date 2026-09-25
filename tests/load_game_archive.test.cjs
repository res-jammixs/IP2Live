const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../Plugins/IP2Live_Core/modules');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const text = [];
const states = [];
const ctx = {
    canvas: { width: 1920, height: 1080 }, font: '',
    save() { states.push({ font: this.font, textAlign: this.textAlign }); },
    restore() { Object.assign(this, states.pop()); },
    scale() {}, beginPath() {}, closePath() {}, fill() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillRect() {}, strokeRect() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText(value) { return { width: String(value).length * (parseFloat(this.font.replace('bold ', '')) || 12) * 0.6 }; },
    fillText(value, x, y) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        text.push({ value, x, y, font: this.font });
    },
};
const Common = { Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } };
const Core = { Game: class { async load() { throw new Error('unreadable slot'); } } };
const sound = { playSound() {} };
const Data = { Systems: { saveSlots: 9, soundCursor: sound, soundConfirmation: sound, soundImpossible: sound, soundCancel: sound } };
const Manager = { Stack: {} };
const Scene = { Base: class { constructor() { this.initialize(); } }, Map: {} };
const IP2Live = { Assets: { oxaniumMediumLoaded: true }, MapManager: { stageFor: mapId => mapId === 4 ? { stage: 1, level: 2 } : null } };
const windowObject = {};
for (const source of ['game_manager.js', 'screens/load-game.js']) {
    new Function('Common', 'Core', 'Data', 'Manager', 'Scene', 'IP2Live', 'window', 'Main', read(source))(
        Common, Core, Data, Manager, Scene, IP2Live, windowObject, {});
}
const gm = IP2Live.GameManager;
const menu = new windowObject.IP2LiveLoadGameMenu();
menu.gamesData = Array.from({ length: 9 }, () => ({ isEmpty: true }));
menu.gamesData[0] = { isEmpty: false, currentMapID: 4, playTime: { time: 3723000 }, teamHeroes: [{ name: 'Lucas' }] };
menu.slotMetaByIndex[0] = { saveName: 'Checkpoint Alpha', profileName: 'NOVA', mapId: 3, playTimeMs: 0, savedAt: 1780000000000, gameStates: { neuralLifeForce: { lifeForce: 78 } } };

assert.equal(menu._getPlayTimeStr({ time: 3723000 }), '01:02:03', 'reads the engine Chrono object');
assert.equal(menu._getPlayTimeStr(100 * 3600000), '100:00:00');
assert.equal(menu._getPlayTimeStr(-50), 'Not recorded');
assert.equal(menu._getPlayTimeStr(Infinity), 'Not recorded');
assert.equal(menu._getPlayTimeStr(0), '00:00:00', 'a recorded zero duration is still valid');
assert.equal(menu._slotDetails(0).playTimeMs, 3723000, 'core save time wins over stale metadata');
assert.equal(menu._slotDetails(0).location, 'STAGE 1 / LEVEL 2');
assert.equal(menu._slotDetails(0).operative, 'NOVA');
assert.equal(menu._slotDetails(0).lifeForce, 78);
menu.slotMetaByIndex[1] = menu.slotMetaByIndex[0];
assert.equal(menu._slotDetails(1).empty, true, 'orphaned metadata must not populate an empty core slot');
menu.gamesData[2] = { isEmpty: false, currentMapID: 3, playTime: { time: 284775 },
    hero: { name: 'Lucas', character: { name: 'Lucas' } }, teamHeroes: [{ name: 'Lucas' }] };
assert.equal(menu._slotDetails(2).empty, false, 'legacy core saves do not require metadata or a hero name');
assert.equal(menu._slotDetails(2).saved, 'Not recorded');
assert.equal(menu._slotDetails(2).lifeForce, null);
assert.equal(menu._getPlayTimeStr(menu._slotDetails(2).playTimeMs), '00:04:44');
assert.equal(menu._slotDetails(2).operative, null, 'default RPG actor names are never player identities');
assert.equal(menu._slotDetails(2).name, 'Save slot 03', 'unnamed saves use their actual slot number');
menu.gamesData[2]._ip2liveProfileName = 'SAVED PLAYER';
assert.equal(menu._slotDetails(2).operative, 'SAVED PLAYER');
delete menu.gamesData[2]._ip2liveProfileName;
menu.gamesData[3] = { isEmpty: false, currentMapID: 3 };
assert.equal(menu._slotDetails(3).playTimeMs, null, 'missing time is not fabricated as zero');
assert.equal(menu._getPlayTimeStr(menu._slotDetails(3).playTimeMs), 'Not recorded');
menu.gamesData[3].isEmpty = true;

let confirmation;
IP2Live.confirPopup = { show: options => { confirmation = options; } };
menu.selectedIndex = 2;
menu._confirmSelection();
assert.equal(confirmation.value, 'S03 - Save slot 03', 'load confirmation uses the same verified identity');
menu._openSaveNameDialog(3);
assert.equal(menu.saveNameDialog.existingDisplayName, 'Save slot 03', 'overwrite dialog does not reintroduce the actor name');
menu._closeSaveNameDialog();
menu.selectedIndex = 0;

for (const [sw, sh, width, height] of [[1280, 720, 1920, 1080], [1280, 720, 960, 540], [800, 600, 800, 600], [800, 480, 800, 480]]) {
    Object.assign(Common.ScreenResolution, { SCREEN_X: sw, SCREEN_Y: sh });
    Object.assign(ctx.canvas, { width, height });
    const layout = menu._getLayout(sw, sh);
    const lastRowBottom = layout.listStartY + menu.maxVisible * layout.itemH + (menu.maxVisible - 1) * layout.itemGap;
    assert.ok(lastRowBottom < layout.panelY + layout.panelH - 60, 'slots clear footer');
    assert.ok(layout.rightX + layout.rightW < layout.panelX + layout.panelW, 'details stay inside frame');
    for (const index of [0, 2, 3, 9]) {
        menu.selectedIndex = index;
        menu.drawHUD();
    }
    menu.selectedIndex = 0;
    for (let i = 0; i < menu.maxVisible; i++) {
        assert.equal(menu._getButtonAt((layout.listX + 10) * width / sw,
            (layout.listStartY + i * (layout.itemH + layout.itemGap) + 10) * height / sh), i);
    }
    assert.equal(menu._getButtonAt((layout.panelX + layout.panelW - 110) * width / sw,
        (layout.panelY + layout.panelH - 40) * height / sh), 9);
}
assert.ok(text.some(row => row.value === '01:02:03'));
assert.ok(text.every(row => row.font.includes('Oxanium-Medium')));
assert.ok(text.every(row => !/PING|CIDR|SSH-T/.test(row.value)), 'no fictional network statistics');
assert.ok(text.every(row => !row.value.includes('Lucas')), 'engine default name is absent from every rendered state');
assert.equal(states.length, 0, 'rendering balances canvas state');

async function main() {
    const records = [];
    const coreTimes = [];
    const game = Core.Game.current = { currentMapID: 4, infiltratorName: 'NOVA', playTime: { time: 3723000 }, save: async function () { coreTimes.push(this.playTime.time); } };
    gm.getSlotProgressSnapshot = async () => null;
    gm._captureHeroPosition = () => null;
    gm._buildQuestSnapshot = () => null;
    gm._persistSlotSnapshot = () => true;
    IP2Live.DBManager = { getRecord: async () => null, saveRecord: async (_table, row) => records.push(row) };
    const first = await gm.saveProgressToActiveSlot(1, 'Checkpoint Alpha');
    assert.equal(first.saved, true);
    assert.equal(first.snapshot.playTimeMs, 3723000);
    assert.equal(records[0].playTime, 3723000, 'profile stores milliseconds, never a live timer object');
    game.playTime.time += 61000;
    const second = await gm.saveProgressToActiveSlot(1, 'Checkpoint Alpha');
    assert.equal(second.snapshot.playTimeMs, 3784000, 'subsequent saves capture increased time');
    assert.deepEqual(coreTimes, [3723000, 3784000]);
    assert.equal(typeof game.playTime, 'object', 'saving preserves the engine timer');
    await assert.rejects(menu._refreshSavedSlot(1), /unreadable slot/);
    assert.equal(Core.Game.current, game, 'failed slot refresh restores the live session');

    const requestedGames = [];
    gm.getSlotProgressSnapshot = async (_slot, options) => { requestedGames.push(options.loadedGame); return null; };
    await menu._loadSlotMetadata('UNRELATED CURRENT PROFILE');
    assert.deepEqual(requestedGames, menu.gamesData, 'metadata lookup uses each slot owner');
    console.log('load game archive rendering and playtime tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
