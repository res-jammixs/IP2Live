/**
 * Floor -> gameplay -> world state. Quest IDs/counts come from GameManager's
 * mapGameplayAssignments, so adding a wire objective also adds its light step.
 * Loaded before game_state_manager.js; do not use import/export.
 */
(function () {
    IP2Live.FloorStateConfig = {
        // Applied on ANY floor containing these gameplays, including future floors.
        gameplayStates: {
            ip_class_wires: ['darklights'],
            ip_class_wires_harder: ['darklights'],
        },
        stateDefaults: {
            darklights: {
                baselineBrightnessStep: 1,
                startingDimOverlay: 0.88,
                minimumSceneLightMultiplier: 0.2,
            },
        },
        // Per-level bindings/overrides. [] disables a gameplay's default states.
        // Add other registered state names here as new immersion effects arrive.
        levels: {
            3: { name: 'Stage 1 Level 1', gameplays: {
                ip_class_wires: ['darklights'],
            } },
            4: { name: 'Stage 1 Level 2', gameplays: {
                ip_class_wires: ['darklights'],
            } },
            5: { name: 'Stage 1 Level 3', gameplays: {
                ip_class_wires: ['darklights'],
                ip_class_wires_harder: ['darklights'],
            } },
            6: { name: 'Stage 1 Level 4', gameplays: {
                ip_class_wires: ['darklights'],
                ip_class_wires_harder: ['darklights'],
            } },
        },
    };
}());
