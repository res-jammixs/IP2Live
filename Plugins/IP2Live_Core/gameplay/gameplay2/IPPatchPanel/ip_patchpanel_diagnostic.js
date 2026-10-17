(function () {
    class PatchPanelDiagnostic extends IP2Live.GameplayDiagnostic {
        constructor() { super('ip_patch_panel_classes', 'IP Patch Panel'); }
        explain(row) { return this.classification(row, /mask/i.test(row.concept || row.stepKey || '') ? 'Mask packet routed to the wrong class' : 'IP packet routed to the wrong class'); }
    }
    IP2Live.GameplayDiagnostics.register(new PatchPanelDiagnostic());
})();
