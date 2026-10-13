# Song library

RPG Paper Maker separates background music (`Musics`) from sound effects
(`MusicEffects`). The names and relative paths in `songs.json` must match the
files here exactly.

| Location | Contents |
| --- | --- |
| `Musics/Gameplay/` | Seven original, separately looped Gameplays 3–8 cues, including Gameplay 4.5; see its README. |
| `Musics/StoryPrologue/` | Four Origins slide scores, source manifest, and notes. |
| `MusicEffects/StoryPrologue/` | Four matching Origins effect beds. |
| `Musics/` root | Registered menu, tutorial, stage, Gameplay 1–2, and older PvP music. |
| `MusicEffects/` root | Registered typing and glitch effects. |

The older root files keep their registered paths because the editor and
existing exports refer to those exact names. The old `Gameplay 5 & 6.mp3`
remains available to the PvP race. The actual Gameplays 5 and 6 use their new,
separate tracks under `Musics/Gameplay/`.

The plugin also carries checksum-verified copies of both new soundtrack
collections under `Plugins/IP2Live_Core/assets/audio/`. Those copies let the
music manager recover native song registrations when the editor saves an
outdated song database or a protected export predates the new cues.
