# Music management

Edit the configuration tables at the top of `Plugins/IP2Live_Core/modules/music_manager.js` to change the game's shipped music settings. The existing Settings music slider remains the player's master volume.

`MUSIC_TRACKS` contains independent profiles for `MAIN_MENU`, `TUTORIAL`, `STAGE_1` through `STAGE_4`, `GAMEPLAY_1` through `GAMEPLAY_8` (including `GAMEPLAY_45`), `PVP_MENU`, and `PVP_RACE`. Profiles can share an audio asset while keeping separate volume and timing. `GAMEPLAY_56` remains available for older callers.

| Setting | Meaning | Default |
| --- | --- | --- |
| `id`, `name` | Exact registered music ID and filename from `songs.json` | Per profile |
| `volume` | Profile gain from 0 to 1; multiplied by the player's master volume | Per profile |
| `startAt` | Second at which initial playback begins | `0` |
| `loop` | Repeat the track or play it once | `true` |
| `loopStart` | Second to return to on each repeat | `0` |
| `loopEnd` | Repeat or stop at this second; `null` uses the natural end | `null` |

For example, add these fields to the `TUTORIAL` entry:

```js
TUTORIAL: {
    id: 10, name: 'Tutorial.mp3', volume: 0.35,
    startAt: 0, loop: true, loopStart: 12, loopEnd: 90,
},
```

This plays seconds 0–90 once, then repeats seconds 12–90. With `loop: false`, it stops at second 90. Loop boundaries must fall within the decoded audio duration, and `loopEnd` must follow both `startAt` and `loopStart`.

Set floor exceptions in `MUSIC_FLOORS`, keyed by **map ID**. Unspecified fields inherit from that floor's tutorial or stage profile:

```js
var MUSIC_FLOORS = {
    4: { volume: 0.45, loopStart: 16 }, // Stage 1, Level 2
    7: { volume: 0.55 },                // Stage 2, Level 1
};
```

`MUSIC_GAMEPLAYS` maps each gameplay ID to its profile. Gameplays 3–8 now have seven distinct original tracks, including Gameplay 4.5; their base profile volumes are `1.00`. Gameplay 5 and Gameplay 6 no longer share a song. The older `GAMEPLAY_56` zone follows Gameplay 5 for compatibility, while `PVP_RACE` keeps its separate song ID 17. See [Gameplay soundtrack](../Songs/Musics/Gameplay/README.md) for the cue list and regeneration command.

`STORY_ENDING` controls music during the story epilogue and completion screen. It reuses Stage 4's registered track with independent volume and timing. The Story Certificates archive leaves the main-menu music playing.

The four Origins slides use original registered WAVs: `STORY_PROLOGUE` (Arrival),
`PROLOGUE_TAKING`, `PROLOGUE_FORTRESS`, and `PROLOGUE_UPLINK`. Each has an independent
volume/loop profile and a matching `SoundFX.createLayer()` effect bed. The screen owns and
releases these layers. `layer.sync(seconds, active, gain)` follows foreground scene time and
fade opacity; `layer.stop()` permanently cancels playback, including pending loads/unlocks.
Changing the SFX slider immediately updates active layers without touching BGM volume.
See [Origins audio](../Songs/Musics/StoryPrologue/README.md) for files, IDs and regeneration.

The Origins and new Gameplay profiles include a `bundled` filename. If the editor overwrites
new song registrations from its cached database, the manager recovers native song objects from
`Plugins/IP2Live_Core/assets/audio/story-prologue` or `assets/audio/gameplay`. These files are copied with the plugin
in protected exports. Embedded registrations take precedence; ID collisions allocate a free
ID without overwriting authored songs. Recovery is repeated after the engine reloads its
song registry. The source assets remain under `Songs` for normal editor/export use.

A missing or mismatched registration for other tracks produces one warning and suspends
automatic input retries until that registry entry changes or the engine reloads the registry.
Autoplay locks still retry after genuine input. The Windows release tool accepts the eight
prologue assets and seven gameplay cues only after verifying each entire plugin bundle's
checksums; other custom music continues to require its normal exported registration.

For live tuning in the game console:

```js
const music = IP2Live.MusicManager;
music.configureZone('STAGE_2', { volume: 0.6 });
music.configureFloor(4, { volume: 0.4, loopStart: 12, loopEnd: 90 });
music.configureZone('GAMEPLAY_5', { volume: 0.5 });
music.configureZone('PVP_MENU', { volume: 0.3 });
music.configureZone('PVP_RACE', { loop: true, loopStart: 8 });
music.getZoneConfig('TUTORIAL');
music.getConfiguration();
```

Volume changes apply to the active profile immediately. Timing or asset changes restart the affected active profile. Console configuration lasts for the current run; copy final values into the configuration tables and rebuild the export to ship them. Player master-volume preferences continue to use the existing audio settings storage.

World and gameplay pause menus automatically select the `PAUSED` mix state. Music keeps playing and looping at 70% of its usual volume, including while Settings is open above Pause. Removing the pause menu restores the current profile and master volume without restarting the track. Mute and changes to the player's volume slider still apply while paused.

Change `MUSIC_STATES.PAUSED.volume` at the top of the manager to ship a different pause gain, or use `music.setPauseVolume(0.6)` for live tuning. `music.getState()` returns `NORMAL` or `PAUSED`. Custom pause overlays can call `music.setPaused(true, overlay)` when opened and `music.setPaused(false, overlay)` when closed; each overlay must release its own request. Pause gain is separate from saved player preferences.

Use `playMap(mapId)` for a world floor, `playGameplay(gameplayId)` for a puzzle, and `restoreContext()` when leaving a puzzle. `play(zone)` selects that exact profile. Music follows resumed maps independently of entry dialogue, and map updates only claim BGM when the map owns the active screen. Returning from PVP or practice restores the appropriate screen music.

Full-track repetition uses Howler's built-in looping. Custom boundaries use one cancellable timer checked against the actual playback position, plus Howler end/seek/play events. Pauses and later seeks reschedule the boundary; switching profiles removes its listeners and timer. These custom seek boundaries are suitable for second-based music cues, but are not a sample-accurate audio-editing crossfade. See the [Howler playback documentation](https://github.com/goldfire/howler.js#documentation) for the underlying seek, loop, and event APIs.

Run the audio regression checks with:

```powershell
node --test tests/music_management.test.cjs tests/music_runtime.test.cjs tests/music_registry.test.cjs tests/gameplay_bgm.test.cjs tests/story_autosave.test.cjs
```

The tests use controlled audio and clocks to exercise resumed tutorial music, overlapping native BGM, rapid requests, floor and gameplay volume, custom loops, pause/resume, one-shot tracks, and stale fade cleanup. Listen to the chosen MP3 loop boundaries in the game before shipping to confirm the musical cut sounds right.
