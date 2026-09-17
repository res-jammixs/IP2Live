/**
 * IP2Live - IP Patch Panel Tutorial Dialogue Helpers
 *
 * Dynamic dialogue content for the Stage 1 Level 2 patch-panel classifier gameplay.
 * Loaded before ip_patchpanel_gameplay.js.
 */

const IPPatchPanelTutorial = {
    VERSION: 'ip-patchpanel-tutorial-20260918-10',
    _dialogueSerial: 0,

    _rangeSpecs() {
        const ranges = IP2Live.IPClassRanges;
        return ranges && typeof ranges.cloneSpecs === 'function' ? ranges.cloneSpecs() : [];
    },

    _rangeSpec(className) {
        const ranges = IP2Live.IPClassRanges;
        return ranges && typeof ranges.byClassName === 'function' ? ranges.byClassName(className) : null;
    },

    _highlightedRangeSummary() {
        const specs = this._rangeSpecs();
        const entries = specs.map(function (spec) {
            return '{{highlight:Class ' + spec.className + ': ' + spec.shortRange + '}}';
        });
        if (entries.length < 2) return entries.join('');
        return entries.slice(0, -1).join(', ') + ', and ' + entries[entries.length - 1];
    },

    showIntro(onComplete) {
        const rangeSummary = this._highlightedRangeSummary();
        return this._startDynamicDialogue('stage1.ippatchpanel.intro.', {
            title: 'PATCH PANEL BRIEFING',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    'Welcome to {{highlight:Network Patch}}, the conduit classifier protecting this route.',
                    'A packet enters through {{highlight:Ingress}} on the left, crosses the inspection lane, and exits through {{highlight:Egress}} after classification.',
                    '',
                    'The panel contains a live {{highlight:conduit X-ray}}, a five-Class tunnel wheel, a packet-flow rail, and a three-card packet deck.',
                ], [
                    'The X-ray exposes the hollow {{highlight:Class A–E tunnels}} inside the cable.',
                    'Use the arrow keys to rotate the {{highlight:entire tunnel wheel}} until the correct tunnel entrance aligns with the wire on the left.',
                    '',
                    'You may also press {{key:A|KeyA}}, {{key:B|KeyB}}, {{key:C|KeyC}}, {{key:D|KeyD}}, or {{key:E|KeyE}} directly, or click a labeled tunnel port.',
                ], [
                    'This gameplay introduces a new packet type: the {{highlight:subnet mask}}. It is different from a regular {{highlight:IP address}}.',
                    '',
                    'Classify an {{highlight:IP address}} by its first-octet Class A–E range.',
                    'Classify a {{highlight:subnet mask}} by its mask pattern, which describes the network and host portions of an address.',
                    '{{highlight:A subnet mask beginning with 255 is not automatically a Class E IP address.}} Always read the packet-type label first.',
                ], [
                    'The first 3 packets teach the standard masks: {{highlight:255.0.0.0 → Class A}}, {{highlight:255.255.0.0 → Class B}}, and {{highlight:255.255.255.0 → Class C}}.',
                    'The next 5 packets review these centralized IP first-octet ranges: ' + rangeSummary + '.',
                ], [
                    '{{highlight:Guided safety lock}} is active for those first 8 training packets.',
                    'A wrong tunnel reverses the same signal to {{highlight:Ingress}} without consuming a delivery or adding a scoring mistake.',
                    '',
                    'Try that packet again until it is correct. The final 7 independent IP packets use the normal scoring rules.',
                ], [
                    'The guided tutorial always runs all 15 packets so you can complete the entire lesson.',
                    'Secure at least {{highlight:10 of 15 packets}} to stabilize the panel and proceed.',
                    '',
                    'You have two total round attempts at each Patch Panel node. If the first score is below 10, the complete stream restarts once.',
                    'If the second round also misses the target, we return to this guided tutorial before trying the unfinished node again.',
                    'Regular Patch Panel nodes finish immediately when you secure the tenth correct route.',
                ],
            ],
            onComplete,
        });
    },

    showPacketGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.packet.', {
            title: 'PACKET FLOW',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'This illuminated pulse is the {{highlight:current packet}} entering through {{highlight:Ingress}} on the left.',
                '',
                'Only one unresolved packet may occupy the live lane. Its movement is paused while a tutorial message or highlight is active.',
                'When instruction resumes, watch it travel toward the center classifier and then leave through EGRESS.',
            ]],
            onComplete,
        });
    },

    showXrayGuide(kind, onComplete) {
        const label = String(kind || '').toUpperCase() === 'MASK' ? 'subnet mask' : 'IP address';
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.xray.', {
            title: 'XRAY INSPECTOR',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'The {{highlight:conduit X-ray}} is a digital view inside the cable. It exposes five hollow Class tunnels surrounding the center core.',
                '',
                'The selected tunnel glows with its Class color. Read the current {{highlight:' + label + '}} in the packet deck, then rotate the wheel until the correct tunnel entrance aligns with the left wire.',
            ]],
            onComplete,
        });
    },

    showGoalGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.goal.', {
            title: 'ROUTING OBJECTIVE',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'The {{highlight:Packet Flow}} rail records all {{highlight:15 deliveries}} in the round.',
                'Cyan segments are secured routes; red segments are misroutes; dark segments have not arrived yet.',
                '',
                'This guided tutorial records all 15 deliveries and requires at least {{highlight:10 correct routes}}. Regular Patch Panel nodes finish as soon as the tenth route is secured.',
                'A lower first-round score uses your only retry; a second failed round returns you to tutorial training.',
            ]],
            onComplete,
        });
    },

    showControlsGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.controls.', {
            title: 'CLASS CONTROL',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'Use {{key:LEFT|ArrowLeft}} or {{key:UP|ArrowUp}} to rotate the tunnel wheel backward.',
                'Use {{key:RIGHT|ArrowRight}} or {{key:DOWN|ArrowDown}} to rotate it forward. The selected Class tunnel will physically dock with the wire on the left.',
                '',
                'For direct control, press {{key:A|KeyA}}, {{key:B|KeyB}}, {{key:C|KeyC}}, {{key:D|KeyD}}, or {{key:E|KeyE}}, or click a labeled tunnel port inside the X-ray.',
            ]],
            onComplete,
        });
    },

    showUpcomingGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.upcoming.', {
            title: 'PACKET DECK',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'The two dim cards on the left are {{highlight:upcoming packets}}. {{highlight:Next +1}} arrives first; Next +2 follows it.',
                '',
                'They are previews only, not extra live packets. Use them to prepare without losing track of the signal already in the conduit.',
            ]],
            onComplete,
        });
    },

    showCurrentGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.current.', {
            title: 'CURRENT PACKET',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'The bright rightmost card marked {{highlight:Current}} belongs to the packet flowing through the conduit now.',
                '',
                'Its large type label identifies either an {{highlight:IP address}} in cyan or a {{highlight:subnet mask}} in amber.',
                '{{highlight:Read the packet type before classifying the number.}} A leading 255 means something different on a subnet mask than it does on a regular IP address.',
            ]],
            onComplete,
        });
    },

    showTrainingPacketGuide(packet, onComplete) {
        const data = packet || {};
        const lesson = data.tutorialLesson || {};
        const className = String(data.className || lesson.className || '?').toUpperCase();
        const value = String(data.text || 'UNKNOWN SIGNAL');
        const isMask = String(data.kind || '').toUpperCase() === 'MASK';
        const rangeSpec = this._rangeSpec(className);
        const classRange = rangeSpec ? 'first-octet range ' + rangeSpec.shortRange : 'centralized class range';
        const order = Math.max(1, Number(lesson.order) || 1);
        const title = isMask ? 'SUBNET MASK TRAINING ' + order + '/3' : 'IP CLASS TRAINING ' + order + '/5';
        const explanation = isMask
            ? '{{highlight:' + value + '}} is a {{highlight:subnet mask}} pattern for {{highlight:Class ' + className + '}}.'
            : '{{highlight:' + value + '}} is an {{highlight:IP address}} belonging to {{highlight:Class ' + className + '}} because it falls within the {{highlight:' + classRange + '}}.';

        return this._startDynamicDialogue('stage1.ippatchpanel.guided.training.', {
            title,
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                explanation,
                '',
                'Rotate the wheel until {{highlight:Class ' + className + '}} docks with the left wire, then let the packet cross the center core.',
                isMask
                    ? 'Do not classify this mask from its leading {{highlight:255}}. Memorize the full pattern; these standard lessons cover {{highlight:Classes A, B, and C}}.'
                    : 'The five guided IP packets progress through {{highlight:Class A to Class E}} using their first-octet ranges.',
            ]],
            onComplete,
        });
    },

    showIndependentGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.independent.', {
            title: 'INDEPENDENT ROUTING',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'You now know the {{highlight:three standard subnet masks}} and the {{highlight:IP Class A–E ranges}}. Route the remaining 7 IP packets on your own.',
                '',
                'Keep reading the CURRENT card, use the two upcoming previews to prepare, and secure at least 10 of all 15 packets to proceed.',
            ]],
            onComplete,
        });
    },

    showRoundReset(score, target, total, attemptsRemaining, onComplete) {
        if (typeof attemptsRemaining === 'function') {
            onComplete = attemptsRemaining;
            attemptsRemaining = 1;
        }
        const secured = Number(score) || 0;
        const targetScore = Number(target) || 10;
        const delivered = Number(total) || 15;
        const remaining = Math.max(0, Number(attemptsRemaining) || 0);
        return this._startDynamicDialogue('stage1.ippatchpanel.reset.', {
            title: 'ROUND RESET',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.failed',
            },
            slides: [
                [
                    'The packet stream ended with ' + secured + ' / ' + delivered + ' secured routes. The required threshold is ' + targetScore + '.',
                    '',
                    'You cannot proceed until you complete a passing round. ' + remaining + ' attempt remains.',
                    'The full 15-packet stream will restart once. Secure at least ' + targetScore + ' packets or we will return to tutorial training.',
                ],
            ],
            onComplete,
        });
    },

    showRecovery(failedLabel, onComplete) {
        const label = failedLabel || 'the unfinished Patch Panel node';
        return this._startDynamicDialogue('stage1.ippatchpanel.recovery.', {
            title: 'TRAINING PROTOCOL RESTORED',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.failed',
            },
            slides: [[
                'Both Patch Panel attempts missed the required routing threshold.',
                '',
                'Return to the guided Patch Panel node and complete the tutorial sequence again.',
            ], [
                'Once training is stable, the route will resume at ' + label + '.',
                'Read the current packet carefully and use the upcoming packet previews to prepare.',
            ]],
            onComplete,
        });
    },

    showVictory(result, onComplete) {
        const data = result || {};
        const secured = Number(data.score) || 0;
        const total = Number(data.totalPackets) || 15;
        return this._startDynamicDialogue('stage1.ippatchpanel.victory.', {
            title: 'PATCH PANEL STABILIZED',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.completed',
            },
            slides: [
                [
                    'Outstanding routing discipline.',
                    'You secured ' + secured + ' / ' + total + ' packets through the panel core.',
                    '',
                    'Node integrity has been restored.',
                ],
            ],
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
        return dm.start(id, { source: 'IPPatchPanelTutorial' });
    },
};

IP2Live.IPPatchPanelTutorial = IPPatchPanelTutorial;
window.IP2LiveIPPatchPanelTutorial = IPPatchPanelTutorial;

console.log('[IP2Live] ip_patchpanel_tutorial.js loaded.');
