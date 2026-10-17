(function () {
    class NetworkRepairDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor() { super('ip_network_repair', 'Network Repair'); }
        explain(row) {
            return this.result(row, row.stepKey === 'formula_variables' ? 'Wrong formula variables collected' : 'Formula token is in the wrong position',
                row.stepKey === 'formula_variables' ? 'The selected token set does not match the variables and operators needed by **' + (row.taskType || 'this repair task') + '**. Missing or extra tokens change the formula.' :
                    '**Slot ' + (Number(row.slot || 0) + 1) + '** expected **' + this.value(row.expected) + '**. A formula needs the correct operators, operands and ordering.',
                'Read the target formula, collect its required tokens, and arrange them in the recorded expected order.');
        }
    }
    IP2Live.GameplayDiagnostics.register(new NetworkRepairDiagnostic());
})();
