# Gameplay 5: Network Re-Segmentation

Divide an allocated IPv4 network into the required number of equal-sized subnets, calculate their host capacity, and connect a route through the virus board. Prompts use networking terms directly: IP class, default classful prefix, borrowed bits, subnets, host bits, and usable hosts.

## Player progression

| Step | Interaction | Unlock |
| --- | --- | --- |
| 1. Identify | A digital lock appears on black with a randomized Class A, B, or C network address. Type the class letter or full answer (for example, `B` or `CLASS B`). | A one-second glitch-and-dissolve fade opens the default-prefix step. |
| 2. Default prefix | Enter the **default classful prefix**, by keyboard or keypad. | Reveal required subnets and unlock the calculator. |
| 3. Subnet | Switch on the minimum host bulbs needed for `2^s >= required subnets`. | Freeze the borrowed bits. |
| 4. Prefix | Enter starting prefix plus borrowed bits. | Reveal the resulting prefix. |
| 5. Host bits | Enter `32 - new prefix`. | Verify the remaining host bits. |
| 6. Capacity | Use the Gameplay 4.5 calculator if needed; enter `2^h - 2`. | Unlock the quarantine board. |
| 7. Route | Connect A to B without touching virus tiles; match the verified host-bit total. | Run the existing route trace and complete the quest. |

Borrowing happens once. Network bulbs are locked, borrowed bulbs are gold, remaining host bulbs are dark. Borrowing is contiguous; the last two bits remain hosts. The new prefix and capacity are withheld until the player answers. Classes are an explicit legacy exercise: a modern address alone does not imply its assigned prefix.

Example: `172.16.0.0` → Class B → `/16` → six required subnets → three borrowed bits → `/19` → 13 host bits → 8,190 usable hosts per subnet. Eight equal-sized subnets meet the requirement, leaving two spare.

## Visual design and tools

The existing canvas renderer and Nebula/Oxanium fonts remain in use, with Astronomous on the prerequisite step titles. Gameplay 5 uses translucent cyan/violet panels with side fades, faint circuit traces, surface grain, floating shadows, sparse detached pixels near large panel edges, and light catching on the edges. The class prompt shares that treatment. The bit controls reuse Gameplay 4's shaded lamp geometry and glow: fixed network bits are cyan, borrowed bits are amber, and host bits are dark. The calculator inherits the holographic panel when opened from Gameplay 5.

The title uses Gameplay 1's angled dark plate, red IP2 badge, Abnes two-tone title, top color bars, and signal pips, widened to fit "Network Re-Segmentation." The first class prompt is a compact 440 by 208 landscape panel over the dimmed board. Its smoked-glass housing uses fine brushed grain, subtle edge reflections, and short engraved traces. A beveled calculator-style well holds a small phosphor-tinted IP display with a faint pixel matrix and inset shadow. The 34px-high rectangular answer field uses smaller left-aligned text, padding, and a caret. The existing instruction and three small flat circular attempt LEDs share the footer; remaining lights are muted cyan, amber at two attempts, and red at one. Spent lights darken and show a slash. No display text is added. Both a class letter and a full class answer are validated against the displayed address. Correct answers retain the address, subnet calculations, and virus formation. Each wrong non-empty answer spends one attempt and refreshes the address and downstream calculations; the third mistake ends the run, including in the tutorial. The old virus formation dissolves through a fixed pixel mask for 400ms, then the new formation assembles for 400ms. Answer entry waits until the transition ends, while the quest timer continues. Reduced motion replaces the formation immediately. A correct answer captures the accepted popup, tears it into displaced horizontal bands, and dissolves it with cyan/violet fragments over one second while revealing the board. Input and quest time remain suspended during this transition; reduced motion skips it. In the routing panel, Class, Borrowed, and Usable Hosts share one aligned value column.

