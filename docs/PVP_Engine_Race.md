# PVP / Engine Race

Open **Play Game → PVP**. Choose **Create Lobby**, **Join Lobby**, or **VS AI**.

PVP headers use the bundled **Nebula Regular** font. Names, buttons, scores, editable fields and supporting text use **Oxanium Medium**, with 1.6x leading for multiline text and increased spacing between labels and descriptions. Carbon weave, illuminated cyan/red armour rails, and etched corner details match the game's palette. Static arena materials are cached at the display density, up to 2x. The name field has a recessed display, beveled metal surround, profile icon, and focus lighting; its editable text stays aligned inside the frame as the window resizes. The menu and name text fade in together. Hovering a choice lifts its panel, lights the border, and speeds up its fan. Keyboard selection receives the same effect. A thin, centered **Go Through Tutorials** button opens the standalone lessons below the race choices. An arrow returns to the previous menu. See the [updated menu](screenshots/pvp/menu-1920x1080.png).

## Tutorial walkthrough

**Go Through Tutorials** works offline and is available before any Story Mode tutorial is completed. It opens the existing interactive teaching versions with guidance and highlights inside the gameplay. Story dialogue and separate pre-game briefings are omitted. The sequence covers Gameplays **1, 2, 3, 4, 4.5, 5, 6, 7, and 8**, followed by the harder Gameplay **1 and 3** variants: **11 lessons** in total. Gameplay 3 precedes Gameplay 4.

Completing a lesson automatically transitions to the next gameplay. There is no lesson-choice screen or Task Complete popup. The final lesson transitions back to PVP. Failed lessons retry the same tutorial; an unavailable lesson returns to PVP with a short notice. Transitions cover loading and freeze gameplay timers and teaching input until the new screen is visible.

During a lesson, click **Pause** or press **Esc**, including during teaching dialogue. The pause menu offers **Replay Tutorial**, **Previous Tutorial** when there is an earlier lesson, **Next Tutorial** (or **Finish Walkthrough** on the last lesson), and **Back to PVP**. Previous, Replay, Next and exit use the same transition. Resume keeps the current teaching step; lesson highlights and dialogue input wait while Pause or its Settings popup is open.

Lessons use the isolated practice session with unlimited attempts. Completion does not grant Story Mode practice unlocks, change campaign quests or saves, or count as an assessed teacher-report attempt. Changing lessons disposes the previous puzzle, pause/calculator overlays, and its dialogue before opening the next one; leaving restores the prior game context.

## Playing over a local network

1. Run the updated IP2Live desktop build on both devices and connect them to the same Wi-Fi or wired LAN.
2. One player chooses **Create Lobby**. The lobby labels the host's local IPv4 addresses by adapter, showing Wi-Fi first when available. Share the address for the network both devices use, rather than an unrelated VPN or virtual adapter.
3. The second player chooses **Join Lobby**, then selects the discovered lobby. If discovery does not find it, enter the displayed host address in **Direct Connection**.
4. Both pilots select **Ready**. The host selects **Start Race**. A three-second versus intro fades in with sliding hooded portraits, Player 1 and Player 2, and animated center lightning. It fades to a dark frame before both races start at the synchronized time. The first visible gameplay then fades in over 420 milliseconds, including after a delayed LAN poll or gameplay load. The visual transition does not postpone the match start. See the [versus intro](screenshots/pvp/versus-intro.png) and [transition frames](screenshots/pvp/versus-transition.png).

Lobbies accept exactly two players. A lobby cannot start until both players are ready. Pilot names can be edited before joining. There is no internet service, account requirement, or external relay.

Automatic discovery uses UDP port **43871**. The host normally listens on TCP port **43872**, using another available port if that port is occupied; use the port actually displayed in the lobby. Allow the packaged app on the local/private network if the operating system asks. Guest Wi-Fi, client isolation, or a firewall can prevent devices from reaching one another even when the Wi-Fi name matches. Direct-address joining helps when UDP broadcasts are blocked, but still requires TCP connectivity.

