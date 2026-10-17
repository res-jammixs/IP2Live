/** VLSM Infiltration Grid — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_vlsm_allocator', number: '8', name: 'VLSM Infiltration Grid', icon: 'vlsm',
    description: 'Allocate a branch subnet without overlap.',
    create(options) {
        const manager = IP2Live.VLSMAllocatorGameplayManager;
        const saved = manager._state;
        const state = options.state || { allocations: {}, visitOrder: [], mistakeCount: 0, startedAt: Date.now() };
        manager._state = state;
        try {
            return new IP2Live.VLSMAllocatorGameplayScreen(Object.assign({}, options, {
                spec: Object.assign({ terminalType: 'branch', branchId: 'hq' }, options.spec),
                scenario: options.scenario || manager.scenario(), state,
            }));
        } finally { manager._state = saved; }
    },
});

