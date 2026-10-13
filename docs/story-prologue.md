# APEX story and prologue

The story now follows a single premise: invaders from another galaxy seized Neo-Gaia's shared resources, built a facility around the hoard and placed the APEX AI in control. The player infiltrates its floors through IP classification and subnetting, reaches the upper command core and dismantles the monopoly so resources can reach everyone again. The mission preserves the public infrastructure needed afterward.

## Narrative content

`Plugins/IP2Live_Core/modules/story_lore.js` is the canonical content file:

- `prologue`: four chapter titles, subtitles and captions.
- `floors`: the first-entry briefings for maps 3–18, including transit floors. Each explains the local challenge and its role in the reclamation mission.
- `tutorialIntro` and `tutorialOutro`: the service-access briefing, training purpose and handoff to the first wire floor.
- `gameplayBriefings`: first-encounter context for all gameplay types and the harder Wires/CIDR variants.

DialogueManager loads this module before constructing its registry and merges its canonical entries when `dialogues.json` loads. The JSON includes the same tutorial/floor copy for standalone previews and fallback consumers; canonical entries take precedence. MapManager's duplicated old floor prose has been removed. Its existing first-entry/resume guards still determine when a floor briefing can play.

First gameplay context is prepended to the introduction's first text slide, keeping teaching slide indices and visual spotlight callbacks intact. `game.ip2liveGameStates.gameplayLoreSeen` records each encountered gameplay for that Story. Optional Practice, Endless, PVP and tutorial/developer replays do not write those campaign flags. Later attempts retain the original instructions without repeating the additional lore. The tutorial's highlighted movement keys and required key counts are unchanged.

## Four illustrated scenes

1. **The Arrival**: a public city and raised community farms aligned with the building roof axes. The adjacent blue water channel has concrete banks, reflections, an intake grate, a level gauge and a cross-feed into the crop irrigation. Soil furrows, grain and leafy rows follow the same horizontal and receding edges as the city.
2. **The Taking**: a public water kiosk with a dry collector, closed valve and cut-supply meter, contrasted with stocked APEX vaults. Glass windows reveal stored water, a power core, food crates and medical supplies. Metallic pipe couplings and valves connect all four vaults to their supply manifold.
3. **The Fortress**: layered security floors, APEX's aperture, surveillance drones and the infiltrator centered on a long entrance bridge.
4. **Our Way Inside**: a hooded infiltrator operates an upright subnet-and-netmask hologram above a supported service desk. The terrace's paving and illuminated approach share a horizon centered on the APEX entrance. A visible plinth supports the entire tower footprint, and six stair treads connect its doorway to the approach. A single beveled service-bay opening frames the scene without obscuring the tower. Contact shadows anchor the infiltrator's boots and workstation feet; holographic scans and route packets follow the same level display coordinates as the painted text.

All art is deterministic Canvas drawing in `modules/screens/story-prologue-art.js`. It uses layered polygons, extruded buildings, gradients, fixed surface grain, recessed panels, atmospheric haze and light. There are no generated image assets, image downloads or art dependencies. The last scene calls `IP2Live.MainMenuArt.drawInfiltrator` to share the main menu's pose, coat and working hand, then adds its raised hood and terminal casing behind the hand.

`modules/screens/story-prologue.js` renders the captions and controls separately using Nebula headings and Oxanium text. Captions use a dark inset panel with cached brushed-metal grain, beveled corner plates, fasteners and recessed circuit accents. The housing fits the measured full text and stays steady throughout typing, with generous line spacing and a centered keyboard prompt. Four gold/gray diamond indicators in the upper-right corner match the in-game dialogue header. The layout scales from a 1280 × 720 design space, with letterboxing when needed.

## Timing and controls

Architecture and figures remain still, with a separate small ambient pass: slow ship-engine light pulses, a few city windows changing brightness, drifting dust, gentle rain on the occupied-city/fortress scenes, supply flow through the APEX manifold, and holographic scans, route packets and touch feedback. Seeded positions stay deterministic; rain and particles are never regenerated randomly each frame.

