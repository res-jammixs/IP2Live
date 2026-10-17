/** CIDR Binary Panel — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_cidr_binary_panel', number: '3', name: 'CIDR Binary Panel', icon: 'binary',
    description: 'Build the binary mask and recover its CIDR prefix.',
    create(options) {
        return new IP2Live.CIDRPanelGameplayScreen(options);
    },
});

