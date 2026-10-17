/** Adaptive IP Wires — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_class_wires_harder', number: '1+', name: 'Adaptive IP Wires', icon: 'wires',
    description: 'Reconnect classes as the network shifts.',
    create(options) {
        const manager = IP2Live.HarderWiresGameplayManager;
        manager._installHarderScreenOverrides();
        const Screen = manager._ensureHarderScreenClass();
        return new Screen(options);
    },
});