In the first scene, all five ships begin above the screen, descend with slightly staggered cubic easing and stop at their original positions within 3.75 seconds. Their engine lights follow the moving hulls and their cloud shadow arrives with them. `ARRIVAL_FLEET` groups the final positions, entry delays and durations. Five tightly bounded Canvas sprites keep the city painting cached; the first slide releases them when it fades out. Reduced motion shows the settled fleet immediately.

The ambient clock uses foreground time, stops under overlays or when unfocused/hidden, and never catches up after returning. Ambient redraws are capped at 24 fps, including after the caption finishes. Reduced-motion settings hold effects at a fixed pose. No additional timers, input listeners or animation loops are installed.

Each chapter fades in over 750 ms and fades out through black over 550 ms. Reduced-motion settings shorten each fade to 140 ms. Text appears at 36 characters per second, with brief pauses at punctuation. These values are grouped in the prologue screen's `_fadeMs()` and typing loop.

Space or Enter advances only after the full caption has finished typing, followed by a brief input guard. Reading has no automatic timeout. All four chapters must be read: there are no Continue/Skip buttons, Escape does not advance, and clicking cannot bypass the story. Repeated keys and rapid duplicate input cannot skip extra chapters. Hidden/unfocused windows and background overlays suspend typing and transitions.

Only the current painting and the next painting remain cached, at a maximum density of 1.5. The next scene is prepared while the current caption types. Material grain, crops, containers, character detail, dialogue housing and ship hulls stay cached; the animation pass never repaints them. Reduced motion stops requesting redraws once typing finishes. Leaving the prologue releases its scene canvases and resets held input.

## New Story flow

After name confirmation and the existing loading bridge, `GameManager.startNewGameFlow` clears the previous Story's transient state and opens the prologue. Autosave initialization and the tutorial map start only after the fourth chapter's final fade. The previous durable autosave remains intact during reading. The handoff runs once, and a failed route displays a readable Space / Enter retry prompt. Existing slot/autosave loads and direct tutorial replays do not replay the prologue.

Each slide now has its own original ambient OST and matching SFX, registered in `songs.json` for native and protected exports. Music loops last 32 seconds; effects loop for 16 seconds except the Arrival's one-shot ship descent. The effects follow the foreground animation clock and illustration fade, suspend under overlays/on focus loss, and cannot restart after their slide closes or a late decode finishes. Music fades out at each chapter transition; entering the tutorial restores its normal profile. Music and SFX use independent player volume sliders. See [audio files and tuning](../Songs/Musics/StoryPrologue/README.md).

## Preview and verification

[All four rendered scenes](screenshots/story-prologue/all-four-scenes.png), [1024 × 768 layout](screenshots/story-prologue/scene-4-1024x768.png), and [typing example](screenshots/story-prologue/typing-1280x720.png) are actual Canvas renders with the project's fonts. `tests/fixtures/story_prologue_preview.html` is an interactive standalone preview of the real rendering/input code.

The preview includes an ambient-motion toggle. Use **Play from beginning** to see the ship entrance; full-caption previews start with the fleet settled. [Descent frames](screenshots/story-prologue/arrival-descent.png) show the first scene at 0, 0.8, 1.6 and 4 seconds. Native Canvas frames were checked at different animation times, along with the smaller layout. The latest focused prologue, tutorial and input run passed 31 checks, including the 24 fps request limit, foreground-clock suspension, non-looping ship descent, reduced motion and bounded canvas caching.

Run `node --test tests/story_prologue.test.cjs tests/tutorial_dialogue_centralization.test.cjs tests/dialogue_typography.test.cjs tests/load_resume_dialogue_guards.test.cjs tests/ip_wires_dialogue_highlights.test.cjs tests/story_completion.test.cjs tests/music_registry.test.cjs` to check story coverage, timing, input, loading, isolation and existing tutorial behavior.
