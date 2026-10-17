# Story ending soundtrack

Two original compositions for the final Story sequence. Both are stereo
44.1 kHz / 16-bit PCM WAV loops with circular sustain and reverb tails.

| File | Title / use | Arrangement |
| --- | --- | --- |
| `01-a-network-restored.wav` | **A Network Restored** — one continuous score across all four epilogue slides | 96 seconds, 80 BPM. Warm strings, felt electric piano, a restrained pulse and a hopeful melody. Four musical sections move from D minor toward F major as the story shifts from APEX's defeat to a restored Neo-Gaia. |
| `02-open-skies.wav` | **Open Skies** — Story Complete / victory screen | 68.57 seconds, 112 BPM, F major. A rising synth theme, rounded bass, shimmering arpeggios and light drums, with a quieter middle section. |

The epilogue score starts after the world fades out, continues through slide
changes, and loops if the player takes time to read. Completing the fourth
slide switches to the victory theme. Reopening a completed Story save plays
the victory theme directly; browsing archived certificates keeps menu music.
Both cues respect the player's music volume setting.

Native song IDs are **29** and **30**, with paths relative to `Songs/Musics`.
`manifest.json` records duration, arrangement, levels and SHA-256 checksums.
Exact recovery copies and a manifest ship in
`Plugins/IP2Live_Core/assets/audio/story-ending/`, so protected exports and
editor-overwritten song registries can still play them.

Rebuild deterministically with:

```sh
node tools/generate-story-ending-audio.cjs
```

All instruments are synthesized locally from oscillators and seeded noise.
No external samples, packages, services or AI-generated audio are used. The
generator also restores missing registrations for the existing plugin-owned
prologue and gameplay cues; it stops rather than overwriting conflicting IDs.