The prerequisite panel groups the allocated IP address and a separate class badge in one header. Six labeled glyphs replace the progress bars; completed steps glow cyan and the current step glows amber. Each prompt has a numbered title strip and centered instructions. Numeric steps put the answer field and keypad inside one inset deck so they read as a single input. The borrowing step centers its bulb grid, and a compact square calculator icon sits at the upper-right edge beside the panel header after the default prefix is verified. Text, controls, and panel edges retain clear vertical gaps. Oxanium remains the readable control font, while Astronomous gives the step title a distinct display style. Letter tracking is applied to those headings and short labels. The number keys and Verify/Delete controls have angled glass surfaces, edge rails, and a hover state.

Each accepted answer starts a 380ms fade into the next question. A floating padlock replaces the board's text checklist: six light arcs fill one at a time over 650ms, with a small completed-answer count underneath. The icon has a faint diamond projection, a slow orbit, and subtle scan. After the sixth answer, the shackle swings open on its left hinge and the icon fades away over 1.3 seconds. Wrong answers never advance it, and retries reset it. These transitions do not delay input or stop the quest clock. The system reduced-motion preference, or `options.reducedMotion`, skips them.

Once routing opens, the panel leads with the current path total `h` against its target and a separate move count. Verified network values appear in three compact rows below. Direction values each have a small dedicated chip, followed by infection pressure and current status; fine dividers separate these sections. The virus board and right-side panel extend to the same lower edge, using the former empty space without crowding their content.

The borrowing screen shows the required subnet count, 32 bit controls, a three-color key, and Verify. It does not display the borrowed-bit calculation or resulting subnet count; players can open the calculator to work them out. Duplicate network summaries, checklist text, row numbers, and persistent instruction/reminder lines have been removed. Error explanations appear only after an incorrect submission.

The existing Gameplay 4.5 calculator opens with **H**, or its square icon in the prerequisite panel, immediately after the default prefix is verified. During borrowing and new-prefix entry it computes **subnets = 2^s**, with no subtraction or answer disclosure. During host calculation and routing it computes **usable hosts = 2^h - 2** and shows the verified prefix. It starts at exponent zero and does not automatically submit answers or change the bulbs. Opening it keeps the quest timer visible and active, and infection continues. The Gameplay 4 analyzer button and popup are removed from Gameplay 5 because they do not contribute to progression.

Routing retains the existing direction weights. Their sum is a game checksum of the verified host exponent; it does not represent borrowing additional bits or a real networking routing protocol.

## Clock, infection, and retries

- One 180-second budget covers the entire quest. The warning becomes critical at 15 seconds.
- Infection starts during classification and grows throughout prerequisite entry and tool use.
- The generated solution corridor stays protected until the deadline. High density alone cannot cause an early failure.
- At zero, input locks and the overrun ends the gameplay through its terminal failure callback. A rejected final route also ends the run. Gameplay 5 opens no AR diagnostic or repeated-failure tutorial offer and does not automatically restart; campaign runs return to the floor, and developer tests return to the testing panel. Normal campaign reporting and Neural Life Force accounting remain active.
- Instruction dialogue and the actual pause menu suspend quest time. Accepted route tracing freezes the deadline so animation cannot invalidate a timely submission.

Configure a quest through `spec.timeLimitSeconds` or pass `timeLimitSeconds` to `launchCIDRQuarantineGameplay`. A direct launch option overrides the spec. Use `300`, `180`, `120`, or `60` for timed variants; numeric `0` means no limit. Changing time limits is configuration, not a setting the player changes mid-quest.

## Implementation and validation

The existing `CIDRQuarantineGameplayScreen` remains the controller. New prerequisite phases lead into its existing `build`, `tracing`, and completion lifecycle. Existing route generation, virus rendering, CIDR utilities, host-power tool, and completion/report callbacks remain in use. Older host-first problem data is converted to an equivalent subnet requirement.

Developer-mode Gameplay 5 replaces its temporary loading scene when the puzzle opens, leaving the pause menu beneath it. The synthetic developer test quest ID is omitted from the gameplay manager's QuestManager handoff. Completing or cancelling a test therefore returns to the menu without an unknown-quest warning; campaign launches keep their existing quest ID and scene behavior.

