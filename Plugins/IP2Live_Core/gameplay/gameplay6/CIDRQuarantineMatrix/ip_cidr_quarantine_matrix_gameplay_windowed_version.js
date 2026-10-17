/** Subnet Blaster — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_cidr_quarantine_matrix', number: '6', name: 'Subnet Blaster', icon: 'matrix',
    description: 'Build subnet formulas and recover addresses.',
    create(options) {
        return new IP2Live.CIDRQuarantineMatrixGameplayScreen(options);
    },
});

