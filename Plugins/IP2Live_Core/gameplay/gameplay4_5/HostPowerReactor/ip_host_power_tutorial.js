/**
 * IP2Live - Gameplay 4.5 Host-Power Reactor Tutorial
 *
 * Guided dialogue for the bridge between subnet-capacity lessons and
 * analytical bit calculation. The tutorial deliberately teaches
 * 2^h - 2 >= required hosts before the timed reactor starts.
 */

const IPHostPowerReactorTutorial = {
    VERSION: 'ip-host-power-reactor-tutorial-20260821-01',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        const className = String(c.className || 'C').toUpperCase();
        const requiredHosts = Math.max(1, Number(c.requiredHosts) || 50);
        const targetExponent = Math.max(1, Number(c.targetExponent) || 6);
        const totalAddresses = Math.pow(2, targetExponent);
        const usableHosts = Math.max(0, totalAddresses - 2);
        const availableHostBits = c.classConfig && Number(c.classConfig.maxHostBits)
            ? Number(c.classConfig.maxHostBits)
            : (className === 'A' ? 24 : (className === 'B' ? 16 : 8));
        const bitsToBorrow = Math.max(0, availableHostBits - targetExponent);

        return this._startDynamicDialogue('stage.hostpower.intro.', {
            title: 'HOST-POWER REACTOR TRAINING',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                gameplayId: 'ip_host_power_reactor',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    'The reactor needs an address block for ' + requiredHosts + ' usable Class ' + className + ' hosts.',
                    '',
                    'Your task is to find the smallest host-bit exponent h that can safely power it.',
                ],
                [
                    'Every IPv4 subnet reserves two addresses.',
                    '',
                    'One identifies the network and one is the broadcast address.',
                    'Therefore the real test is: 2^h - 2 must be at least ' + requiredHosts + '.',
                ],
                [
                    'For this round, the smallest correct exponent is ' + targetExponent + '.',
                    '',
                    '2^' + targetExponent + ' = ' + totalAddresses + ' total addresses',
                    totalAddresses + ' - 2 = ' + usableHosts + ' usable hosts',
                ],
                [
                    'Now convert the host exponent into borrowed bits.',
                    '',
                    'Class ' + className + ' starts with ' + availableHostBits + ' host bits.',
                    availableHostBits + ' - ' + targetExponent + ' = ' + bitsToBorrow + ' bit(s) may be borrowed.',
                ],
                [
                    'Move the auto-firing pulse gun with A/D, the arrow keys, or the mouse.',
                    '',
                    'Blue capsules add +1 to +5 host bits. Red viruses subtract -1 or -2.',
                    'Reach the smallest correct exponent before the 60-second power bar empties.',
                ],
                [
                    'The reactor glows amber while capacity is too low, green only at the smallest valid power,',
                    'and red when you allocate more host bits than necessary.',
                    '',
                    'Exact total-address equality is not enough: the two reserved addresses must still fit.',
                ],
            ],
            onComplete,
        });
    },

    showToolIntro(context, onComplete) {
        const c = context || {};
        const requiredHosts = Math.max(1, Number(c.requiredHosts) || 50);
        return this._startDynamicDialogue('stage.hostpower.tool.', {
            title: 'HOST-BIT CALCULATOR TOOL',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                gameplayId: 'ip_host_power_tool',
                trigger: 'tool.before',
            },
            slides: [
                [
                    'This compact calculator uses the same rule as the reactor.',
                    '',
                    'Needed hosts: ' + requiredHosts,
                    'Drag numbered bubbles into the calculator bay to build the exponent.',
                ],
                [
                    'Positive bubbles add host bits. Red -1 and -2 bubbles remove them.',
                    '',
                    'The calculator updates 2^h, reserved addresses, and usable hosts automatically.',
                ],
            ],
            onComplete,
        });
    },

    showTimeout(context, onComplete) {
        const c = context || {};
        const requiredHosts = Math.max(1, Number(c.requiredHosts) || 1);
        const targetExponent = Math.max(1, Number(c.targetExponent) || 1);
        return this._startDynamicDialogue('stage.hostpower.timeout.', {
            title: 'REACTOR POWER LOST',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                gameplayId: 'ip_host_power_reactor',
                trigger: 'gameplay.failed',
            },
            slides: [[
                'The one-minute stabilization window expired.',
                '',
                'For ' + requiredHosts + ' usable hosts, rebuild the exponent to ' + targetExponent + '.',
                'Remember: compare the target with 2^h - 2, not only 2^h.',
            ]],
            onComplete,
        });
    },

    showCorrection(context, onComplete) {
        const c = context || {};
        const currentExponent = Math.max(0, Number(c.currentExponent) || 0);
        const targetExponent = Math.max(1, Number(c.targetExponent) || 1);
        const direction = currentExponent < targetExponent
            ? 'Add ' + (targetExponent - currentExponent) + ' more host bit(s).'
            : 'Remove ' + (currentExponent - targetExponent) + ' host bit(s).';
        return this._startDynamicDialogue('stage.hostpower.correct.', {
            title: 'CAPACITY DIAGNOSTIC',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                gameplayId: 'ip_host_power_reactor',
                trigger: 'gameplay.mistake',
            },
            slides: [[
                'The reactor is not at the smallest valid exponent.',
                '',
                direction,
                'Green means the capacity fits with the fewest possible host bits.',
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
        return dm.start(id, { source: 'IPHostPowerReactorTutorial' });
    },
};

IP2Live.IPHostPowerReactorTutorial = IPHostPowerReactorTutorial;
window.IP2LiveIPHostPowerReactorTutorial = IPHostPowerReactorTutorial;

window.startHostPowerTutorialFourPointFive = function (options) {
    const manager = IP2Live.HostPowerReactorGameplayManager;
    if (!manager || typeof manager.launchHostPowerReactorGameplay !== 'function') return false;
    return manager.launchHostPowerReactorGameplay(Object.assign({}, options || {}, {
        guidedTutorial: true,
        showIntro: true,
    }));
};

console.log('[IP2Live] ip_host_power_tutorial.js loaded.');
