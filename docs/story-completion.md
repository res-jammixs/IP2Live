# Story ending and certificates

After completing the story route and reaching the final exit (currently Stage 4 Level 4, map 18), the game plays a three-part ending: the final uplink connects, APEX loses control, and the Neural Link thanks the named player. Each scene runs for six seconds. Enter advances the current scene; Escape skips to the completion screen.

The completion screen displays the saved infiltrator name and completion date, offers an offline A4 landscape PDF certificate, and provides Replay Ending and Main Menu buttons. It waits for the final save before returning to the title. The name comes from the completed story's profile; it does not use the currently selected menu profile or a hero's default name.

Players can download earned certificates again through **Play Game → Story Mode → Story Certificates**. Previous/Next selects between completed runs. The archive survives restarting the game and starting a new story. An empty archive explains how to earn a certificate. Read and download failures can be retried.

After earning a story completion, the main menu also shows **Certificate** directly below **Credits**. It opens the named certificate archive with Download Certificate and Back controls. The button is hidden until a valid completed run exists and remains available after restarting the game.

Completion is stored in `game.ip2liveGameStates.storyCompletion`, so native numbered saves and the recovery autosave capture it. An archive in localStorage and the existing profile database retains the award after returning to the main menu. Loading a completed save opens its completion screen directly; an older save with the entire route already finished gets the new ending and award once. A run keeps its original completion timestamp and certificate ID. Practice, PVP, tutorial replay, developer gameplay, incomplete routes, and unknown maps do not award story certificates.

`modules/story_completion.js` owns eligibility, award persistence and restored endings. `modules/screens/story-ending.js` owns the cutscene, completion screen and archive. `modules/story_certificate.js` owns the certificate artwork. `modules/certificate_pdf.js` exports offline PDFs for both story and existing PVP awards, preserving Unicode names in artwork and PDF metadata. Windows exports copy these modules with the rest of the project plugin.

The `STORY_ENDING` music profile in `modules/music_manager.js` currently reuses Stage 4 music with its own volume. It supports the same volume and loop settings as other profiles. The certificate archive keeps the title music.

The ending artwork uses brushed-metal grain, bevelled armour, cut-corner panels, illuminated relay cabinets and a faceted neural reactor. Background materials, button textures, the completion medal and the certificate preview are cached for rendering. Decorative motion respects the system's reduced-motion preference. The certificate uses textured ivory, a dark illustrated uplink spine, etched circuit details, a polygon watermark and a gold laurel medal; the PDF uses the same artwork as the preview.

Validate with:

```powershell
node --test tests/story_completion.test.cjs tests/story_autosave.test.cjs tests/story_persistence.test.cjs tests/menu_transition.test.cjs tests/pvp-certificate.test.cjs
powershell -NoProfile -File tools/render-story-ending.ps1
powershell -NoProfile -File tools/render-story-ending.ps1 -States certificate
```

The renderer uses production screen and certificate code with a sample completed run. It writes previews to `docs/screenshots/story-ending`. The `certificate` state also writes `certificate-example.pdf`; `apex` and `restored` preview the other cutscene chapters. It does not modify a player's progress or award a real certificate.