Discovery binds a separate socket to each local IPv4 adapter and repeats its probes within a 1.2-second search. Wi-Fi replies take priority over VPN, virtual-adapter, and loopback replies from the same lobby. An unavailable adapter does not cancel the other searches. If the host cannot listen for discovery, its lobby explains that players should join by address.

### When the lobby does not appear or cannot be joined

1. Keep **Create Lobby** open on the host. Select **Refresh** on the second device; if the list remains empty, enter the host's Wi-Fi/Ethernet address and the displayed port in **Direct Connection**.
2. If direct joining works, the problem is with broadcast discovery on that network. Direct joining uses the same race transport and is sufficient to play.
3. If direct joining also fails, check **Windows Security → Firewall & network protection → Allow an app through firewall** on the host. The exact exported game executable needs access on the **Private** network. A firewall that blocks inbound connections can allow same-computer tests while preventing another device from connecting. Keep the firewall enabled.
4. Check that both devices use the same normal LAN, rather than a guest network with device isolation, and that the displayed address belongs to that LAN. If the TCP port changed because another application uses 43872, use the new port displayed by the host.
5. Re-prepare and distribute the updated desktop export to **both** devices. Updating the project plugin alone does not replace the packaged LAN transport.

Network requests now fail within a bounded time, including interrupted or partially delivered responses. Joining retries a temporary transport failure with the same private reservation ID, so a lost response does not consume the guest slot and lock the same player out. Connection errors identify an unreachable, refused, or blocked connection where the operating system supplies that information.

LAN hosting and discovery require the updated Electron host and preload, not just an updated game plugin. Prepare an RPG Paper Maker export using `tools/prepare-windows-release.ps1`; this now copies `pvp-service.js` and a CommonJS copy of the shared race rules alongside the existing desktop runtime. Browser-only runs and older desktop hosts display a clear LAN availability message; **VS AI** remains available.

## Race rules

- The actual Gameplays **1, 2, 3, 4, 4.5, 5, and 6** appear in a shuffled bag. Both players receive **identical problems in the same order** and advance independently: a faster player can move ahead without skipping the other player's question. Matching rounds use the same addresses, packet order, masks, host requirements, route layout, and barrier choices.
- The host supplies a versioned problem seed derived from the match and round index. Player identity, retry count, local clock, and visual effects cannot change the question. Retries keep the same problem and quest configuration. Gameplay 5 retains its question after an incorrect class answer; Gameplay 6 retains its current subquestion after a boss counterattack and gives both players the same three-question set. Story and free-practice randomization remain unchanged.
- **Gameplay 3 always immediately precedes Gameplay 4.** Gameplay 4 uses the exact mask and CIDR state built in Gameplay 3. Failing Gameplay 4 retries it with that same handoff.
- The gameplay occupies the left four-fifths of the screen. The compact right fifth shows the engine, both animated liquid tanks, charge totals, and three-step attack meters, with thinner frames and reduced padding. Fill your tank to **1,000 charge** to win. The tubes have no percentage labels; charge totals remain below them.
- Gameplay constructors, drawing, and pointer input use the same logical viewport. Gameplay 4 seeds its nodes within that viewport, and merged or duplicated nodes leave enough room for their pulsing outlines inside the playfield. See the [Gameplay 4 viewport](screenshots/pvp/gameplay4-viewport.png).
- The engine uses curved metal fan blades, a recessed housing, and charge lighting; its rotation speeds up as your tank fills. Glass tubes have machined caps, reflections, moving liquid surfaces, bubbles, and level indicators. See the [rendered score panel](screenshots/pvp/score-panel.png).
- A completed gameplay awards a difficulty-based reward. The maximum rewards are 90 (1), 110 (2), 130 (3), 160 (4), 100 (4.5), 220 (5), and 240 (6).
- Observed decision accuracy and mistakes reduce the reward. The formula is `max(10, round(base × (0.2 + 0.8 × accuracy) / (1 + 0.25 × errors)))`. Missing decision evidence earns a neutral 75% accuracy factor rather than a perfect-accuracy bonus. Earlier mistakes carry into the eventual completion; each failed run also adds a penalty of `1 / (1 + 0.2 × failed runs)`, with the final reward rounded and floored at 10. Failure penalties are separate from observed mistake counts, so a timeout is not presented as an incorrect answer.
- A failed gameplay awards no charge, removes **one step** from the attack meter (floored at zero), and retries the same problem. Previously earned engine charge remains. Normal gameplay limits apply; PVP does not grant the unlimited attempts used in free practice.
- Each win adds **one attack step**. Reaching **three steps** immediately throws a bomb and resets that meter to zero. Wins can be banked across a defeat: win, win, loss, win, win launches a bomb. Three more wins launch another bomb. Bombs remove up to **140 opponent charge**, with progress floored at zero. Flight, impact particles, and draining liquid show the attack. A third step still launches its bomb if the same gameplay also wins the race.
- Calculators and help are available in their existing gameplay locations. Opening them does not pause the opponent. **Esc** or **Leave Race** opens a forfeit confirmation; the race continues while it is open.

