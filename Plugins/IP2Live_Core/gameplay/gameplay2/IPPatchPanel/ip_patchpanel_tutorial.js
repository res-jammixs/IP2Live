/**
 * IP2Live - IP Patch Panel Tutorial Dialogue Helpers
 *
 * Dynamic dialogue content for the Stage 1 Level 2 patch-panel classifier gameplay.
 * Loaded before ip_patchpanel_gameplay.js.
 */

const IPPatchPanelTutorial = {
    VERSION: 'ip-patchpanel-tutorial-20260817-08',
    _dialogueSerial: 0,

    showIntro(onComplete) {
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
                    'Welcome to NETWORK PATCH: the conduit classifier protecting this route.',
                    'A packet enters from the left, crosses the inspection lane, and exits through the right after classification.',
                    '',
                    'The panel is divided into a live conduit XRAY, a five-Class tunnel core, a packet-flow rail, and a three-card packet deck.',
                ], [
                    'The XRAY exposes the hollow Class A-E tunnels inside the cable.',
                    'Rotate the active route with the ARROW KEYS before the live packet reaches the center core.',
                    '',
                    'You may also press A-E directly or click a labeled tunnel port.',
                ], [
                    'This stream contains both IP addresses and subnet masks.',
                    'Their numeric patterns determine which Class tunnel accepts them.',
                    '',
                    'The first 3 packets teach the standard Class A, B, and C subnet masks: 255.0.0.0, 255.255.0.0, and 255.255.255.0.',
                    'The next 5 packets review the IP address ranges for Classes A through E in order.',
                ], [
                    'GUIDED SAFETY LOCK is active for those first 8 training packets.',
                    'A wrong tunnel reverses the same signal to INGRESS without consuming a delivery or adding a scoring mistake.',
                    '',
                    'Try that packet again until it is correct. The final 7 independent IP packets use the normal scoring rules.',
                ], [
                    'The guided tutorial always runs all 15 packets so you can complete the entire lesson.',
                    'Secure at least 10 correctly to stabilize the panel and proceed.',
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
                'This illuminated pulse is the CURRENT packet entering through INGRESS on the left.',
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
                'The CONDUIT XRAY is a digital view inside the cable. It exposes five hollow tunnels surrounding the route core.',
                '',
                'The armed tunnel glows with its Class color. Read the current ' + label + ' in the packet deck, then align the correct tunnel before the signal reaches the core.',
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
                'The PACKET FLOW rail records all 15 deliveries in the round.',
                'Cyan segments are secured routes; red segments are misroutes; dark segments have not arrived yet.',
                '',
                'This guided tutorial records all 15 deliveries and requires at least 10 correct routes. Regular Patch Panel nodes finish as soon as the tenth route is secured.',
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
                'Use the LEFT or UP ARROW to rotate backward through the Class tunnels.',
                'Use the RIGHT or DOWN ARROW to rotate forward. The glowing tunnel is the route currently armed.',
                '',
                'For direct control, press A, B, C, D, or E, or click a labeled tunnel port inside the XRAY.',
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
                'The two dim cards on the LEFT are upcoming packets. NEXT +1 arrives first; NEXT +2 follows it.',
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
                'The bright rightmost card marked CURRENT belongs to the packet flowing through the conduit now.',
                '',
                'It identifies the value as an IP ADDRESS PACKET or a SUBNET MASK PACKET. Read this card, choose its Class, and route before the packet reaches the center.',
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
        const classRanges = {
            A: 'first octet 1-126',
            B: 'first octet 128-191',
            C: 'first octet 192-223',
            D: 'first octet 224-239',
            E: 'first octet 240-255',
        };
        const order = Math.max(1, Number(lesson.order) || 1);
        const title = isMask ? 'SUBNET MASK TRAINING ' + order + '/3' : 'IP CLASS TRAINING ' + order + '/5';
        const explanation = isMask
            ? value + ' is the standard subnet mask for Class ' + className + '.'
            : value + ' belongs to Class ' + className + ' because its ' + (classRanges[className] || 'class range') + '.';

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
                'Use the arrow keys to align CLASS ' + className + ', then let the packet cross the center core.',
                isMask
                    ? 'Memorize this mask pattern; only Classes A, B, and C use these standard subnet-mask lessons.'
                    : 'The five guided IP packets now progress from Class A through Class E.',
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
                'Now that you know the three standard subnet masks and the IP Class A-E ranges, route the remaining 7 IP packets on your own.',
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
