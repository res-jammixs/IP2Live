(function () {
    class SubnetBlasterDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor() { super('ip_cidr_quarantine_matrix', 'Subnet Blaster'); }
        explain(row) {
            if (row.stepKey === 'address_operator') return this.result(row, 'Address direction selected incorrectly',
                'This encounter requested the **' + (row.asked || 'recorded address boundary') + '** from **' + (row.givenAddress || 'the given address') + '**. ' +
                    (row.asked === 'broadcast' ? '**Broadcast = network + block size − 1**.' : row.asked === 'network' ? '**Network = broadcast − block size + 1**.' : 'The required operator was **' + row.expected + '**.'),
                'Identify the given boundary and requested boundary before choosing the operator. Keep the final ±1 adjustment: both boundary addresses belong to the same block.');
            const reason = row.issueType === 'usable_hosts_instead_of_total_addresses' ? 'You used **usable hosts**, but a block step includes **all addresses**, including network and broadcast.' : row.issueType === 'linear_instead_of_exponential' ? 'Multiplying host bits by two is linear. Address combinations grow as a **power of two**.' : 'The total block contains **2^h addresses**, where h is the remaining host-bit count.';
            return this.result(row, 'Subnet block size selected incorrectly', reason + ' With **h = ' + row.hostBits + '**, the expected block size is **' + row.expected + '**.',
                'Use 2 raised to the host-bit count. Subtract two only when asked for ordinary usable host capacity, not total block size.');
        }
    }
    IP2Live.GameplayDiagnostics.register(new SubnetBlasterDiagnostic());
})();
