(function () {
    class HostPowerDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor() { super('ip_host_power_reactor', 'Host-Power Reactor'); }
        explain(row) {
            const h = Number(row.submitted), valid = Number.isInteger(h) && h >= 0 && h <= 32;
            const capacity = valid ? Math.max(0, Math.pow(2, h) - 2) : null;
            return this.result(row, row.issueType === 'host_allocation_not_minimal' ? 'More host bits than needed' : 'Not enough usable host capacity',
                'The reactor needs the **smallest h** satisfying **2^h − 2 ≥ ' + row.requiredHosts + '**.' +
                (capacity !== null ? ' Your **h = ' + h + '** provides **' + capacity + ' usable hosts**.' : ''),
                'Compare the required host count with usable capacity. Increase h until it fits, then check that h − 1 would be insufficient.');
        }
    }
    IP2Live.GameplayDiagnostics.register(new HostPowerDiagnostic());
})();
