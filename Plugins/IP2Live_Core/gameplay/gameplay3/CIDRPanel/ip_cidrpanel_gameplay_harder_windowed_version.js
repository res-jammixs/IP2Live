/** Adaptive CIDR Panel — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_cidr_binary_panel_harder', number: '3+', name: 'Adaptive CIDR Panel', icon: 'binary',
    description: 'Rebuild the mask against changing targets.',
    create(options) {
        return new IP2Live.CIDRPanelHarderGameplayScreen(options);
    },
});

