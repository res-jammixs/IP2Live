/** Gameplay 5: lore briefing, phase-specific subnetting lessons, then routing. */
const IPCIDRQuarantineTutorial = {
    VERSION: 'ip-cidr-quarantine-segmentation-tutorial-20261007-05',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.intro.', {
            title: 'APEX QUARANTINE SECTOR', timing: 'before',
            slides: [[
                'APEX viruses are spreading. {{highlight:Divide the network into subnets}}, then connect A to B.',
                'We will guide you through each answer. The clock pauses while you read.',
            ]], onComplete,
        });
    },

    showPhaseGuide(phase, context, onComplete) {
        const c = context || {};
        const timer = Number(c.timeLimitSeconds) > 0
            ? c.timeLimitSeconds + ' seconds for the whole puzzle.' : 'This run has no time limit.';
        const lessons = {
            classify: {
                title: '1 / 6 - IDENTIFY THE CLASS',
                focusTargets: [['address'], ['class_input', 'attempts']],
                slides: [[
                    'Recall Gameplay 1. Read the first octet in the recessed display: A = 1-126, B = 128-191, C = 192-223.',
                    'Type the letter, such as {{highlight:A}}, then press Enter.',
                ], [
                    'The three small lights are your attempts. A wrong answer changes the IP and viruses; {{highlight:three mistakes end the run}}.',
                    timer + ' Dialogue and Pause stop the clock; the calculator does not.',
                ]],
            },
            default_prefix: {
                title: '2 / 6 - DEFAULT PREFIX',
                focusTargets: [['class_badge'], ['answer', 'verify']],
                slides: [[
                    'Recall {{highlight:Gameplay 3}}: each octet has {{highlight:8 light bulbs}}. Each bulb is one bit.',
                    'In the default mask: Class A lights 1 octet, B lights 2, and C lights 3.',
                ], [
                    'Remember: 8 bulbs per octet. A = 1 x 8 = /8; B = 2 x 8 = /16; C = 3 x 8 = /24.',
                    'Enter the number for your class, then {{highlight:VERIFY / Enter}}. These are classful defaults; assigned masks can differ.',
                ]],
            },
            borrow_bits: {
                title: '3 / 6 - BORROW BITS',
                focusTargets: [['bulbs'], ['subnets', 'bulbs', 'verify'], ['calculator']],
                slides: [[
                    '{{highlight:Cyan}} = original network bits. {{highlight:Gold}} = borrowed bits (s). Dark = remaining host bits (h).',
                    'Borrow from left to right. More borrowed bits make more subnets, leaving fewer bits for hosts.',
                ], [
                    'Choose the {{highlight:smallest s with 2^s >= required subnets}}. Example: 31 subnets need 5 bits, giving 32 subnets. Do not subtract 2 from the subnet count.',
                    'Click a dark bulb to borrow through it, or a gold bulb to release it. Left / Right adjusts one bit; VERIFY / Enter checks.',
                ], [
                    'The {{highlight:H calculator}} can help. Drag a value circle onto its display to change s; CLOSE returns to your bulbs.',
                    'Reserve two addresses per subnet when calculating usable hosts later, not two bits or two subnets.',
                ]],
            },
            new_cidr: {
                title: '4 / 6 - NEW PREFIX',
                focusTargets: [['network', 'answer', 'verify']],
                slides: [[
                    '{{highlight:New prefix = starting prefix + borrowed bits (s)}}.',
                    'Example: /16 + 3 borrowed bits = /19. Enter your result, then VERIFY / Enter.',
                ]],
            },
            host_bits: {
                title: '5 / 6 - HOST BITS',
                focusTargets: [['answer', 'verify']],
                slides: [[
                    '{{highlight:h = 32 - new prefix}}. Count all remaining dark bulbs, including those in later octets.',
                    'Host bits are binary positions, not devices. Example: /19 leaves 13 bits. Enter the bit count, then VERIFY / Enter.',
                ]],
            },
            host_capacity: {
                title: '6 / 6 - USABLE HOSTS',
                focusTargets: [['answer', 'calculator'], ['answer', 'verify']],
                slides: [[
                    'Recall Gameplay 4.5: {{highlight:2^h = total addresses}}; {{highlight:usable hosts = 2^h - 2}}.',
                    'Reserve one network address and one broadcast address. Usable hosts are the addresses left for devices.',
                ], [
                    '5 host bits give 32 addresses but only {{highlight:30 usable hosts}}. For 31 hosts, add 2: 33 addresses need 6 bits, giving 62 usable hosts.',
                    'Enter usable hosts, not the bit count or total addresses. VERIFY / Enter checks; H opens the calculator.',
                ]],
            },
        };
        const lesson = lessons[phase];
        if (!lesson) return false;
        return this._startDynamicDialogue('stage3.cidrquarantine.phase.' + phase + '.', {
            ...lesson, onComplete,
        });
    },
    showRouteGuide(context, onComplete) {
        const c = context || {};
        return this._startDynamicDialogue('stage3.cidrquarantine.route.', {
            title: 'SUBNETS VERIFIED - SECURE THE ROUTE',
            focusTargets: [['network_facts'], ['moves', 'path_total']],
            slides: [[
                'Your /' + c.targetCIDR + ' leaves h = ' + c.optimizedHostBits + ': ' + c.totalAddresses + ' total addresses and ' + c.optimizedCapacity + ' usable hosts per subnet.',
                'Now {{highlight:connect A to B}} without touching red virus tiles.',
            ], [
                'Each move adds its {{highlight:direction value}}. Your path total must equal {{highlight:h = ' + c.optimizedHostBits + '}}.',
                'This is the route rule, not the number of moves. Your subnet stays fixed.',
            ]], onComplete,
        });
    },

    showStep(step, context, onComplete) {
        const c = context || {};
        const slides = {
            1: [[
                'Start at {{highlight:A}}. Click or drag through adjacent tiles, or use arrow / WASD keys.',
                'Move up, down, left, or right. Avoid red tiles; no diagonals.',
            ]],
            2: [[
                'Path total: {{highlight:' + c.currentHostBits + '}}. Required total: {{highlight:' + c.optimizedHostBits + '}}.',
                'Follow the direction values toward B. {{highlight:UNDO / Z}} removes a move; CLEAR / R starts again.',
            ]],
            3: [[
                'You reached B. Check that the {{highlight:path total equals h = ' + c.optimizedHostBits + '}}.',
                'Too small? Choose a route with a larger sum. Too large? {{highlight:UNDO}} and choose a smaller sum.',
            ]],
            4: [[
                'A must connect to B with {{highlight:path total = ' + c.optimizedHostBits + '}} and no red tiles.',
                'Press {{highlight:CHECK / Enter}} in the bottom action row.',
            ]],
        };
        return this._startDynamicDialogue('stage3.cidrquarantine.step.' + step + '.', {
            title: 'ROUTE - ' + step + ' / 4', slides: slides[step] || slides[1], onComplete,
            focusTargets: [step === 1 ? ['grid'] : step === 4 ? ['check'] : ['path_total', 'moves', 'actions']],
        });
    },

    showFeedback(reason, context, onComplete) {
        const c = context || {};
        const correction = [
            'Path total: {{highlight:' + c.currentHostBits + '}}. Required: {{highlight:' + c.optimizedHostBits + '}}.',
            'Use {{highlight:UNDO}} or click an earlier path tile, then adjust the sum using the direction values.',
        ];
        const text = {
            submitEarly: ['Connect {{highlight:A to B}} through adjacent, uninfected tiles before confirming.'],
            submitWrong: correction,
            submitReady: ['B is connected and {{highlight:path total = h}}. Press {{highlight:CHECK / Enter}} in the bottom action row.'],
            virus: ['{{highlight:Red tiles are blocked}}. Route around the infection.'],
            adjacent: ['Move {{highlight:one adjacent tile}} up, down, left, or right. No diagonals or jumps.'],
            too_small: correction, too_big: correction, not_optimized: correction,
            virus_overrun: ['{{highlight:Time expired.}} The breach popup and pixelated takeover end this run. Loading screen 2 returns you to the floor or testing panel.'],
        };
        return this._startDynamicDialogue('stage3.cidrquarantine.feedback.', {
            title: 'ROUTE FEEDBACK', slides: [text[reason] || correction], onComplete,
            focusTargets: [['grid']],
        });
    },

    showComplete(onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.complete.', {
            title: 'QUARANTINE ROUTE SECURED', timing: 'after',
            slides: [[
                'Route secured. {{highlight:Subnets = 2^s}}; {{highlight:usable hosts = 2^h - 2}}.',
                'Borrowed bits divide the network. Remaining host bits provide addresses inside each subnet.',
            ]], onComplete,
        });
    },

    showRecovery(context, onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.recovery.', {
            title: 'TRAINING PROTOCOL RESTORED', timing: 'after',
            slides: [[
                'Attempts exhausted. Return to the {{highlight:guided quarantine node}} to recalibrate.',
                'Verify the class, starting prefix, borrowed bits, new prefix, host bits, and {{highlight:usable hosts}}. Then connect A to B with {{highlight:path total = h}}.',
            ]], onComplete,
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
            title: definition.title || 'TRANSMISSION', speaker: 'SYSTEM',
            slides: definition.slides || [], timing: definition.timing || 'during',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.dialogue' },
            hideQuestPanel: true, lockMovement: true,
            onComplete: definition.onComplete || null,
        });
        return dm.start(id, { source: 'IPCIDRQuarantineTutorial',
            gameplayFocus: definition.focusTargets || [], compactPanel: true });
    },
};

IP2Live.IPCIDRQuarantineTutorial = IPCIDRQuarantineTutorial;
window.IP2LiveIPCIDRQuarantineTutorial = IPCIDRQuarantineTutorial;
