const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function readU16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function crc32Update(crc, byte) {
    let value = (crc ^ byte) >>> 0;
    for (let i = 0; i < 8; i++) value = (value & 1) ? ((value >>> 1) ^ 0xEDB88320) >>> 0 : value >>> 1;
    return value >>> 0;
}

function traditionalZipDecrypt(bytes, password) {
    const keys = [0x12345678, 0x23456789, 0x34567890];
    const update = (plain) => {
        keys[0] = crc32Update(keys[0], plain);
        keys[1] = (Math.imul((keys[1] + (keys[0] & 0xFF)) >>> 0, 134775813) + 1) >>> 0;
        keys[2] = crc32Update(keys[2], (keys[1] >>> 24) & 0xFF);
    };
    for (const byte of Buffer.from(password, 'ascii')) update(byte);
    const output = Buffer.alloc(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        const temp = (keys[2] | 2) >>> 0;
        const mask = (Math.imul(temp, (temp ^ 1) >>> 0) >>> 8) & 0xFF;
        output[i] = bytes[i] ^ mask;
        update(output[i]);
    }
    return output;
}

function rc4(key, data) {
    const s = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key[i % key.length]) & 255;
        [s[i], s[j]] = [s[j], s[i]];
    }
    const output = Buffer.alloc(data.length);
    let i = 0;
    j = 0;
    for (let n = 0; n < data.length; n++) {
        i = (i + 1) & 255;
        j = (j + s[i]) & 255;
        [s[i], s[j]] = [s[j], s[i]];
        output[n] = data[n] ^ s[(s[i] + s[j]) & 255];
    }
    return output;
}

function pdfPadPassword(password) {
    const padding = Buffer.from([0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A]);
    return Buffer.concat([Buffer.from(password, 'ascii'), padding]).subarray(0, 32);
}

async function main() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'report_manager.js'), 'utf8');
    const previousWindow = global.window;
    global.window = {};
    const saved = [];
    const IP2Live = {
        DesktopStorage: {
            enabled: true,
            flushPendingWrites: async () => true,
            saveReportBlob: async (blob, filename) => {
                saved.push({ blob, filename });
                return { ok: true, path: 'Reports/' + filename };
            },
        },
    };
    const report = new Function('IP2Live', source + '\nreturn IP2Live.ReportManager;')(IP2Live);

    try {
        const secret = 'TOP-SECRET-REPORT-CONTENT';
        const zipBlob = await report._buildPasswordProtectedZipBlob([
            { name: 'Student_Report.xls', blob: new Blob([secret]) },
        ], report.EXPORT_PASSWORD);
        const zip = Buffer.from(await zipBlob.arrayBuffer());
        assert.equal(readU32(zip, 0), 0x04034B50, 'secure package must be a ZIP file');
        assert.equal(readU16(zip, 6) & 1, 1, 'ZIP entries must carry the encryption flag');
        assert.equal(zip.includes(Buffer.from(secret)), false, 'protected ZIP must not contain plaintext report content');
        const nameLength = readU16(zip, 26);
        const encryptedLength = readU32(zip, 18);
        const encrypted = zip.subarray(30 + nameLength, 30 + nameLength + encryptedLength);
        const decrypted = traditionalZipDecrypt(encrypted, report.EXPORT_PASSWORD);
        assert.equal(decrypted[11], zip[17], 'ZIP password verifier must match the entry CRC');
        assert.equal(decrypted.subarray(12).toString('utf8'), secret, 'the requested password must unlock the protected ZIP entry');
        assert.notEqual(traditionalZipDecrypt(encrypted, 'wrong-password').subarray(12).toString('utf8'), secret, 'an incorrect password must not unlock the ZIP entry');

        const writer = report._createSecurePdfWriter();
        writer.newPage(595, 842);
        writer.text(40, 780, 12, secret, { font: 'F1' });
        const pdf = Buffer.from(await writer.blob().arrayBuffer());
        const pdfText = pdf.toString('latin1');
        assert.match(pdfText, /^%PDF-1\.4/);
        assert.match(pdfText, /\/Filter \/Standard \/V 1 \/R 2/);
        assert.equal(pdfText.includes(secret), false, 'PDF content streams must not expose report text before a password is supplied');
        const encryptionMatch = /\/O <([0-9A-F]+)> \/U <([0-9A-F]+)> \/P (-?\d+)/.exec(pdfText);
        const idMatch = /\/ID \[<([0-9A-F]+)>/.exec(pdfText);
        const streamMatch = /(\d+) 0 obj << \/Length (\d+) >> stream\n/.exec(pdfText);
        assert.ok(encryptionMatch && idMatch && streamMatch, 'PDF encryption metadata and an encrypted stream must be present');
        const ownerValue = Buffer.from(encryptionMatch[1], 'hex');
        const permissions = Number(encryptionMatch[3]);
        const keyMaterial = Buffer.concat([pdfPadPassword(report.EXPORT_PASSWORD), ownerValue, Buffer.from(Uint32Array.of(permissions >>> 0).buffer), Buffer.from(idMatch[1], 'hex')]);
        const documentKey = crypto.createHash('md5').update(keyMaterial).digest().subarray(0, 5);
        const objectId = Number(streamMatch[1]);
        const objectBytes = Buffer.from([objectId & 0xFF, (objectId >>> 8) & 0xFF, (objectId >>> 16) & 0xFF, 0, 0]);
        const streamKey = crypto.createHash('md5').update(Buffer.concat([documentKey, objectBytes])).digest().subarray(0, 10);
        const streamStart = streamMatch.index + streamMatch[0].length;
        const encryptedStream = pdf.subarray(streamStart, streamStart + Number(streamMatch[2]));
        assert.match(rc4(streamKey, encryptedStream).toString('ascii'), new RegExp(secret));

        const result = await report.export({ infiltratorName: 'TESTER', profileId: 'p-1', format: 'both', filenameBase: 'Student_Report' });
        assert.equal(result.ok, true);
        assert.equal(result.passwordProtected, true);
        assert.deepEqual(result.exported, ['pdf', 'excel']);
        assert.equal(saved.length, 1, 'only the protected package may be archived');
        assert.match(saved[0].filename, /_PASSWORD_PROTECTED\.zip$/);
        console.log('report_export_security.test.cjs: PASS');
    } finally {
        global.window = previousWindow;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
