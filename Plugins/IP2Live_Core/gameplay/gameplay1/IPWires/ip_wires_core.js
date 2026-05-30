/**
 * IP2Live - IP Wires Shared Core
 *
 * Shared class ranges and puzzle generation utilities for IP wires gameplay.
 */

(function () {
    const CLASS_SPECS = [
        { className: 'A', min: 1, max: 126, color: '#FFE600', rangeText: '1.0.0.0 to 126.255.255.255', shortRange: '001-126' },
        { className: 'B', min: 127, max: 191, color: '#2455FF', rangeText: '127.0.0.0 to 191.255.255.255', shortRange: '127-191' },
        { className: 'C', min: 192, max: 223, color: '#FF003C', rangeText: '192.0.0.0 to 223.255.255.255', shortRange: '192-223' },
        { className: 'D', min: 224, max: 239, color: '#FF3CFF', rangeText: '224.0.0.0 to 239.255.255.255', shortRange: '224-239' },
        { className: 'E', min: 240, max: 255, color: '#00FF9D', rangeText: '240.0.0.0 to 255.255.255.255', shortRange: '240-255' },
    ];

    function cloneClassSpecs() {
        return CLASS_SPECS.map(function (spec) {
            return Object.assign({}, spec);
        });
    }

    function clampWireCount(value, fallback) {
        const raw = Number(value);
        const normalized = Number.isFinite(raw) ? raw : (Number.isFinite(Number(fallback)) ? Number(fallback) : 8);
        return Math.max(5, Math.min(8, Math.round(normalized)));
    }

    function rand(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    function shuffle(items) {
        const copy = Array.isArray(items) ? items.slice() : [];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    function specByClassName(className) {
        for (let i = 0; i < CLASS_SPECS.length; i++) {
            if (CLASS_SPECS[i].className === className) return CLASS_SPECS[i];
        }
        return null;
    }

    function generateIPForClass(className) {
        const spec = specByClassName(className);
        if (!spec) return null;
        const octets = [
            rand(spec.min, spec.max),
            rand(0, 255),
            rand(0, 255),
            rand(1, 254),
        ];
        return {
            className: spec.className,
            color: spec.color,
            ip: octets.join('.'),
            octets: octets,
        };
    }

    function generateDefaultPuzzle() {
        const output = [];
        for (let i = 0; i < CLASS_SPECS.length; i++) {
            const generated = generateIPForClass(CLASS_SPECS[i].className);
            if (generated) output.push(generated);
        }
        return output;
    }

    function generateHarderPuzzle(wireCount) {
        const clamped = clampWireCount(wireCount, 8);
        const classNames = CLASS_SPECS.map(function (spec) { return spec.className; });
        const counts = {};
        for (let i = 0; i < classNames.length; i++) counts[classNames[i]] = 0;
        const maxDistinct = Math.min(classNames.length, clamped - 1);
        const distinctCount = rand(2, Math.max(2, maxDistinct));
        const chosen = shuffle(classNames).slice(0, distinctCount);
        let used = 0;
        for (let i = 0; i < chosen.length; i++) {
            counts[chosen[i]] += 1;
            used++;
        }

        // Always force at least one duplicate class in harder mode.
        const duplicatedClass = chosen[rand(0, chosen.length - 1)];
        counts[duplicatedClass] += 1;
        used++;

        // Fill the rest from already chosen classes so some classes can stay empty.
        while (used < clamped) {
            const className = chosen[rand(0, chosen.length - 1)];
            counts[className] += 1;
            used++;
        }

        const selectedClasses = [];
        for (let i = 0; i < classNames.length; i++) {
            const className = classNames[i];
            for (let n = 0; n < counts[className]; n++) selectedClasses.push(className);
        }

        const output = [];
        const finalSelection = shuffle(selectedClasses);
        for (let i = 0; i < finalSelection.length; i++) {
            const generated = generateIPForClass(finalSelection[i]);
            if (generated) output.push(generated);
        }
        return output;
    }

    const Core = {
        VERSION: 'ip-wires-core-20260530-04',
        CLASS_SPECS: CLASS_SPECS,
        cloneClassSpecs: cloneClassSpecs,
        clampWireCount: clampWireCount,
        specByClassName: specByClassName,
        generateIPForClass: generateIPForClass,
        generateDefaultPuzzle: generateDefaultPuzzle,
        generateHarderPuzzle: generateHarderPuzzle,
        shuffle: shuffle,
        rand: rand,
    };

    IP2Live.IPWiresCore = Core;
    window.IP2LiveIPWiresCore = Core;
    console.log('[IP2Live] ip_wires_core.js loaded.');
}());
