(function () {
    class CIDRQuarantineDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor() { super('ip_cidr_quarantine', 'Network Re-Segmentation'); }
        explain(row) {
            if (row.stepKey === 'classify') return this.classification(row, 'IP class identified incorrectly');
            const rules = {
                default_prefix: ['Wrong default prefix', 'Legacy classful defaults are **A /8, B /16 and C /24**. An explicitly assigned CIDR prefix can differ.'],
                borrow_bits: ['Borrowed-bit count does not meet the task', 'Use the **smallest b** such that **2^b ≥ required subnets**. This task asks for **' + row.requiredSubnets + ' subnets**.'],
                new_cidr: ['New CIDR prefix is incorrect', '**New prefix = starting prefix + borrowed bits**. Borrowing extends the network portion.'],
                host_bits: ['Remaining host-bit count is incorrect', '**Host bits = 32 − new CIDR prefix**. Host bits are binary positions, not a count of devices.'],
                host_capacity: ['Usable host capacity is incorrect', 'Use **2^h − 2** for ordinary subnets. The network and broadcast addresses are reserved.'],
                route_host_bits: ['Route did not satisfy the repair task', row.issueType === 'virus' ? 'The route crossed a **virus**. Route safety is separate from the host-bit calculation.' : row.issueType === 'disconnected' ? 'The route did not **connect A to B**. Connectivity is separate from the host-bit calculation.' : 'The connected route must match the required **host-bit total** while avoiding viruses. Route weights are a game rule.'],
            };
            const rule = rules[row.stepKey];
            return rule ? this.result(row, rule[0], rule[1], 'Review this prerequisite before building the route. Compare the recorded submitted and expected values below.') : super.explain(row);
        }
    }
    IP2Live.GameplayDiagnostics.register(new CIDRQuarantineDiagnostic());
})();
