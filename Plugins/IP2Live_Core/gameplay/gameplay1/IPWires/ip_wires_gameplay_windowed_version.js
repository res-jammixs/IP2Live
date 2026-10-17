/** IP Class Wires — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_class_wires', number: '1', name: 'IP Class Wires', icon: 'wires',
    description: 'Connect IP addresses to their network classes.',
    create(options) {
        return new IP2Live.WiresGameplayScreen(options);
    },
});

