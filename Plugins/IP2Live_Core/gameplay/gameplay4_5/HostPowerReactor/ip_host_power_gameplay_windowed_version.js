/** Host-Power Reactor — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_host_power_reactor', number: '4.5', name: 'Host-Power Reactor', icon: 'reactor',
    description: 'Recover host bits and calculate usable capacity.',
    create(options) {
        return new IP2Live.HostPowerReactorGameplayScreen(options);
    },
});

