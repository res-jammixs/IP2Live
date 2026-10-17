/** Network Repair — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_network_repair', number: '7', name: 'Network Repair', icon: 'repair',
    description: 'Catch formula variables and repair IP addresses.',
    create(options) {
        return new IP2Live.NetworkRepairGameplayScreen(options);
    },
});

