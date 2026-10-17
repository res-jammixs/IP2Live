(function () {
    class IPWiresDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor(id = 'ip_class_wires', label = 'IP Wires') { super(id, label); }
        explain(row) { return this.classification(row, row.submitted == null ? 'A wire was left unmatched' : 'Wire connected to the wrong class'); }
    }
    class HarderIPWiresDiagnostic extends IPWiresDiagnostic {
        constructor() { super('ip_class_wires_harder', 'IP Wires · Harder'); }
    }
    IP2Live.IPWiresDiagnostic = IPWiresDiagnostic;
    IP2Live.GameplayDiagnostics.register(new IPWiresDiagnostic());
    IP2Live.GameplayDiagnostics.register(new HarderIPWiresDiagnostic());
})();
