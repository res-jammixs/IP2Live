/**
 * IP2Live - CIDR utility helpers for Stage 3 quarantine gameplay.
 * Loaded before gameplay5/gameplay6. No import/export.
 */

const IP2LiveCIDRTools = {
    VERSION: 'ip-cidr-tools-20260530-01',

    ipToInt(ip) {
        const parts = String(ip || '').trim().split('.');
        if (parts.length !== 4) return null;
        let out = 0;
        for (let i = 0; i < 4; i++) {
            const n = Number(parts[i]);
            if (!Number.isInteger(n) || n < 0 || n > 255) return null;
            out = ((out << 8) | n) >>> 0;
        }
        return out >>> 0;
    },

    intToIp(value) {
        const n = Number(value) >>> 0;
        return [
            (n >>> 24) & 255,
            (n >>> 16) & 255,
            (n >>> 8) & 255,
            n & 255,
        ].join('.');
    },

    blockSize(prefix) {
        const p = Number(prefix);
        if (!Number.isInteger(p) || p < 0 || p > 32) return 0;
        return Math.pow(2, 32 - p);
    },

    usableHosts(prefix) {
        const size = this.blockSize(prefix);
        if (size <= 2) return size;
        return size - 2;
    },

    smallestPrefixForHosts(hosts, minPrefix) {
        const h = Math.max(1, Number(hosts) || 1);
        const min = Number.isInteger(Number(minPrefix)) ? Number(minPrefix) : 0;
        for (let p = 32; p >= min; p--) {
            if (this.usableHosts(p) >= h) return p;
        }
        return min;
    },

    networkStart(ipInt, prefix) {
        const size = this.blockSize(prefix);
        if (!size) return 0;
        return Math.floor((Number(ipInt) >>> 0) / size) * size;
    },

    cidrFromOffset(baseIp, offset, prefix) {
        const base = typeof baseIp === 'number' ? (baseIp >>> 0) : this.ipToInt(baseIp);
        if (base === null) return null;
        return {
            baseIp: base >>> 0,
            start: (base + (Number(offset) || 0)) >>> 0,
            prefix: Number(prefix),
        };
    },

    parseCIDR(text) {
        const raw = String(text || '').trim();
        const parts = raw.split('/');
        if (parts.length !== 2) return null;
        const ip = this.ipToInt(parts[0]);
        const prefix = Number(parts[1]);
        if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
        return { start: ip >>> 0, prefix };
    },

    formatCIDR(start, prefix) {
        return this.intToIp(start >>> 0) + '/' + String(Number(prefix) || 0);
    },

    rangeFor(start, prefix) {
        const size = this.blockSize(prefix);
        const s = Number(start) >>> 0;
        return {
            start: s,
            end: (s + Math.max(0, size - 1)) >>> 0,
            prefix: Number(prefix),
            size,
        };
    },

    isAligned(start, prefix, baseStart) {
        const size = this.blockSize(prefix);
        const rel = (Number(start) >>> 0) - (Number(baseStart) >>> 0);
        return size > 0 && rel >= 0 && rel % size === 0;
    },

    contains(range, ipInt) {
        const n = Number(ipInt) >>> 0;
        return !!range && n >= range.start && n <= range.end;
    },

    containsRange(outer, inner) {
        return !!outer && !!inner && outer.start <= inner.start && outer.end >= inner.end;
    },

    overlaps(a, b) {
        return !!a && !!b && a.start <= b.end && b.start <= a.end;
    },

    randomInt(min, max) {
        const lo = Math.ceil(Number(min) || 0);
        const hi = Math.floor(Number(max) || 0);
        if (hi <= lo) return lo;
        return lo + Math.floor(Math.random() * (hi - lo + 1));
    },

    choose(list) {
        const arr = Array.isArray(list) ? list : [];
        if (!arr.length) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    },
};

IP2Live.CIDRTools = IP2LiveCIDRTools;
window.IP2LiveCIDRTools = IP2LiveCIDRTools;

console.log('[IP2Live] ip_cidr_tools.js loaded.');
