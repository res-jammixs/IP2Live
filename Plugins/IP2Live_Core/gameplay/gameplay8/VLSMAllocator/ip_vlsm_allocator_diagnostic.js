(function () {
    class VLSMAllocatorDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor() { super('ip_vlsm_allocator', 'VLSM Allocator'); }
        explain(row) {
            const issue = row.issueType || '', parent = row.expected && row.expected.parentCIDR;
            const rules = {
                capacity_too_small: ['Subnet is too small', 'The selected subnet must hold **' + row.requiredHosts + ' usable hosts**. For ordinary subnet sizes, capacity is **2^(32 − prefix) − 2**.'],
                cidr_not_optimal: ['Subnet uses more space than required', 'This activity requires the **smallest fitting block**. A larger block can hold the hosts but wastes address space and fails this task’s efficiency rule.'],
                insufficient_capacity: ['Subnet is too small', 'The selected subnet must hold **' + row.requiredHosts + ' usable hosts**. For ordinary subnet sizes, capacity is **2^(32 − prefix) − 2**.'],
                insufficient_hosts: ['Subnet is too small', 'The selected subnet does not meet the branch’s required usable-host count.'],
                overlap: ['Subnet overlaps another branch', 'Two branch allocations share addresses. Each branch needs a **distinct, non-overlapping range**.'],
                misaligned_network: ['Network address is not aligned', 'A network start must fall on the selected prefix’s **block boundary**. An address inside a block is not necessarily its network address.'],
                out_of_parent_range: ['Subnet is outside its parent', 'The **entire child range**, from network through broadcast, must remain inside **' + (parent || 'the assigned parent CIDR') + '**.'],
                missing_branch_allocation: ['A branch has no allocation', 'The final gateway requires **every branch** to have a valid allocation before the route table is committed.'],
                route_table_rejected: ['Final route table needs repair', 'The final table did not pass the recorded allocation checks. Review missing branches, capacity, alignment, containment and overlap.'],
            };
            const rule = rules[issue] || [/capacity|host/.test(issue) ? 'Branch capacity is incorrect' : 'VLSM allocation rejected', row.detail || 'This allocation failed the **' + (row.stepKey || 'VLSM') + '** check.'];
            const result = this.result(row, rule[0], rule[1] + (row.detail ? ' Recorded check: ' + row.detail : ''),
                row.hint || 'Allocate larger branches first. Choose a sufficient prefix, align the start, and check both parent containment and overlap before committing.');
            if (row.expected && typeof row.expected === 'object' && row.expected.optimalPrefix != null) {
                result.expected = 'Smallest fitting prefix: /' + row.expected.optimalPrefix +
                    (parent ? '\nParent block: ' + parent : '') + '\nAligned network · No overlap';
            }
            return result;
        }
    }
    IP2Live.GameplayDiagnostics.register(new VLSMAllocatorDiagnostic());
})();
