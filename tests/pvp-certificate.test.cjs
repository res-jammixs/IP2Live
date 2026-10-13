const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const drawn = [], anchors = [], urls = [], revoked = [], timers = [], archives = [];
const jpeg = Buffer.from('/9j/2Q==', 'base64');
const document = {
    body: { appendChild() {} },
    createElement(tag) {
        if (tag === 'a') { const a = { click() { this.clicked = true; }, remove() { this.removed = true; } }; anchors.push(a); return a; }
        assert.equal(tag, 'canvas');
        const canvas = { width: 0, height: 0, toDataURL: (type, quality) => { assert.equal(type, 'image/jpeg'); assert.ok(quality > 0.9); return 'data:image/jpeg;base64,' + jpeg.toString('base64'); } };
        canvas.getContext = () => new Proxy({ canvas, fillText: (...args) => drawn.push(args) }, { get: (o, k) => k in o ? o[k] : () => {} });
        return canvas;
    },
};
const context = vm.createContext({ IP2Live: { DesktopStorage: { enabled: true, async saveReportBlob(blob, filename) { archives.push({ blob, filename }); } } },
    document, Blob, atob, Uint8Array, Date, console: { warn() {} }, setTimeout: fn => timers.push(fn),
    URL: { createObjectURL: blob => { urls.push(blob); return 'blob:certificate'; }, revokeObjectURL: url => revoked.push(url) } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../Plugins/IP2Live_Core/modules/certificate_pdf.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../Plugins/IP2Live_Core/modules/pvp_certificate.js'), 'utf8'), context);
const certificates = context.IP2Live.PVPCertificate;
const match = { status: 'finished', winnerId: 'a', finishReason: 'engine-powered', id: 'race-123-2', target: 1000,
    players: [{ id: 'a', name: 'Zoë 王', wins: 8, mistakes: 2, progress: 1000 }, { id: 'b', name: 'Opponent', wins: 6, mistakes: 7, progress: 812 }] };

async function main() {
    assert.throws(() => certificates.create({ ...match, status: 'racing' }, 'a'), /only to the winner/);
    assert.throws(() => certificates.create(match, 'b'), /only to the winner/);
    const certificate = certificates.create(match, 'a', { ai: true, completedAt: Date.UTC(2026, 9, 12) });
    assert.equal(certificate.blob.type, 'application/pdf'); assert.match(certificate.filename, /^IP2Live_PVP_Victory_.*\.pdf$/);
    const pdf = Buffer.from(await certificate.blob.arrayBuffer()), source = pdf.toString('latin1');
    assert.match(source, /^%PDF-1\.4\n/); assert.match(source, /\/MediaBox \[0 0 842 595\]/, 'A4 landscape');
    assert.match(source, /\/Width 2526 \/Height 1785/, 'the certificate is rendered at print resolution');
    assert.ok(drawn.some(args => args[0] === 'Zoë 王'), 'Unicode names reach the canvas intact');
    assert.ok(drawn.some(args => args[0] === 'PVP / VS AI'), 'AI victories are clearly labeled');
    assert.ok(drawn.some(args => args[0] === '1000 / 1000'));
    const xrefAt = Number(/startxref\n(\d+)/.exec(source)[1]); assert.equal(source.slice(xrefAt, xrefAt + 4), 'xref');
    const entries = source.slice(xrefAt).split('\n').slice(3, 9);
    entries.forEach((entry, i) => assert.ok(source.startsWith((i + 1) + ' 0 obj', Number(entry.slice(0, 10))), 'PDF object offsets are byte accurate'));
    const imageAt = source.indexOf('stream\n') + 7; assert.deepEqual(pdf.subarray(imageAt, imageAt + jpeg.length), jpeg, 'binary image bytes survive PDF serialization');
    const unicodeSubject = 'FEFF' + Array.from('Zoë 王 | race-123-2').map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    assert.ok(source.includes(unicodeSubject), 'the PDF metadata retains the full player name');
    const result = await certificates.download(certificate);
    assert.equal(result.ok, true); assert.equal(anchors[0].download, certificate.filename); assert.equal(anchors[0].clicked, true); assert.equal(anchors[0].removed, true);
    assert.equal(archives[0].blob, certificate.blob); assert.deepEqual(revoked, [], 'the URL remains valid while the download starts');
    timers.shift()(); assert.deepEqual(revoked, ['blob:certificate']);
    context.IP2Live.DesktopStorage.saveReportBlob = async () => { throw new Error('archive unavailable'); };
    assert.equal((await certificates.download(certificate)).ok, true, 'a failed optional archive does not prevent downloading');
    drawn.length = 0;
    certificates.create({ ...match, finishReason: 'opponent-left' }, 'a', { ai: false });
    assert.ok(drawn.some(args => args[0] === 'PLAYER VS PLAYER')); assert.ok(drawn.some(args => args[0] === 'Victory by opponent forfeit'));
    const unsafe = certificates.create({ ...match, players: [{ ...match.players[0], name: '../bad<>name' }, match.players[1]] }, 'a');
    assert.ok(!/[<>:/\\]/.test(unsafe.filename));
    console.log('pvp-certificate.test.cjs: PASS (winner eligibility, landscape PDF, binary offsets, Unicode, AI/forfeit details, download and archive)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
