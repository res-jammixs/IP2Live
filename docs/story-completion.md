# Story ending and certificates

After completing the story route and reaching the final exit (currently Stage 4 Level 4, map 18), the world freezes, fades to black over 900 ms and holds for 400 ms. Four rendered epilogue chapters follow: the infiltrator severs the command core, APEX's hoarding mechanisms fail, its robots overload into debris, and a one-year time jump shows a thriving public community. The epilogue shares Origins' typing, fitted caption housing, diamond indicators, foreground clock and fade transitions. Space or Enter advances only after the caption is fully readable. Escape does not skip it.

For developer testing, the quest toolbar includes a certificate-shaped **Simulate Ending** button beside Skip Quest, Skip Floor and Simulate Game Over. It completes the current run's Story objectives, teleports to the final floor's normal spawn and leaves the final exit objective incomplete. Walk onto that marker to trigger the normal ending. Progress is reapplied after the transition and protected from the destination floor's entry reset. It sets quest flags without producing successful gameplay assessment attempts. `GameManager.enableEndingSimulationButton` controls this button; `enableDeveloperButtons` hides the whole toolbar. The shortcut is unavailable during gameplay, dialogues, overlays, Practice, PvP or Endless.

The completion screen uses the Game Over backdrop and a success-coloured title band, with a slowly rotating 3D certificate plaque in the center and a short thank-you message. Its front uses the actual personalized certificate; the reverse has the completion seal. Back to Main Menu waits for the final save, then fades out. Save Story retries both the completion checkpoint and numbered save, reporting success or failure. Certificate opens a readable preview with Download Certificate and Back controls. The name comes from the completed story's profile.

The completion actions and certificate-preview actions reuse Game Over's button painter with a green success palette: feathered horizontal edges, fitted Oxanium lettering and a moving lower highlight. Focus eases between buttons for mouse and keyboard navigation; reduced motion holds the highlight still. Both side gutters show faceted laurel awards with unlocked-system seals, gold stars, gently drifting green/gold foil and occasional soft signal bursts. The ornament artwork is cached, and motion freezes with the rest of the completion screen.

Players can download earned certificates again through **Play Game → Story Mode → Story Certificates**. Previous/Next selects between completed runs. The archive survives restarting the game and starting a new story. An empty archive explains how to earn a certificate. Read and download failures can be retried.

After earning a story completion, the main menu also shows **Certificate** directly below **Credits**. It opens the named certificate archive with Download Certificate and Back controls. The button is hidden until a valid completed run exists and remains available after restarting the game.

Completion is stored in `game.ip2liveGameStates.storyCompletion`, so native numbered saves and the recovery autosave capture it. An archive in localStorage and the existing profile database retains the award after returning to the main menu. Loading a completed save opens its completion screen directly; an older save with the entire route already finished gets the new ending and award once. A run keeps its original completion timestamp and certificate ID. Practice, PVP, tutorial replay, developer gameplay, incomplete routes, and unknown maps do not award story certificates.

`modules/story_completion.js` owns eligibility, award persistence and restored endings. `modules/screens/story-ending.js` owns the world fade, completion screen and archive. `story-epilogue.js` reuses the opening story controller, while `story-epilogue-art.js` supplies the cached paintings, effects and perspective-textured certificate model. `modules/story_certificate.js` owns the certificate artwork. `modules/certificate_pdf.js` exports offline PDFs for both story and existing PVP awards, preserving Unicode names in artwork and PDF metadata. Windows exports copy these modules with the rest of the project plugin.

The `STORY_ENDING` music profile in `modules/music_manager.js` currently reuses Stage 4 music with its own volume. It supports the same volume and loop settings as other profiles. The certificate archive keeps the title music.

The ending artwork uses brushed-metal grain, bevelled armour, server racks, pressure machinery, a fractured command core and individually animated robot parts. The public square reconnects the community farms, water, homes and supply pavilion. Static paintings and certificate textures are cached; cutscene effects paint at 24 fps and the completion screen at 30 fps. The certificate raster uses cached triangle sprites at 24 fps, avoiding repeated clipping and full-resolution texture work. Focus loss or a covering screen freezes typing and motion. Reduced motion shows settled debris and a stationary certificate with shorter fades. The certificate keeps the textured ivory, illustrated uplink spine, etched circuits, polygon watermark and gold medal used by the PDF.

Validate with:

```powershell
node --test tests/story_completion.test.cjs tests/story_autosave.test.cjs tests/story_persistence.test.cjs tests/menu_transition.test.cjs tests/pvp-certificate.test.cjs
powershell -NoProfile -File tools/render-story-ending.ps1
powershell -NoProfile -File tools/render-story-ending.ps1 -States certificate
```

The renderer uses production screen and certificate code with a sample completed run. It writes previews to `docs/screenshots/story-ending`. The `certificate` state also writes `certificate-example.pdf`; `apex`, `robots` and `restored` preview the other epilogue chapters. `certificate-view` shows the completion-screen certificate overlay. Add `animate=1` to the HTML preview URL to run its motion. It does not modify a player's progress or award a real certificate.
