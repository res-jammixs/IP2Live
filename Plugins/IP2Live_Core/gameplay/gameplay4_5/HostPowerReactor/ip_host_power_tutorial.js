/**
 * IP2Live - Gameplay 4.5 Host-Power Reactor Tutorial
 *
 * Guided dialogue for the bridge between subnet-capacity lessons and
 * analytical bit calculation. The tutorial deliberately teaches
 * 2^h - 2 >= required hosts before the timed reactor starts.
 */

const IPHostPowerReactorTutorial = {
    VERSION: 'ip-host-power-reactor-tutorial-20260821-04',
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
        const openingPlan = targetExponent === 6
            ? 'For this first lesson, +1, +3, and +2 form 1 + 3 + 2 = 6. Then submit h with CALCULATE.'
            : 'Combine positive capsule values to choose h; use a virus to correct it, then submit h with CALCULATE.';

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
                    'The intake is divided into five fixed lanes.',
                    '',
                    'Tap A/D or Left/Right to move exactly one lane. Holding a direction continues stepping through the five lane centers.',
                    'Press SPACE once to fire one bullet in the selected lane. Holding SPACE does not auto-fire.',
                ],
                [
                    'Every capsule and virus bursts with one accurate bullet.',
                    '',
                    'A capsule adds its printed value to h. A red virus subtracts its printed value.',
                    'Choose each shot carefully; only objects in the currently selected lane can be hit.',
                ],
                [
                    'Color-coded capsules add +1 to +5 host bits. Red viruses subtract -1 or -2.',
                    '',
                    'This training reactor starts at h = 0 and needs h = ' + targetExponent + '.',
                    openingPlan,
                ],
                [
                    'The calculator does not reveal 2^h automatically while you collect values.',
                    '',
                    'Exact total-address equality is not enough: the two reserved addresses must still fit.',
                    'Click CALCULATE CAPACITY to submit h. Only then will the system reveal the result and validate your answer.',
                ],
            ],
            onComplete,
        });
    },

    showReactorGuide(context, onComplete) {
        const c = context || {};
        const className = String(c.className || 'C').toUpperCase();
        const requiredHosts = Math.max(1, Number(c.requiredHosts) || 50);
        const targetExponent = Math.max(1, Number(c.targetExponent) || 6);
        return this._startDynamicDialogue('stage.hostpower.guided.reactor.', {
            title: '01 // CAPACITY TARGET',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { gameplayId: 'ip_host_power_reactor', trigger: 'gameplay.during' },
            slides: [[
                'The highlighted reactor must supply ' + requiredHosts + ' usable Class ' + className + ' host addresses.',
                '',
                'Its center number is the host-bit exponent h. For this training node, the smallest safe value is h = ' + targetExponent + '.',
                'The reactor stays neutral while you choose h. Its result color appears only after you press CALCULATE.',
            ]],
            onComplete,
        });
    },

    showFormulaGuide(context, onComplete) {
        const c = context || {};
        const requiredHosts = Math.max(1, Number(c.requiredHosts) || 50);
        const targetExponent = Math.max(1, Number(c.targetExponent) || 6);
        const total = Math.pow(2, targetExponent);
        const usable = Math.max(0, total - 2);
        return this._startDynamicDialogue('stage.hostpower.guided.formula.', {
            title: '02 // MANUAL CAPACITY CHECK',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { gameplayId: 'ip_host_power_reactor', trigger: 'gameplay.during' },
            slides: [[
                'The highlighted calculator keeps 2^h and the usable-host result locked while you collect values.',
                '',
                'Always calculate 2^h - 2 because the network and broadcast addresses are reserved.',
                'When you are ready, click CALCULATE CAPACITY. For this lesson, 2^' + targetExponent + ' - 2 = ' + usable + ', which covers ' + requiredHosts + ' hosts.',
            ]],
            onComplete,
        });
    },

    showIntakeGuide(context, onComplete) {
        return this._startDynamicDialogue('stage.hostpower.guided.intake.', {
            title: '03 // CAPSULE INTAKE',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { gameplayId: 'ip_host_power_reactor', trigger: 'gameplay.during' },
            slides: [[
                'The highlighted intake has five fixed lanes labeled L1 through L5.',
                '',
                'Bright capsules add the clearly printed +1 to +5 value to h. Red viruses subtract 1 or 2.',
                'Drops visit every lane before a lane is reused, giving you time to choose a target.',
            ]],
            onComplete,
        });
    },

    showShellGuide(context, onComplete) {
        return this._startDynamicDialogue('stage.hostpower.guided.shell.', {
            title: '04 // ONE-SHOT TARGETS',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { gameplayId: 'ip_host_power_reactor', trigger: 'gameplay.during' },
            slides: [[
                'The highlighted capsule and virus are training samples.',
                '',
                'Every falling target bursts with one bullet and immediately changes h by its printed value.',
                'Move to its exact lane first, then press SPACE once. Missed bullets do not affect neighboring lanes.',
            ]],
            onComplete,
        });
    },

    showControlsGuide(context, onComplete) {
        return this._startDynamicDialogue('stage.hostpower.guided.controls.', {
            title: '05 // PULSE-GUN CONTROL',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { gameplayId: 'ip_host_power_reactor', trigger: 'gameplay.during' },
            slides: [[
                'The highlighted pulse gun is locked to one of the five lane centers.',
                '',
                'Tap A/D or Left/Right to step one lane. Hold a direction to continue stepping without repeatedly tapping.',
                'Tap SPACE to fire one bullet. You must release and press SPACE again for the next shot.',
            ]],
            onComplete,
        });
    },

    showTimerGuide(context, onComplete) {
        const c = context || {};
        const targetExponent = Math.max(1, Number(c.targetExponent) || 6);
        return this._startDynamicDialogue('stage.hostpower.guided.timer.', {
            title: '06 // REACTOR WINDOW',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { gameplayId: 'ip_host_power_reactor', trigger: 'gameplay.during' },
            slides: [[
                'The highlighted power rail gives you 60 seconds. It has not started during this guided walkthrough.',
                '',
                'Build h = ' + targetExponent + ' for this guided example, then click CALCULATE CAPACITY to submit it.',
                'Training begins after this focus. Select a lane, tap SPACE, and calculate only when you are satisfied with h.',
            ]],
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
