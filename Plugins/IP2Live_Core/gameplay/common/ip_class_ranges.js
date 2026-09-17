/**
 * IP2Live - Central IPv4 Class Ranges
 *
 * Every gameplay, tutorial, terminal, and loading tip that teaches Class A-E
 * boundaries must read from this module. This project intentionally uses a
 * complete, non-overlapping first-octet partition from 0 through 255.
 */

(function () {
    const SPECS = [
        { className: 'A', min: 0, max: 127, defaultPrefix: 8 },
        { className: 'B', min: 128, max: 191, defaultPrefix: 16 },
        { className: 'C', min: 192, max: 223, defaultPrefix: 24 },
        { className: 'D', min: 224, max: 239, defaultPrefix: null },
        { className: 'E', min: 240, max: 255, defaultPrefix: null },
    ].map(function (spec) {
        return Object.freeze(Object.assign({}, spec, {
            shortRange: spec.min + '-' + spec.max,
            rangeText: spec.min + '.0.0.0 to ' + spec.max + '.255.255.255',
        }));
    });

    function cloneSpecs() {
        return SPECS.map(function (spec) { return Object.assign({}, spec); });
    }

    function byClassName(className) {
        const wanted = String(className || '').trim().toUpperCase();
        for (let i = 0; i < SPECS.length; i++) {
            if (SPECS[i].className === wanted) return SPECS[i];
        }
        return null;
    }

    function classifyFirstOctet(value) {
        const octet = Number(value);
        if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
        for (let i = 0; i < SPECS.length; i++) {
            if (octet >= SPECS[i].min && octet <= SPECS[i].max) return SPECS[i].className;
        }
        return null;
    }

    function classifyAddress(address) {
        const first = String(address || '').trim().split('.')[0];
        if (first === '') return null;
        return classifyFirstOctet(Number(first));
    }

    function classNames() {
        return SPECS.map(function (spec) { return spec.className; });
    }

    function rangeSummary(separator) {
        const joiner = typeof separator === 'string' ? separator : ', ';
        return SPECS.map(function (spec) {
            return 'Class ' + spec.className + ': ' + spec.shortRange;
        }).join(joiner);
    }

    function loadingTip(className) {
        const spec = byClassName(className);
        if (!spec) return '';
        const prefix = spec.defaultPrefix ? ' and default to /' + spec.defaultPrefix : '';
        return 'Class ' + spec.className + ' addresses use ' + spec.shortRange + ' in the first octet' + prefix + '.';
    }

    const API = {
        VERSION: 'ip-class-ranges-20260918-01',
        SPECS,
        cloneSpecs,
        byClassName,
        classifyFirstOctet,
        classifyAddress,
        classNames,
        rangeSummary,
        loadingTip,
    };

    IP2Live.IPClassRanges = API;
    window.IP2LiveIPClassRanges = API;
    console.log('[IP2Live] ip_class_ranges.js loaded.');
}());
