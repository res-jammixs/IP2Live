/** Network Re-Segmentation — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_cidr_quarantine', number: '5', name: 'Network Re-Segmentation', icon: 'quarantine',
    description: 'Subnet the allocation and secure a safe route.',
    create(options) {
        return new IP2Live.CIDRQuarantineGameplayScreen(options);
    },
});

