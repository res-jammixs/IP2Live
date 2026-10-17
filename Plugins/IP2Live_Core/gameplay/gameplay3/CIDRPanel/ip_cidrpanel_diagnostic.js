(function () {
    class CIDRPanelDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor(id = 'ip_cidr_binary_panel', label = 'CIDR Panel') { super(id, label); }
        explain(row) {
            if (row.stepKey === 'cidr_prefix') return this.result(row, 'CIDR prefix does not match the mask',
                'The prefix is the **total number of network 1-bits** across all four octets of **' + (row.targetMask || 'the target mask') + '**. This attempt expected **/' + row.expected + '**.',
                'Count the 1-bits in each octet, add them, and write / followed by that total.');
            return this.result(row, 'Binary mask does not match the target',
                'Each octet uses bit weights **128, 64, 32, 16, 8, 4, 2, 1**. The selected bulbs must reproduce **' + (row.targetMask || 'the target decimal mask') + '** exactly.',
                'Convert one octet at a time. Check every bulb, then count the network bits for CIDR.');
        }
    }
    class HarderCIDRPanelDiagnostic extends CIDRPanelDiagnostic {
        constructor() { super('ip_cidr_binary_panel_harder', 'CIDR Panel · Harder'); }
        explain(row) { const result = super.explain(row); result.hint += ' Harder mode changes the target after an error; these values describe the target from this attempt.'; return result; }
    }
    IP2Live.GameplayDiagnostics.register(new CIDRPanelDiagnostic());
    IP2Live.GameplayDiagnostics.register(new HarderCIDRPanelDiagnostic());
})();