For LAN matches, prepare and install the updated desktop export on **both devices**. Protocol `ip2live-pvp-3` prevents older builds with independent question generation from joining the same race.

## VS AI

**Leave Race** and **Esc** open a compact 460x212 confirmation, using Nebula Regular for the header and Oxanium for the warning and controls. It fades and expands over 180ms, and fades/shrinks over 140ms when dismissed. **Keep Playing** is selected by default; use Left/Right and Enter, click either button, or press Esc to return. Opening and closing capture input so a click cannot reach the puzzle underneath. The race and opponent continue running.

Confirming Leave plays a full-screen cyan/red shutter transition, then returns to the PVP menu. Cleanup starts only after a fully covered frame is painted. LAN forfeit acknowledgement stays covered; repeated input cannot send duplicate leave requests. The menu reveals once story state, gameplay overlays and music have been restored. Reduced-motion settings use a fade instead of moving shutters. The renderer supports `leave`, `leave-opening`, `leave-closing`, `exit` and `exit-menu` for previewing these states.

Between circuits, the outgoing puzzle is retained while cyan/red shutters close in **220 milliseconds**. The next puzzle opens directly, then the shutters reveal it over **260 milliseconds** from its first visible frame. There is no Next Circuit page or result-summary pause. The engine/score sidebar remains visible. Hidden puzzle input is blocked during the transition; Escape and Leave Race remain available. LAN results must be acknowledged before another puzzle launches, so delayed/retried responses keep the transition closed and retain the existing reconnect/error handling. Winning still opens the victory screen and its certificate action.

The versus intro now uses illuminated portrait frames, metallic VS lettering, and cyan/red energy branches inspired by arcade duels. The three-second host countdown and synchronized start are unchanged. Reduced-motion settings keep the decorative energy and portrait positions steady. See the [intro](screenshots/pvp/intro-1920x1080.png), [live race](screenshots/pvp/race-1920x1080.png), and [mid-transition](screenshots/pvp/transition-1920x1080.png).

Circuit is a simulated opponent assigned the same problem seeds and shuffled sequence, rewards, penalties, retry rules, and bombs. It completes rounds at varied, gameplay-specific intervals and sometimes makes mistakes or fails. It does not inspect the human player's answers or adjust its score to catch up. VS AI is local and works without Wi-Fi.

Its ability and thinking times are configured in `PVPMode.AI_PROFILES` in `modules/pvp_mode.js`:

| Gameplay | Completion chance per attempt | Thinking time |
| --- | --- | --- |
| 1 | 80% | 14–22 seconds |
| 2 | 80% | 20–30 seconds |
| 3 | 80% | 22–34 seconds |
| 4 | 80% | 30–44 seconds |
| 4.5 | 80% | 15–24 seconds |
| 5 | 75% | 65–90 seconds |
| 6 | 72% | 80–105 seconds |

