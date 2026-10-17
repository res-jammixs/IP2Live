/** Subnet Simulator — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_subnet_simulator', number: '4', name: 'Subnet Simulator', icon: 'subnet',
    description: 'Merge powers of two to balance subnets and hosts.',
    create(options) {
        return new IP2Live.SubnetSimulatorGameplayScreen(Object.assign({ targetMask: '255.255.255.192' }, options));
    },
});