The local preview at `tests/fixtures/gameplay5_segmentation_preview.html` loads the actual gameplay files and Astronomous font. Open it in a browser to play the six-subnet example and select a time budget before restarting. It uses a small scene-stack harness, not the campaign save system. Static captures use the `capture` query parameter, including `default_prefix`; capture randomness is seeded so comparison images stay stable. Normal play includes the animations.

Automated tests cover the full example, wrong-answer gates, minimum borrowing, pointer and keyboard entry, popup interaction targets at three resolutions, generated-route solvability, protected infection growth, timeout penalties, retries, no-limit mode, early calculator access, subnet-versus-host formulas, reduced motion, reveal timing, pause/completion integration, and developer-mode complete/cancel scene exits.

The actual canvas renderer was rendered and visually inspected in headless Edge on 2026-09-30. Captures are under `docs/screenshots/gameplay5/`. Reproduce them with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/render-gameplay5.ps1`. The policy override applies to that process only. Campaign integration still uses the existing scene manager and quest callbacks.

Validation on 2026-09-30: all nine targeted Gameplay 5, calculator, developer exit, pause, completion, practice, replay, and tutorial checks pass. The broader current-project suite checked on 2026-09-28 has three pre-existing failures, reproduced using the unchanged Git baseline: `host_power_reactor.test.cjs` (tap cooldown), `menu_transition.test.cjs` (menu position), and `stage3_gameplay45_progression.test.cjs` (tutorial wording). Run current tests with `node --test "tests/*.test.cjs" "tests/*.test.mjs"`; unscoped discovery also runs archived tests under `Backups`.

Developer tests do not capture or restore gameplay sessions, and pausing or quitting a test does not save campaign checkpoints. Exiting clears any session left by older testing builds. Story-mode pauses and exits retain their saved puzzle state.

UI refinement on 2026-10-07: the final routing panel matches the virus panel's height, with Undo, Clear, and Check in a bottom action row. Required Subnets has additional space above it, with matching adjusted bulb hit targets. The calculator button uses a recessed screen icon without a hover tooltip. Gameplay 5's calculator uses chamfered sections, phosphor displays, and muted circular drag controls; calculation rules and interactions remain unchanged. Borrowing, calculator, and routing captures were inspected in Edge. Segmentation, calculator, tutorial-flow, and class-lock checks pass.

Puzzle variety uses a shuffled A/B/C bag, choosing a class once per generated puzzle. Borrowing ranges extend to 18 bits for A and 10 for B; C remains limited by its eight host bits. Route retries preserve the chosen class and borrowing target. Host capacity still reserves two addresses (`2^h - 2`); required subnet counts use `2^s` with no host-address subtraction. Timeout shows a quarantine-breach popup, then pixelated viruses fill the screen over 3.2 seconds, followed by loading screen 2 and the existing floor/testing-panel exit. Timeout, balanced classes, valid routes, host-capacity boundaries, and loading-screen exits are covered by the targeted checks. Visual stages are available as `overrun_popup`, `overrun_pixels`, and `overrun_full` captures.

The tutorial now defines bits, borrowed bits (`s`), remaining host bits (`h`), subnets, and usable host addresses before asking the learner to calculate them. The borrowing lesson distinguishes 31 required subnets (five borrowed bits) from 31 hosts per subnet (at least six remaining host bits). It explains that two addresses are reserved inside each subnet, rather than reserving bits or subtracting from subnet count. The capacity lesson teaches adding two to host demand before choosing a power of two. Classification and timeout guidance match the shuffled classes and takeover exit, and routing instructions name the bottom Check button. Tutorial flow, default scenarios, and syntax validation pass.

The outer backdrop now uses near-black space with subtle drifting dust particles instead of diagonal lines. Particle positions are deterministic and do not consume puzzle randomness. Reduced-motion mode keeps them still. Classification and prefix screens were rendered and inspected with the revised backdrop.
