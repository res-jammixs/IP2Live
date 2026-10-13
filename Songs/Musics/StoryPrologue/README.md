# Origins — four original ambient cues

These tracks are composed and synthesized locally with oscillators, seeded noise,
envelopes and circular stereo reverb. They contain no external samples or AI-generated audio.
All files are stereo 44.1 kHz / 16-bit PCM WAV.

| Slide | Music file (32-second seamless loop) | Matching effects |
| --- | --- | --- |
| The Arrival | `01-arrival-ost.wav` | Five descending engines; a 4.6-second one-shot matching the ship entrances |
| The Taking | `02-taking-ost.wav` | Sheltered rain, pipe pressure, droplets and pump cycles |
| The Fortress | `03-fortress-ost.wav` | Rain, low machinery and distant surveillance beacons |
| Our Way Inside | `04-our-way-inside-ost.wav` | Hologram hums and short terminal confirmation tones |

The companion SFX are in `Songs/MusicEffects/StoryPrologue`. This follows the engine's
separate music/effects folders and keeps the player's **Music** and **SFX** sliders independent.
The last three effects tracks loop every 16 seconds. The Arrival descent never repeats.

`songs.json` registers music IDs **18–21** and music-effect IDs **4–7**, including their
subfolder names, so the normal RPG Paper Maker exporter can embed them in protected builds.
The generator also ships exact WAV copies in
`Plugins/IP2Live_Core/assets/audio/story-prologue`. If the editor saves an older songs database,
the manager registers these plugin-owned assets at runtime using native `Model.Song` objects.
Embedded tracks are preferred, and existing songs at reused IDs are preserved. Protected
exports can use these bundled files even when their embedded registry predates the prologue.
Rebuild or synchronize the updated plugin, including its audio folder, into existing exports.
The Windows release tool checks every bundled file against its SHA256 manifest before shipping.

The prologue selects a matching pair for every slide. Music fades out during each transition;
effects follow the illustration's fade and foreground clock, pause when it loses focus or is
covered, and stop on exit. A late decode seeks to the current descent position or skips the
cue if the ships have already landed. Reduced motion omits the ship descent effect.

Adjust BGM profiles `STORY_PROLOGUE`, `PROLOGUE_TAKING`, `PROLOGUE_FORTRESS`, and
`PROLOGUE_UPLINK` in `Plugins/IP2Live_Core/modules/music_manager.js`. Matching effect gains
are in `EFFECT_TRACKS` in the same file. Both gains multiply the player's saved volume.

Regenerate the original files deterministically:

```powershell
node tools/generate-story-prologue-audio.cjs
```

`manifest.json` records duration, looping and measured RMS/peak levels. The WAVs leave at
least 5 dB peak headroom before the game applies its quieter scene mix.

Verify file format, loop boundaries, slide routing, volume controls and cleanup:

```powershell
node --test tests/story_prologue_audio.test.cjs tests/story_prologue.test.cjs tests/music_management.test.cjs tests/music_registry.test.cjs tests/music_runtime.test.cjs
```
