# Gameplay soundtrack

Seven original, deterministic mechanical and hacking BGM loops are stored
here. All are 44.1 kHz, 16-bit stereo WAV files with a prepared loop join and
peak headroom. They contain no external samples or AI-generated audio.

| Gameplay | Track | Musical cue |
| --- | --- | --- |
| 3 · CIDR binary panel | `03-bitstream-decoder.wav` | Alternating bit tones and precise digital clicks. |
| 4 · Subnet simulator | `04-subnet-relay.wav` | Packet pulses travel across stereo relays. |
| 4.5 · Host-power reactor | `04_5-reactor-lattice.wav` | Slow turbine hits and a rising charge pattern. |
| 5 · CIDR quarantine | `05-quarantine-breach.wav` | Gated bass and a tense two-tone scan. |
| 6 · Quarantine matrix | `06-matrix-lockdown.wav` | Interlocking grids with denser machine accents. |
| 7 · Network repair | `07-repair-uplink.wav` | Broken pulses resolve into a connection motif. |
| 8 · VLSM allocator | `08-allocation-protocol.wav` | Ordered allocation arpeggios and confirmation chimes. |

The music IDs are **22–28** in that order. Profiles `GAMEPLAY_3` through
`GAMEPLAY_8` (including `GAMEPLAY_45`) in
`Plugins/IP2Live_Core/modules/music_manager.js` use a base volume of **1.00**.
The player's Music setting and pause ducking still multiply this value. Edit
each profile there to tune its volume, start time, and loop boundaries.

`manifest.json` records duration, tempo, checksum, and measured output level.
The generator copies the WAVs to the plugin's `assets/audio/gameplay` recovery
bundle and registers their paths in `songs.json`:

```powershell
node tools/generate-gameplay-bgm.cjs
```

The generation is deterministic. Register or keep the same filenames in RPG
Paper Maker before making an ordinary export. For protected Windows exports,
the release script verifies the plugin bundle and can recover these music IDs
even if the editor's cached database discarded them.
