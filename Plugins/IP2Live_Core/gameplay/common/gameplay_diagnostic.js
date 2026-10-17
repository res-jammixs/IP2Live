/** Plain-data explanations shared by the Story error journal. No grading changes. */
(function () {
    'use strict';
    class GameplayDiagnostic {
        constructor(id, label) { this.id = id; this.label = label; }
        value(value) {
            if (value === undefined) return 'Not recorded';
            if (value === null || value === '') return 'No valid answer submitted';
            if (Array.isArray(value)) return value.join(' · ') || 'Nothing selected';
            if (typeof value === 'object') return Object.entries(value).map(([key, v]) => key + ': ' + this.value(v)).join('\n');
            return String(value);
        }
        explain(row) {
            return { title: 'Review this attempt', why: row.detail || 'The submitted answer did not satisfy this task’s recorded check.',
                hint: row.hint || 'Compare your answer with the expected result, then try the same reasoning in Practice.',
                submitted: this.value(row.submitted !== undefined ? row.submitted : row.submittedText),
                expected: row.expected === undefined && row.expectedText === undefined ? 'Expected value not recorded' : this.value(row.expected !== undefined ? row.expected : row.expectedText) };
        }
        result(row, title, why, hint, extra = {}) { return Object.assign(GameplayDiagnostic.prototype.explain.call(this, row), { title, why, hint }, extra); }
        classification(row, title) {
            const source = String(row.sourceText || row.leftLabel || row.address || 'the recorded address');
            const expected = row.expected || row.sourceClass;
            const spec = IP2Live.IPClassRanges && IP2Live.IPClassRanges.byClassName(expected);
            const mask = /mask/i.test(row.concept || row.stepKey || '');
            if (mask) {
                const masks = { A: '255.0.0.0 (/8)', B: '255.255.0.0 (/16)', C: '255.255.255.0 (/24)' };
                return this.result(row, title, '**' + source + '** is the classful default mask for **Class ' + expected + '**' +
                    (masks[expected] ? ': **' + masks[expected] + '**.' : '.'),
                    'For a default mask, count the complete network octets. An explicitly assigned CIDR mask can differ from a classful default.');
            }
            const first = /^\d+\./.test(source) ? source.split('.')[0] : null;
            const why = spec ? '**' + source + '** belongs to **Class ' + expected + '**. ' +
                (first ? 'Its first octet, **' + first + '**, falls ' : 'Its class is determined by the first octet, ') +
                'inside **' + spec.shortRange + '** (' + spec.rangeText + ').' : 'Use the first octet of **' + source + '** to identify its class; the recorded expected class is **' + expected + '**.';
            return this.result(row, title, why, 'Compare the first octet with the class ranges before connecting or routing. ' +
                (expected === 'A' ? 'The game partitions Class A as 0–127; 0/8 and 127/8 have special uses and are not ordinary host networks.' :
                    expected === 'D' ? 'Class D is multicast, not an ordinary unicast host class.' : expected === 'E' ? 'Class E is reserved, not an ordinary unicast host class.' : 'The last three octets do not change the legacy class.'));
        }
    }
    IP2Live.GameplayDiagnostic = GameplayDiagnostic;
    IP2Live.GameplayDiagnostics = {
        adapters: Object.create(null),
        register(adapter) { this.adapters[adapter.id] = adapter; return adapter; },
        get(id) { return this.adapters[id] || new GameplayDiagnostic(id, id); },
    };
})();
