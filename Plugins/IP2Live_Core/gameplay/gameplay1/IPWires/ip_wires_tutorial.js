/**
 * IP2Live - IP Wires Tutorial Dialogue Helpers
 *
 * Guided tutorial content and feedback for Stage 1 Level 1 IP wires gameplay.
 */

(function () {
    const core = IP2Live.IPWiresCore || {};
    const classSpecs = typeof core.cloneClassSpecs === 'function' ? core.cloneClassSpecs() : [];

    function classSpec(className) {
        if (core && typeof core.specByClassName === 'function') return core.specByClassName(className);
        for (let i = 0; i < classSpecs.length; i++) if (classSpecs[i].className === className) return classSpecs[i];
        return null;
    }

    function ordinal(index) {
        const n = Number(index) + 1;
        if (n === 1) return 'first';
        if (n === 2) return 'second';
        if (n === 3) return 'third';
        if (n === 4) return 'fourth';
        if (n === 5) return 'fifth';
        return n + 'th';
    }

    const IPWiresTutorial = {
        VERSION: 'ip-wires-tutorial-20260530-01',
        _dialogueSerial: 0,

        classRanges: {
            A: '1 to 126',
            B: '127 to 191',
            C: '192 to 223',
            D: '224 to 239',
            E: '240 to 255',
        },

        activateGuidedSession(screen) {
            if (!screen || !Array.isArray(screen.leftItems) || !screen.leftItems.length) return false;
            if (screen._ipGuide && screen._ipGuide.active) return true;
            screen._ipGuide = {
                active: true,
                sequence: screen.leftItems.map(function (item) { return Object.assign({}, item); }),
                stepIndex: 0,
                expectedSourceId: null,
                expectedClassName: null,
            };

            this._runIntroSequence(screen);
            return true;
        },

        isGuidedActive(screen) {
            return !!(screen && screen._ipGuide && screen._ipGuide.active);
        },

        expectedGuidedSourceId(screen) {
            return this.isGuidedActive(screen) ? screen._ipGuide.expectedSourceId : null;
        },

        expectedGuidedClass(screen) {
            return this.isGuidedActive(screen) ? screen._ipGuide.expectedClassName : null;
        },

        _runIntroSequence(screen) {
            this._clearHighlight(screen);
            this._startDynamicDialogue('stage1.ipwires.guided.welcome.', {
                title: 'WIRE PATCH',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 3,
                    gameplayId: 'ip_class_wires',
                    objectiveId: 'repair_ip_wires_01',
                    trigger: 'gameplay.before',
                },
                slides: [[
                    'Welcome to the IP wires gameplay.',
                    '',
                    'There are core levers on this floor that need to be activated',
                    'to unlock the door and move to the next stage.',
                ]],
                onComplete: () => {
                    this._setHighlight(screen, 'left');
                    this._startDynamicDialogue('stage1.ipwires.guided.left.', {
                        title: 'WIRE PATCH',
                        speaker: 'SYSTEM',
                        timing: 'during',
                        bindings: { mapId: 3, gameplayId: 'ip_class_wires', trigger: 'gameplay.before' },
                        slides: [[
                            'The left side contains the IP addresses.',
                            'Each connector starts from one full IP address.',
                        ]],
                        onComplete: () => {
                            this._setHighlight(screen, 'right');
                            this._startDynamicDialogue('stage1.ipwires.guided.right.', {
                                title: 'WIRE PATCH',
                                speaker: 'SYSTEM',
                                timing: 'during',
                                bindings: { mapId: 3, gameplayId: 'ip_class_wires', trigger: 'gameplay.before' },
                                slides: [[
                                    'The right side contains the Class connectors.',
                                    'You will match each IP address to its correct Class.',
                                ]],
                                onComplete: () => {
                                    this._clearHighlight(screen);
                                    this._startDynamicDialogue('stage1.ipwires.guided.howto.', {
                                        title: 'WIRE PATCH',
                                        speaker: 'SYSTEM',
                                        timing: 'during',
                                        bindings: { mapId: 3, gameplayId: 'ip_class_wires', trigger: 'gameplay.before' },
                                        slides: [[
                                            'How to solve this:',
                                            '',
                                            'Hover your mouse on the left connector, hold it,',
                                            'then drag and connect it to the correct Class connector.',
                                        ]],
                                        onComplete: () => {
                                            this._startGuidedStep(screen);
                                        },
                                    });
                                },
                            });
                        },
                    });
                },
            });
        },

        _startGuidedStep(screen) {
            if (!this.isGuidedActive(screen)) return;
            const guide = screen._ipGuide;
            if (guide.stepIndex >= guide.sequence.length) {
                this._finishGuidedSession(screen);
                return;
            }

            const item = guide.sequence[guide.stepIndex];
            guide.expectedSourceId = item.id;
            guide.expectedClassName = item.className;
            const spec = classSpec(item.className);
            const rangeText = spec ? spec.rangeText : ('Class ' + item.className + ' range');
            const lead = guide.stepIndex === 0 ? 'The first IP address' : ('The ' + ordinal(guide.stepIndex) + ' IP address');

            this._startDynamicDialogue('stage1.ipwires.guided.step.', {
                title: 'WIRE PATCH',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: { mapId: 3, gameplayId: 'ip_class_wires', trigger: 'gameplay.before' },
                slides: [[
                    lead + ' which is ' + item.ip + ' belongs to Class ' + item.className + '.',
                    'Class ' + item.className + ' has a range of ' + rangeText + '.',
                    '',
                    'Try dragging the connector IP address to Class ' + item.className + '.',
                ]],
            });
        },

        onGuidedWrongTarget(screen, sourceItem, attemptedClass) {
            if (!this.isGuidedActive(screen)) return false;
            const expected = this.expectedGuidedClass(screen);
            if (!expected || !sourceItem) return false;
            const attempted = attemptedClass || '?';
            this._startDynamicDialogue('stage1.ipwires.guided.wrong.', {
                title: 'WIRE PATCH',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: { mapId: 3, gameplayId: 'ip_class_wires', trigger: 'gameplay.mistake' },
                slides: [[
                    sourceItem.ip + ' is not Class ' + attempted + '.',
                    'Check the first octet range and connect it to Class ' + expected + '.',
                ]],
            });
            return true;
        },

        onGuidedCorrectConnection(screen, sourceItem) {
            if (!this.isGuidedActive(screen) || !sourceItem) return false;
            const guide = screen._ipGuide;
            guide.stepIndex++;
            guide.expectedSourceId = null;
            guide.expectedClassName = null;

            const motivational = [
                'You are doing great. Keep it up.',
                'Excellent connector control. Stay focused.',
                'Nice work. Your class matching is getting sharper.',
                'Great progress. One step closer to a stable network.',
            ];
            const line = motivational[(guide.stepIndex - 1) % motivational.length];

            this._startDynamicDialogue('stage1.ipwires.guided.correct.', {
                title: 'WIRE PATCH',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: { mapId: 3, gameplayId: 'ip_class_wires', trigger: 'gameplay.during' },
                slides: [[
                    'You are doing great!',
                    line,
                ]],
                onComplete: () => {
                    this._startGuidedStep(screen);
                },
            });
            return true;
        },

        _finishGuidedSession(screen) {
            if (!this.isGuidedActive(screen)) return false;
            screen._ipGuide.active = false;
            screen._ipGuide.expectedSourceId = null;
            screen._ipGuide.expectedClassName = null;
            this._clearHighlight(screen);
            return this._startDynamicDialogue('stage1.ipwires.guided.final.', {
                title: 'WIRE PATCH',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: { mapId: 3, gameplayId: 'ip_class_wires', trigger: 'gameplay.completed' },
                slides: [[
                    'You are now ready for successfully connecting all the levers for it to work properly.',
                    '',
                    'Remember again this:',
                    '',
                    'Class A: IP ranges from 1.0.0.0 to 126.255.255.255',
                    'Class B: IP ranges from 127.0.0.0 to 191.255.255.255',
                    'Class C: IP ranges from 192.0.0.0 to 223.255.255.255',
                    'Class D: IP ranges from 224.0.0.0 to 239.255.255.255',
                    'Class E: IP ranges from 240.0.0.0 to 255.255.255.255',
                ]],
            });
        },

        drawGuidedHighlight(ctx, layout, screen) {
            if (!screen || !screen._ipGuideHighlight || !ctx || !layout || !layout.panel) return;
            const side = screen._ipGuideHighlight.side;
            const p = layout.panel;
            const pad = 18 * layout.sX;
            const mid = p.x + p.w / 2;
            const rect = side === 'right'
                ? { x: mid + 8 * layout.sX, y: p.y + 95 * layout.sY, w: p.w * 0.46 - pad, h: p.h - 150 * layout.sY }
                : { x: p.x + pad, y: p.y + 95 * layout.sY, w: p.w * 0.46 - pad, h: p.h - 150 * layout.sY };

            ctx.save();
            const pulse = 0.55 + 0.45 * Math.sin((screen.animTick || 0) * 0.14);
            ctx.fillStyle = 'rgba(0,240,255,0.08)';
            ctx.strokeStyle = 'rgba(0,255,255,' + (0.65 + pulse * 0.25) + ')';
            ctx.lineWidth = 2 * layout.sX;
            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = (10 + pulse * 10) * layout.sX;
            this._roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * layout.sX);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },

        _roundedRect(ctx, x, y, w, h, r) {
            const rr = Math.max(2, Math.min(r, Math.min(w, h) * 0.5));
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.lineTo(x + w - rr, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
            ctx.lineTo(x + w, y + h - rr);
            ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
            ctx.lineTo(x + rr, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
            ctx.lineTo(x, y + rr);
            ctx.quadraticCurveTo(x, y, x + rr, y);
            ctx.closePath();
        },

        _setHighlight(screen, side) {
            if (!screen) return;
            screen._ipGuideHighlight = { side: side === 'right' ? 'right' : 'left' };
        },

        _clearHighlight(screen) {
            if (screen) screen._ipGuideHighlight = null;
        },

        showMistakeAnalysis(mistakes, attemptsRemaining, onComplete) {
            const dm = IP2Live.DialogueManager;
            if (!dm || typeof dm.registerDialogue !== 'function' || typeof dm.start !== 'function') {
                if (typeof onComplete === 'function') onComplete();
                return false;
            }

            const list = Array.isArray(mistakes) ? mistakes : [];
            const slides = [[
                'REAL-TIME PACKET ANALYSIS COMPLETE.',
                '',
                'I found ' + list.length + ' unstable wire' + (list.length === 1 ? '' : 's') + ' in that patch.',
                'Correct wires are stable. The wrong wires have been disconnected.',
            ]];

            for (let i = 0; i < list.length; i += 2) {
                const slide = [];
                for (let j = i; j < list.length && j < i + 2; j++) {
                    const mistake = list[j];
                    const sourceSpec = classSpec(mistake.sourceClass);
                    slide.push(
                        mistake.leftLabel + ' belongs to Class ' + mistake.sourceClass +
                        ', but you connected it to Class ' + mistake.targetClass + '.'
                    );
                    slide.push(
                        'Remember: Class ' + mistake.sourceClass +
                        ' uses first-octet values from ' + (sourceSpec ? sourceSpec.shortRange : this.classRanges[mistake.sourceClass] || '?') + '.'
                    );
                    if (j < list.length - 1 && j < i + 1) slide.push('');
                }
                slides.push(slide);
            }

            slides.push([
                'Try it again, Infiltrator.',
                'You have ' + attemptsRemaining + ' chance' + (attemptsRemaining === 1 ? '' : 's') + ' left before the packets shift.',
                '',
                'The APEX defense layer keeps rearranging these packets to stop intruders.',
                'You can do it.',
            ]);

            return this._startDynamicDialogue('stage1.ipwires.tutorial.analysis.', {
                title: 'WIRE ANALYSIS',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 3,
                    gameplayId: 'ip_class_wires',
                    trigger: 'gameplay.mistake',
                },
                slides: slides,
                onComplete: onComplete,
            });
        },

        showPacketsShifted(onComplete) {
            return this._startDynamicDialogue('stage1.ipwires.tutorial.shifted.', {
                title: 'PACKET SHIFT',
                speaker: 'SYSTEM',
                timing: 'after',
                bindings: {
                    mapId: 3,
                    gameplayId: 'ip_class_wires',
                    objectiveId: 'repair_ip_wires_01',
                    trigger: 'gameplay.failed',
                },
                slides: [[
                    'Oh no!',
                    'They noticed us and shifted the packets again.',
                    '',
                    'Step back onto the wire node when you are ready.',
                    'The next panel will be a fresh randomized packet set.',
                ]],
                onComplete: onComplete,
            });
        },

        showStageRepairReset(failedLabel, onComplete) {
            const label = failedLabel || 'the active wire node';
            return this._startDynamicDialogue('stage1.ipwires.recovery.reset.', {
                title: 'LEVEL INSTABILITY',
                speaker: 'SYSTEM',
                timing: 'after',
                bindings: {
                    mapId: 3,
                    gameplayId: 'ip_class_wires',
                    trigger: 'gameplay.failed',
                },
                slides: [[
                    'Oh no!',
                    'Too many packet errors tripped the APEX rollback circuit.',
                    '',
                    'The first Level 1 lever repair is broken again and needs fixing.',
                ], [
                    'Repair the first lever again.',
                    'After it stabilizes, I will route you back to ' + label + '.',
                ]],
                onComplete: onComplete,
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
            return dm.start(id, { source: 'IPWiresTutorial' });
        },
    };

    IP2Live.IPWiresTutorial = IPWiresTutorial;
    window.IP2LiveIPWiresTutorial = IPWiresTutorial;
    console.log('[IP2Live] ip_wires_tutorial.js loaded.');
}());
