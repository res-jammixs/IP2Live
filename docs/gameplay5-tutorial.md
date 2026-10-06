# Gameplay 5 tutorial

The tutorial follows the six prerequisite questions before the guided route sequence. Normal nodes remain independent. Dialogue pauses time and infection. A timeout or rejected final route ends the run and returns to the floor or testing panel without an AR diagnostic or automatic restart. The class lesson accepts a letter or full class answer. Wrong answers consume an attempt and refresh the address and virus formation; the third incorrect answer ends the run.

Lessons use one or two short points per slide, with calculations introduced when needed. Default-prefix guidance recalls Gameplay 3 only: eight light bulbs per octet, with one lit octet for Class A, two for B, and three for C in the default mask. Counting those bits gives /8, /16, and /24. Assigned masks can differ from these classful defaults.

The three-slide borrowing lesson explains bulb colors, the minimum borrowed-bit count, and the calculator. Host bits are binary positions rather than devices; usable hosts reserve the network and broadcast addresses. The examples distinguish 31 subnets (five borrowed bits) from 31 hosts (six remaining host bits). Route weights remain a puzzle rule, with fixed subnet calculations.

Each slide supplies explicit focus targets. The spotlight uses actual popup, keypad, bulb, and route-control geometry at the current resolution. Compact dialogue sits beside the target: below the class popup, over the left board for right-panel controls, or on the right when explaining the board. Target areas stay visible while the surroundings dim; the outline does not pulse or add extra labels.

Compact dialogues omit the transmission slashes, Incoming Transmission label, and title text. A small decorative rail and slide indicators replace the large header. Panel height accounts for that smaller header. Highlighted words use the same letter spacing for measuring and drawing as the surrounding text, and their backgrounds fit the smaller glyph height. Wrapped highlight fragments stay within their lines. The default-prefix reminder asks learners to remember eight bulbs per octet rather than count bulbs that are not shown in this phase.

Networking references:

- [Cisco: Host and subnet quantities](https://www.cisco.com/c/en/us/support/docs/ip/routing-information-protocol-rip/13790-8.html): classful octet boundaries, borrowed bits, and address quantities.
- [RFC 4632: Classless addressing](https://www.rfc-editor.org/rfc/rfc4632.html): explicit prefixes replace inferred classful sizes.

`tests/gameplay5_tutorial_flow.test.cjs` covers the full lesson and route sequence, concise and accurate copy, focus geometry at three resolutions, input blocking, timer/infection suspension, host-capacity answers, retries, independent nodes, missing-dialogue fallback, and keyboard controls. Class-lock checks cover correct answers, wrong-answer recalculation, three-answer failure, and pixel transitions. Replay and dialogue checks cover fresh tutorial launches and normal dialogue compatibility.

Classification, default-prefix, borrowing, and final Check tutorial captures were rendered in headless Edge and visually inspected on 2026-10-07. A full campaign playthrough was not performed.
