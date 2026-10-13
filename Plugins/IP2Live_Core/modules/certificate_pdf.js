/** Offline A4 landscape PDF export shared by story and PVP certificates. */
(function () {
    function create(canvas, metadata) {
        const image = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.94).split(',')[1]), c => c.charCodeAt(0));
        const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));
        const unicode = s => 'FEFF' + Array.from({ length: String(s).length }, (_, i) => String(s).charCodeAt(i).toString(16).padStart(4, '0')).join('');
        const parts = [], offsets = [0]; let length = 0;
        const append = value => { const bytes = typeof value === 'string' ? ascii(value) : value; parts.push(bytes); length += bytes.length; };
        const object = (id, content) => { offsets[id] = length; append(id + ' 0 obj\n' + content + '\nendobj\n'); };
        append('%PDF-1.4\n');
        object(1, '<< /Type /Catalog /Pages 2 0 R >>');
        object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
        object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Certificate 4 0 R >> >> /Contents 5 0 R >>');
        offsets[4] = length;
        append('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + image.length + ' >>\nstream\n');
        append(image); append('\nendstream\nendobj\n');
        const content = 'q\n842 0 0 595 0 0 cm\n/Certificate Do\nQ\n';
        object(5, '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
        object(6, '<< /Title <' + unicode(metadata.title) + '> /Author (IP2Live) /Subject <' + unicode(metadata.subject) + '> >>');
        const start = length;
        append('xref\n0 7\n0000000000 65535 f \n');
        for (let i = 1; i < 7; i++) append(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
        append('trailer << /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + start + '\n%%EOF');
        return new Blob(parts, { type: 'application/pdf' });
    }
    async function download(certificate) {
        const url = URL.createObjectURL(certificate.blob), anchor = document.createElement('a');
        try {
            anchor.href = url; anchor.download = certificate.filename; document.body.appendChild(anchor); anchor.click();
        } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
        const storage = IP2Live.DesktopStorage;
        if (storage && storage.enabled && typeof storage.saveReportBlob === 'function') {
            try { await storage.saveReportBlob(certificate.blob, certificate.filename); }
            catch (error) { console.warn('[IP2Live] Certificate archive failed:', error); }
        }
        return { ok: true, filename: certificate.filename };
    }
    IP2Live.CertificatePDF = { create, download };
})();
