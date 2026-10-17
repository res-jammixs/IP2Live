/** IP Patch Panel — Windowed Version. Standalone adapter for the Combined toolkit. */
IP2Live.WindowedGameplay.register({
    id: 'ip_patch_panel_classes', number: '2', name: 'IP Patch Panel', icon: 'patch',
    description: 'Route packets through the matching class and mask.',
    create(options) {
        return new IP2Live.PatchPanelGameplayScreen(options);
    },
});

