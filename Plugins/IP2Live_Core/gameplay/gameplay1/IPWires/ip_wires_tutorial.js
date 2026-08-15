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
        VERSION: 'ip-wires-tutorial-20260815-03',
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
                    'Stage 1 Level 1 has four repair levers tied to lights and equipment.',
                    'Each successful wire patch restores part of this floor.',
                    'Stabilize all four levers to unlock the door to the next level.',
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
                                    const firstItem = screen.leftItems && screen.leftItems.length ? screen.leftItems[0] : null;
                                    this._setHighlight(screen, 'route', firstItem ? {
                                        sourceId: firstItem.id,
                                        className: firstItem.className,
                                        label: 'HOLD + DRAG ROUTE',
                                    } : null);
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
            this._setHighlight(screen, 'route', {
                sourceId: item.id,
                className: item.className,
                label: 'PATCH ROUTE // CLASS ' + item.className,
            });
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
            this._clearHighlight(screen);

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
                    'You are now ready to repair all four Level 1 levers.',
                    '',
                    'Each fixed lever restores more power to this floor.',
                    'When all four are stable, the next-level door will open.',
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
            const highlight = screen._ipGuideHighlight;
            const side = highlight.side || 'left';
            const p = layout.panel;
            const focusRects = [];
            const padX = 8 * layout.sX;
            const padY = 8 * layout.sY;

            if (side === 'reroll') {
                const sourceIds = Array.isArray(highlight.sourceIds) ? highlight.sourceIds : [];
                for (let i = 0; i < sourceIds.length; i++) {
                    const sourcePoint = layout.leftPoints ? layout.leftPoints[sourceIds[i]] : null;
                    if (sourcePoint && typeof screen._terminalBounds === 'function') {
                        focusRects.push(this._padRect(screen._terminalBounds(sourcePoint, false, true), padX, padY));
                    }
                }
                if (!focusRects.length && layout.leftBank) {
                    focusRects.push(this._bankFocusRect(layout.leftBank, layout));
                }
            } else if (side === 'route') {
                const sourcePoint = highlight.sourceId && layout.leftPoints ? layout.leftPoints[highlight.sourceId] : null;
                const targetPoint = highlight.className && layout.rightPoints ? layout.rightPoints[highlight.className] : null;
                if (sourcePoint && typeof screen._terminalBounds === 'function') {
                    focusRects.push(this._padRect(screen._terminalBounds(sourcePoint, false, true), padX, padY));
                }
                if (targetPoint && typeof screen._terminalBounds === 'function') {
                    focusRects.push(this._padRect(screen._terminalBounds(targetPoint, true, false), padX, padY));
                }
                if (!focusRects.length) {
                    if (layout.leftBank) focusRects.push(this._bankFocusRect(layout.leftBank, layout));
                    if (layout.rightBank) focusRects.push(this._bankFocusRect(layout.rightBank, layout));
                }
            } else if (side === 'right' && layout.rightBank) {
                focusRects.push(this._bankFocusRect(layout.rightBank, layout));
            } else if (side === 'panel') {
                focusRects.push({
                    x: p.x + 12 * layout.sX,
                    y: p.y + 72 * layout.sY,
                    w: p.w - 24 * layout.sX,
                    h: p.h - 132 * layout.sY,
                });
            } else if (layout.leftBank) {
                focusRects.push(this._bankFocusRect(layout.leftBank, layout));
            }

            if (!focusRects.length) return;
            for (let i = 0; i < focusRects.length; i++) focusRects[i] = this._clampRect(focusRects[i], p);

            ctx.save();
            const pulse = 0.55 + 0.45 * Math.sin((screen.animTick || 0) * 0.14);
            const accent = side === 'reroll' ? '#FF315F' : (side === 'route' ? '#FFE600' : '#00F0FF');
            const accentRgb = side === 'reroll' ? '255,49,95' : (side === 'route' ? '255,230,0' : '0,240,255');
            ctx.beginPath();
            ctx.rect(p.x, p.y, p.w, p.h);
            for (let i = 0; i < focusRects.length; i++) {
                const rect = focusRects[i];
                this._appendAngularRect(ctx, rect.x, rect.y, rect.w, rect.h, 12 * layout.sX);
            }
            ctx.fillStyle = 'rgba(0,2,8,0.66)';
            try {
                ctx.fill('evenodd');
            } catch (e) {
                ctx.fill();
            }

            if (side === 'route' && focusRects.length >= 2) {
                const from = focusRects[0];
                const to = focusRects[1];
                ctx.save();
                ctx.setLineDash([9 * layout.sX, 8 * layout.sX]);
                ctx.lineDashOffset = -((screen.animTick || 0) * 0.9 * layout.sX);
                ctx.strokeStyle = 'rgba(255,230,0,' + (0.54 + pulse * 0.34) + ')';
                ctx.lineWidth = 2 * layout.sX;
                ctx.shadowColor = '#FFE600';
                ctx.shadowBlur = 8 * layout.sX;
                ctx.beginPath();
                ctx.moveTo(from.x + from.w, from.y + from.h / 2);
                ctx.bezierCurveTo(
                    p.x + p.w * 0.42,
                    from.y + from.h / 2,
                    p.x + p.w * 0.58,
                    to.y + to.h / 2,
                    to.x,
                    to.y + to.h / 2
                );
                ctx.stroke();
                ctx.restore();
            }

            for (let i = 0; i < focusRects.length; i++) {
                const rect = focusRects[i];
                ctx.save();
                this._angularRect(ctx, rect.x, rect.y, rect.w, rect.h, 12 * layout.sX);
                ctx.fillStyle = 'rgba(' + accentRgb + ',' + (0.035 + pulse * 0.035) + ')';
                ctx.fill();
                ctx.strokeStyle = 'rgba(' + accentRgb + ',' + (0.68 + pulse * 0.28) + ')';
                ctx.lineWidth = 2 * layout.sX;
                ctx.shadowColor = accent;
                ctx.shadowBlur = (10 + pulse * 9) * layout.sX;
                ctx.stroke();

                ctx.clip();
                const sweepY = rect.y + ((screen.animTick || 0) * 1.15 * layout.sY % Math.max(1, rect.h));
                const sweep = ctx.createLinearGradient(0, sweepY - 14 * layout.sY, 0, sweepY + 14 * layout.sY);
                sweep.addColorStop(0, 'rgba(' + accentRgb + ',0)');
                sweep.addColorStop(0.5, 'rgba(' + accentRgb + ',0.18)');
                sweep.addColorStop(1, 'rgba(' + accentRgb + ',0)');
                ctx.fillStyle = sweep;
                ctx.fillRect(rect.x, sweepY - 14 * layout.sY, rect.w, 28 * layout.sY);
                ctx.restore();
            }

            const label = highlight.label || (side === 'right'
                ? 'FOCUS // CLASS TARGET BANK'
                : (side === 'route'
                    ? 'FOCUS // PATCH ROUTE'
                    : (side === 'reroll'
                        ? 'ALERT // REJECTED LEADS RE-KEYED'
                        : (side === 'panel' ? 'FOCUS // PATCH CHASSIS' : 'FOCUS // IP SOURCE BANK'))));
            const first = focusRects[0];
            let labelW = Math.min(first.w, Math.max(126 * layout.sX, label.length * 6.3 * layout.sX));
            let labelX = first.x + 8 * layout.sX;
            let labelY = side === 'panel' ? first.y + 8 * layout.sY : first.y + 37 * layout.sY;
            if (side === 'route' && focusRects.length >= 2) {
                const corridorLeft = first.x + first.w + 12 * layout.sX;
                const corridorRight = focusRects[1].x - 12 * layout.sX;
                labelW = Math.min(Math.max(1, corridorRight - corridorLeft), Math.max(126 * layout.sX, label.length * 6.3 * layout.sX));
                labelX = corridorLeft;
                labelY = first.y + 7 * layout.sY;
            } else if (side === 'reroll') {
                const corridorLeft = first.x + first.w + 12 * layout.sX;
                const corridorRight = layout.rightBank ? layout.rightBank.x - 12 * layout.sX : p.x + p.w - 12 * layout.sX;
                labelW = Math.min(Math.max(1, corridorRight - corridorLeft), Math.max(142 * layout.sX, label.length * 6.3 * layout.sX));
                labelX = corridorLeft;
                labelY = first.y + 7 * layout.sY;
            }
            ctx.fillStyle = accent;
            this._angularRect(ctx, labelX, labelY, labelW, 20 * layout.sY, 5 * layout.sX);
            ctx.fill();
            ctx.font = 'bold ' + Math.round(7.5 * layout.sX) + 'px monospace';
            ctx.fillStyle = '#020508';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, labelX + 9 * layout.sX, labelY + 10 * layout.sY);
            ctx.restore();
        },

        _padRect(rect, padX, padY) {
            return {
                x: rect.x - padX,
                y: rect.y - padY,
                w: rect.w + padX * 2,
                h: rect.h + padY * 2,
            };
        },

        _bankFocusRect(bank, layout) {
            const padX = 8 * layout.sX;
            const topPad = 36 * layout.sY;
            const bottomPad = 8 * layout.sY;
            return {
                x: bank.x - padX,
                y: bank.y - topPad,
                w: bank.w + padX * 2,
                h: bank.h + topPad + bottomPad,
            };
        },

        _clampRect(rect, panel) {
            const x = Math.max(panel.x + 4, rect.x);
            const y = Math.max(panel.y + 4, rect.y);
            const right = Math.min(panel.x + panel.w - 4, rect.x + rect.w);
            const bottom = Math.min(panel.y + panel.h - 4, rect.y + rect.h);
            return { x: x, y: y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
        },

        _appendAngularRect(ctx, x, y, w, h, cut) {
            const c = Math.max(2, Math.min(cut, Math.min(w, h) * 0.35));
            ctx.moveTo(x + c, y);
            ctx.lineTo(x + w - c, y);
            ctx.lineTo(x + w, y + c);
            ctx.lineTo(x + w, y + h - c);
            ctx.lineTo(x + w - c, y + h);
            ctx.lineTo(x + c, y + h);
            ctx.lineTo(x, y + h - c);
            ctx.lineTo(x, y + c);
            ctx.closePath();
        },

        _angularRect(ctx, x, y, w, h, cut) {
            ctx.beginPath();
            this._appendAngularRect(ctx, x, y, w, h, cut);
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

        _setHighlight(screen, side, details) {
            if (!screen) return;
            const valid = side === 'right' || side === 'route' || side === 'panel' || side === 'reroll' ? side : 'left';
            screen._ipGuideHighlight = Object.assign({ side: valid }, details || {});
        },

        _clearHighlight(screen) {
            if (screen) screen._ipGuideHighlight = null;
        },

        setGuidedHighlight(screen, side, details) {
            this._setHighlight(screen, side, details);
        },

        clearGuidedHighlight(screen) {
            this._clearHighlight(screen);
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
                'Correct wires stay stable. Wrong wires were disconnected to protect lever integrity.',
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
                'Keep this lever stable so we can restore all four and open the next-level door.',
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
                    'APEX defense shifted the packets again.',
                    '',
                    'Step back onto Lever 01 when you are ready.',
                    'We need this lever stable before we can finish all four.',
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
                    'Lever 01 lost stability and power restoration progress dropped.',
                ], [
                    'Repair Lever 01 again.',
                    'After it stabilizes, I will route you back to ' + label + '.',
                    'All four levers must remain stable to unlock the next-level door.',
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
