# Gameplay 4.5: Host-Power Reactor

This folder contains the three requested implementations:

- `ip_host_power_tutorial.js` — guided explanation and tutorial launcher.
- `ip_host_power_gameplay.js` — one-minute falling-capsule reactor gameplay.
- `ip_host_power_tool.js` — compact one-third-width draggable calculator.

## Learning rule

The implementation always validates usable hosts:

`2^h - 2 >= needed hosts`

The `-2` reserves the network and broadcast addresses. The player succeeds only at the smallest valid exponent. For example, 2^11 is not valid for 2,048 needed hosts because it provides only 2,046 usable hosts; 2^12 is required.

After finding the host exponent, the interface also shows the bridge to the next lesson:

`bits to borrow = class host bits - required host exponent`

For example, a Class B target needing `h = 12` allows `16 - 12 = 4` borrowed bits.

## Class-based targets

Only Class A, B, and C are generated:

| Class | Base prefix | Maximum host bits | Randomized usable-host range |
| --- | ---: | ---: | ---: |
| A | /8 | 24 | 65,535 to 16,777,214 |
| B | /16 | 16 | 255 to 65,534 |
| C | /24 | 8 | 2 to 254 |

The ranges keep each random target inside its class capacity. Passing `targetClass`, `targetClasses`, or `requiredHosts` overrides the random choice while still enforcing class limits.

## Launch helpers

After `Plugins/IP2Live_Core/code.js` loads the bundle, use:

```js
startHostPowerTutorialFourPointFive({ targetClass: 'C' });
startHostPowerGameplayFourPointFive({ targetClasses: ['A', 'B', 'C'] });
startHostPowerToolFourPointFive({ targetClass: 'B', showIntro: true });
```

The full gameplay is also launched through `IP2Live.GameManager.startGameplayNode('ip_host_power_reactor', options)` by the Stage 3 quest flow.

## Stage 3 progression

- Stage 3 Level 1 (Map 11): all five terminals run Gameplay 4.5; the first is guided.
- Stage 3 Level 2 (Map 12): two Gameplay 4.5 terminals come first, followed by three Gameplay 5 terminals; the first Gameplay 5 terminal is guided.
- Stage 3 Level 3 (Map 13): Gameplays 4.5 and 5 alternate before the final guided Gameplay 6 terminal.

Quest definitions and their order are authoritative in `modules/game_manager.js`. The gameplay manager consumes the active quest specification so its class, required-host target, map, quest, and report metadata remain aligned.

## Full gameplay controls

- Move the gun: `A/D`, left/right arrows, or mouse movement inside the left arena.
- The gun fires automatically.
- Blue capsules add `+1` through `+5` to the exponent.
- Red viruses subtract `-1` or `-2`.
- `Esc` exits; `R` retries after a timeout.

## Compact tool controls

- Drag a bubble into the calculator drop zone.
- Keyboard alternative: choose with left/right and add with Enter/Space.
- `R` resets, `N` generates a new target, and `Esc` closes the tool.
- The Class A/B/C chips create a new target for the selected class.