These are long-run probabilities, so individual races vary. Successful attempts on 1–4.5 have a 65% chance of zero mistakes, otherwise one mistake. On 5 and 6, successful attempts have a 40% and 35% chance of zero mistakes respectively, otherwise one or two mistakes. Failed attempts record two to four mistakes and earn no charge. Retries simulate familiarity by taking 10% less thinking time, bounded by the gameplay's minimum; their completion chance stays the same. The first attempt uses the same profile after the three-second intro. A late update resolves at most one attempt and schedules the next from the current time, preventing instant batches of wins after a suspended window.

## Victory certificates

The winner's result screen includes **Download Certificate**; **C** also downloads it. The certificate is a single-page **A4 landscape PDF** with the player's name, opponent, mode, victory date, gameplay wins, recorded mistakes, engine charge, and match ID. AI victories and victories by opponent forfeit are labeled. The loser's result screen has no certificate action.

The certificate renders entirely offline with the bundled fonts at print resolution, preserving Unicode names. Repeated downloads use the same certificate and completion time. Errors leave the result screen open for retry. Downloads use the normal browser/desktop download mechanism; when desktop storage is enabled, a copy is also archived in the local **IP2Live/Reports** folder. Certificates remain separate from assessed learning reports and story saves. See the [winner screen](screenshots/pvp/victory-result.png) and [sample landscape certificate](screenshots/pvp/victory-certificate.pdf).

## State and connections

PVP matches and lobbies are temporary. They do not overwrite story saves, autosaves, campaign health, quest progression, practice unlocks, or assessed teacher-report attempts. Exiting restores the previous story and manager context. There is no mid-race save or resume.

The LAN host owns race scores and bomb effects; clients submit completion metrics, never authoritative point totals. Repeated result requests are deduplicated by round ID. Snapshots carry revisions so delayed responses cannot roll scores back. Lobby membership uses per-player session tokens that are excluded from public snapshots. Discovery is restricted to local IPv4 networks, and the renderer only receives a narrow IPC API, not raw network or filesystem access. Gameplay completion still originates from each local game client; this is a trusted local-play mode, not a server-side anti-cheat system.

Inactive guest lobby slots expire after 12 seconds. During a race a player missing heartbeats for 12 seconds forfeits. Results are retried after temporary connection errors. When the host leaves through the menu, the final snapshot stays available for five seconds so the guest can see the result. A host app crash or network outage can instead produce a connection-interrupted screen. Rejoin by creating a new lobby; ongoing matches do not accept replacement players.

## Verification

Run from the project root:

```powershell
node --test tests/pvp-lan.test.mjs
node --test tests/pvp-desktop-bridge.test.mjs
node tests/pvp-mode.test.cjs
node tests/pvp-certificate.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/render-pvp.ps1
node --test tests/windows-release-preparation.test.mjs
```

The transport tests use real UDP/HTTP sockets and separate Node processes. When a local network adapter is available, they verify discovery and HTTP joining through that machine's actual LAN IPv4 address, including adapter-specific probes and preference over loopback. They also cover interrupted replies, a lost join response, two-player capacity, ready/start authorization, score calculation, retries, banked attack steps and bombs, disconnects, and final-result delivery. Both desktop devices need the updated build; the LAN protocol version rejects peers using older race rules. The desktop bridge test exercises the real preload/main IPC handlers and LAN transport together. Gameplay integration tests exercise the concise menu and hover, winner-only certificate actions and retry handling, versus intro and synchronized start, all seven real launchers, the 3→4 state handoff, bounded Gameplay 4 nodes after seeding/merging/duplication, actual Subnet Blaster combat and completion, viewport rendering and pointer mapping, story isolation, and cleanup. Certificate tests verify landscape page dimensions, byte offsets, Unicode rendering inputs and metadata, mode/forfeit labels, downloads, and optional archiving. The sample PDF was opened and rendered with an independent PDF.js reader. Native canvas previews show the actual score panel, menu, and intro drawing code, with the DOM name input represented in the menu preview. LAN-address tests on one computer do not traverse a router or another device's firewall; a physical two-device session remains a deployment check.
