/**
 * IP2Live - Gameplay 3 CIDR Panel Harder Tutorial
 *
 * Dialogue owned exclusively by the adaptive Stage 2 Levels 3-4 variant.
 */

(function () {
    const IPCIDRPanelHarderTutorial = {
        VERSION: 'ip-cidrpanel-harder-tutorial-20260816-02',
        _dialogueSerial: 0,

        showIntro(context, onComplete) {
            const data = context || {};
            const mapId = Number(data.mapId) || 9;
            const level = Number(data.level) || (mapId === 10 ? 4 : 3);
            return this._startDynamicDialogue('stage2.ipcidrpanel_harder.intro.', {
                title: 'APEX ADAPTIVE CAPACITY LOCK',
                speaker: 'SYSTEM',
                timing: 'before',
                bindings: {
                    mapId,
                    gameplayId: 'ip_cidr_binary_panel_harder',
                    trigger: 'gameplay.before',
                },
                slides: [[
                    'Congratulations, Hacker. You reached Stage 2 Level ' + level + '.',
                    '',
                    'The task is the same: match the subnet mask with the binary lamps, then enter its CIDR prefix.',
                    'But APEX has activated an adaptive re-key defense. Every wrong lamp pattern or CIDR prefix destroys the current target and generates a different subnet mask.',
                    'Forget the rejected answer and recalculate from the new target. If a Subnet Simulator follows, only the mask you finally verify will become its reference key.',
                ]],
                onComplete,
            });
        },

        showAdaptiveRekey(rekey, onComplete) {
            const data = rekey || {};
            const previousMask = data.previousMask || 'the rejected mask';
            const nextMask = data.nextMask || 'the new target';
            const answerType = data.reason === 'cidr' ? 'CIDR prefix' : 'binary lamp pattern';
            return this._startDynamicDialogue('stage2.ipcidrpanel_harder.rekey.', {
                title: 'APEX ADAPTIVE RE-KEY',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: Number(data.mapId) || 9,
                    gameplayId: 'ip_cidr_binary_panel_harder',
                    trigger: 'gameplay.mistake',
                },
                slides: [[
                    'The ' + answerType + ' was rejected. APEX burned the old target ' + previousMask + ' and rotated the lock.',
                    '',
                    'NEW SUBNET MASK: ' + nextMask,
                    'Start again: rebuild all four lamp rows, then count the new ON bulbs and calculate the new CIDR prefix yourself.',
                    'Only the mask you eventually verify will be transferred to Gameplay 4.',
                ]],
                onComplete,
            });
        },

        _startDynamicDialogue(prefix, definition) {
            const dm = IP2Live.DialogueManager;
            if (!dm || typeof dm.registerDialogue !== 'function' || typeof dm.start !== 'function') {
                if (definition && typeof definition.onComplete === 'function') definition.onComplete();
                return false;
            }

            const id = prefix + (++this._dialogueSerial);
            dm.registerDialogue(id, {
                title: definition.title || 'TRANSMISSION',
                speaker: definition.speaker || 'SYSTEM',
                slides: definition.slides || [],
                timing: definition.timing || 'during',
                bindings: Object.assign({}, definition.bindings || {}),
                hideQuestPanel: true,
                lockMovement: true,
                onComplete: definition.onComplete || null,
            });
            return dm.start(id, { source: 'IPCIDRPanelHarderTutorial' });
        },
    };

    IP2Live.IPCIDRPanelHarderTutorial = IPCIDRPanelHarderTutorial;
    window.IP2LiveIPCIDRPanelHarderTutorial = IPCIDRPanelHarderTutorial;
    console.log('[IP2Live] ip_cidrpanel_gameplay_harder_tutorial.js loaded.');
}());
