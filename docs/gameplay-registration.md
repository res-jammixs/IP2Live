# Adding and updating gameplays

`GameManager` is the shared source for gameplay labels, versions, competencies,
launchers and result adapters. Telemetry, report exports, developer tests and
Story completion summaries read its current definitions automatically.

Add the gameplay module to the appropriate bundle in `Plugins/IP2Live_Core/code.js`.
At the end of that module, register it once:

```js
IP2Live.registerGameplay({
    gameplayId: 'ip_packet_routing', // Stable save/report identity; keep this on updates.
    label: 'Packet Routing',
    gameplayVersion: 'packet-routing-v1',
    competencyKey: 'packet_route_selection',
    competencyLabel: 'Packet route selection',
    launcher: { manager: 'PacketRoutingManager', method: 'launch', mapId: 18 },
    objectiveHandler: { manager: 'PacketRoutingManager', method: '_handleObjective' },
    tutorialSupported: true, // Optional; adds a developer tutorial test entry.
});
```

Registration works before or after GameManager loads. Registering the same ID
updates its definition. Existing built-in catalog entries remain supported,
and direct edits to that catalog are also read on the next request. New
launchers receive `onComplete(result)`, `onFail(result)`, `onCancel(result)`
and `onMistake(payload)` callbacks. Forward them to the gameplay screen;
terminal callbacks are guarded against duplicate completion. A manager that
already calls `GameManager.handleGameplayCompleted/Failed/Cancelled/Mistake`
itself must register `lifecycle: 'manual'` to retain ownership of those events.

Map placement stays in `GameManager.mapGameplayAssignments`: add the stable
gameplay ID as a bucket under the intended map and provide its quest/objective
specs. The objective handler retains responsibility for evaluating that quest.
No report-specific gameplay list or victory-screen switch needs editing.
Changing source files takes effect after the game loads those updated modules;
this API does not watch the filesystem or hot-replace an active scene.

## Result evidence

Use the existing shared assessment contract:

```js
options.onComplete({
    gameplayVersion: 'packet-routing-v1',
    telemetrySchemaVersion: 2,
    decisionHistory: [
        { stepKey: 'route_selection', concept: 'packet_route_selection',
          submitted: 'B', expected: 'B', correct: true },
    ],
    activeElapsedMs: 4500,
    durationMethod: 'routing_decisions_v1',
    comparisonKey: 'route-task-difficulty-1', // Include every relevant task/difficulty change.
});
```

Alternatively supply observed `totalDecisions` and `correctDecisions`. A passed
gameplay without graded answers has unknown accuracy. Active time must measure
the actual decision interval; absent timing remains unavailable. Preserve
assistance, cancellation and developer/practice flags. Do not count animation,
movement or unseen questions as correct decisions.

If a changed gameplay uses different result field names, register an optional
`normalizeResult(result, { gameplayId, passed })` function that returns these
standard fields. It receives a detached result copy; the original result stays
in the evidence JSON. For example:

```js
normalizeResult: result => ({
    telemetrySchemaVersion: 2,
    totalDecisions: result.submittedAnswers,
    correctDecisions: result.correctAnswers,
    activeElapsedMs: result.decisionTimeMs,
    durationMethod: 'routing_decisions_v2',
})
```

Use the same registration in Story and optional modes. Optional rounds retain
their own mode and do not become assessed Story attempts. A result adapter must
remain compatible with results from an already open or restored attempt.

## Revisions, history and endings

The loader fingerprints gameplay module source. Definitions include that
revision, the declared gameplay/assessment version, competency identity and
adapter code. A source edit therefore changes `definitionVersion` even if its
declared version was not bumped. Keep meaningful `gameplayVersion` values for
readable exports. Direct mutation of a module's existing exports without
reloading it requires re-registration with a changed version.

Each attempt snapshots its opening definition. Its saved label and competency
remain intact when the current catalog changes. Learning comparisons separate
definition revisions, gameplay versions, tasks and timing methods. Historical
events from removed or unknown gameplays remain in export coverage. Missing
historical metadata and answers are not reconstructed.

An earned Story completion snapshots the configured route's floor count,
assigned gameplay types, quest objective counts and gameplay definitions.
The victory screen and certificate show those saved counts; later edits do
not change an earned award. Counts describe quest completion, not measured
accuracy or mastery. Legacy awards without a snapshot keep their existing
presentation. The durable `story_completed` event exposes the same snapshot
in report JSON, the Excel **Story Completion** sheet and the PDF section.

Validate with:

```powershell
node --test tests/gameplay_registration.test.cjs tests/telemetry_learning_evidence.test.cjs tests/feature_telemetry_report.test.cjs tests/report_learning_export.test.cjs tests/story_completion.test.cjs
```
