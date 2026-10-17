(function () {
    class SubnetSimulatorDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor() { super('ip_subnet_simulator', 'Subnet Simulator'); }
        explain(row) {
            const rules = {
                totalSubnets: ['Total subnet count', '**2^b**, where b is the number of borrowed bits.'],
                usableSubnets: ['Usable subnet count', '**max(0, 2^b − 2)** under this activity’s legacy subnet rule. Modern subnetting generally permits subnet zero and the all-ones subnet; this activity distinguishes its legacy rule explicitly.'],
                totalHosts: ['Total addresses per subnet', '**2^h**, where h is the number of remaining host bits.'],
                usableHosts: ['Usable host count', '**2^h − 2** for the ordinary subnet sizes in this activity; reserve the network and broadcast addresses.'],
            };
            const rule = rules[row.stepKey];
            if (!rule) return super.explain(row);
            return this.result(row, rule[0] + (row.submitted == null ? ' was left empty' : ' is incorrect'),
                'This slot uses ' + rule[1] + (row.borrowedBits != null ? ' Here **b = ' + row.borrowedBits + '** and **h = ' + row.hostBits + '**.' : ''),
                'Separate borrowed bits from host bits, calculate the matching formula, and place the result in the correct slot.');
        }
    }
    IP2Live.GameplayDiagnostics.register(new SubnetSimulatorDiagnostic());
})();
