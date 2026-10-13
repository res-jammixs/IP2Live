/** Canonical APEX story, floor briefings and first-encounter context. */
(function () {
    const floors = {
        3: ['THE SERVICE ENTRANCE', [
            'We are inside the lowest service floor of the APEX facility. Beyond these walls, families wait for power while the occupiers keep their reserves lit.',
            'Four IP wire relays feed this sector. Classify each address and repair its connection; every restored relay brings light back to the room.',
            'Open the next-floor route. We are taking back access, one connection at a time.',
        ]],
        4: ['THE DISTRIBUTION LOCK', [
            'APEX diverts the city\'s supply traffic through this distribution floor. The network still serves the occupiers while the public conduits stand empty.',
            'Repair the wire relays, then learn the Patch Panel classifier. Read each packet\'s type before choosing its IP class or default mask.',
            'A clean route lets us climb toward the controls that decide who receives the planet\'s resources.',
        ]],
        5: ['THE ADAPTIVE GRID', [
            'The occupiers reinforced this grid after the first shortages sparked resistance. APEX now changes its locks when it detects a bad connection.',
            'Ordinary and harder wire relays share this floor\'s power supply. Finish both kinds to restore full lighting; Patch Panels guard the links between them.',
            'If a failed breach reopens a repaired wire quest, that part of the room loses power again. Rebuild the route and keep moving upward.',
        ]],
        6: ['THE INNER POWER RING', [
            'This is the last power ring before the subnet-control wing. APEX keeps it dark so intruders cannot read the machinery carrying our stolen energy.',
            'Use everything you have learned about ordinary wires, adaptive wires and packet classification. Every wire relay contributes to the same lighting recovery.',
            'Restore the ring and reach the next wing. The command core is above us; the people who need this power are below.',
        ]],
        7: ['THE SUBNET GATES', [
            'APEX divides the facility into private networks, keeping its reservoirs and supply systems beyond public reach. These binary panels guard the first boundaries.',
            'Rebuild each subnet mask with the lamps, then count the network bits to enter its CIDR prefix. The five panels can cross Class A, B and C boundaries.',
            'Understanding the boundary is how we cross it. Break these locks and bring the upper supply network within reach.',
        ]],
        8: ['THE CAPACITY CHECKPOINTS', [
            'The next checkpoints verify both identity and capacity. APEX will not pass a route unless its subnet layout agrees with the mask that opened the gate.',
            'Solve each Class C CIDR panel, then carry its exact interesting octet into the linked Subnet Simulator. Calculate subnet counts before host capacity.',
            'We need a route that works when the public systems reconnect. Precision here protects the people who will depend on it.',
        ]],
        9: ['THE SHIFTING BOUNDARY', [
            'APEX has noticed the intrusion. Its adaptive boundary now replaces a subnet mask whenever a submitted lamp pattern or prefix is wrong.',
            'Read the new target after each mistake and recalculate. Only the mask you finally verify can supply the linked Subnet Simulator\'s reference.',
            'The occupiers built these boundaries to exclude everyone else. We will understand them well enough to open a path through.',
        ]],
        10: ['THE LAST MASK LOCKS', [
            'These adaptive relays seal the upper edge of the subnet-control wing. Above them are the engines that enforce APEX\'s resource monopoly.',
            'One wrong answer re-keys the active mask. Rebuild the binary pattern and CIDR prefix from the current target, not the one APEX discarded.',
            'Clear the wing and carry your subnetting knowledge into the containment floors. The climb is getting closer to the core.',
        ]],
        11: ['THE RESERVE ENGINES', [
            'The facility\'s engines reserve network capacity for the occupiers while clinics and neighborhoods remain disconnected. We must calculate a bypass that can support real users.',
            'At each Host-Power Reactor, find the smallest h for which 2^h - 2 meets the required usable hosts. Begin with the guided reactor, then stabilize the remaining nodes.',
            'Enough capacity, without waste: that is how we prepare a network meant to serve everyone.',
        ]],
        12: ['THE CONTAINMENT FLOOR', [
            'APEX isolates stolen reserves behind hostile network segments. Charging through would expose our route to its countermeasures.',
            'Verify host capacity at the first two reactors. Then re-segment the allocated network: classify it, choose borrowed bits, verify usable hosts and secure the route.',
            'Keep the intrusion contained while we move upward. The systems we are reclaiming must survive the breach.',
        ]],
        13: ['THE COUNTERMEASURE WING', [
            'APEX is defending the supply backbone with capacity locks and isolated segments. Its automated enforcers are protecting the hoard, not the people outside.',
            'Combine Host-Power Reactors with network re-segmentation. At the final training node, Subnet Blaster turns network and broadcast calculations into a way through the defenses.',
            'Defeating an enforcer opens another route. The main APEX command core still waits at the top of the facility.',
        ]],
        14: ['THE UPPER TRANSIT SHAFT', [
            'The containment wing is behind us. This transit floor carries the cables linking the occupiers\' reserves to the upper command network.',
            'Follow the route beacon to the next access point. The offices ahead hold the address tables that keep public services cut off.',
            'We are close enough to restore those links. Keep the mission in sight: resources for the planet, not a privileged few.',
        ]],
        15: ['THE SILENCED OFFICES', [
            'These offices once coordinated public services. APEX corrupted their address tables so the city\'s requests could never reach the reserves upstairs.',
            'Repair the five PCs. Catch the required formula variables and recover network addresses, broadcast addresses and usable host ranges.',
            'Every repaired table is a service route we can return to the people when the core\'s monopoly ends.',
        ]],
        16: ['THE FINAL APPROACH', [
            'We have reached the approach to the central routing grid. Behind its final gates, APEX decides which branches receive access to the planet\'s hoarded resources.',
            'Follow the beacon through this floor and prepare to allocate address space in the command sector ahead.',
            'Our goal is to dismantle the system of exclusion while keeping the infrastructure ready for everyone to use.',
        ]],
        17: ['THE PUBLIC ROUTE', [
            'This routing grid is the last technical barrier to the command core. The occupiers gave themselves every route and left the rest of the planet disconnected.',
            'Use VLSM to give each branch enough host capacity. Allocate the largest demand first, choose aligned network addresses and prevent overlaps.',
            'Once every branch is valid, commit the route table at the core gateway. We are building the connections APEX refused to share.',
        ]],
        18: ['THE APEX CROWN', [
            'The command crown is in reach. Beneath us are the power rings, supply networks and service routes you fought to reconnect.',
            'Reach the final uplink. Break APEX\'s control of the facility and release the resources it has kept from the planet.',
            'End the hoarding system. Let the water, energy and essential supplies belong to everyone again.',
        ]],
    };
    const tutorialIntro = [
        ['Neural link established. I will guide you through this maintenance access beneath the APEX facility.',
            'The occupiers trust locked networks to keep our world\'s resources to themselves. Your subnetting knowledge is our way inside.'],
        ['First, calibrate your movement and camera. Then follow the route beacon to the service entrance.',
            'We will climb floor by floor, open the supply network and disable the APEX core\'s control over it.'],
        ['We are reclaiming working infrastructure, not destroying the services people need.',
            'When the monopoly ends, water, power and essential supplies can reach everyone again.'],
    ];
    const tutorialOutro = [[
        'Movement calibrated. You have reached the service entrance.',
        'The first floor\'s wire relays are ahead. Restore their connections, bring light back to the room and begin the climb toward APEX.',
    ]];
    const gameplayBriefings = {
        ip_class_wires: 'APEX cut this service grid off from the city. Match the IP classes to repair its wire relays; each completed wire quest restores part of the floor\'s light.',
        ip_class_wires_harder: 'APEX is re-keying the supply grid to keep us out. These adaptive wire relays still count toward the same floor\'s lighting, so we must finish both wire variants.',
        ip_patch_panel_classes: 'This classifier sends supply traffic into APEX\'s private channels. Learn to distinguish IP addresses from subnet masks and route each packet through the correct class.',
        ip_cidr_binary_panel: 'These mask locks separate the occupiers\' reserves from the public network. Rebuild the binary boundary and identify its CIDR prefix to open our next route.',
        ip_cidr_binary_panel_harder: 'APEX now replaces the boundary whenever a breach fails. Recalculate from the new mask; accuracy is what keeps our route into the reserves open.',
        ip_subnet_simulator: 'A route back to the people needs enough subnets and host capacity. Use the exact mask carried from the previous panel to prove this connection can support them.',
        ip_host_power_reactor: 'These engines reserve capacity for the occupiers. Calculate the smallest usable host allocation that meets demand, and stabilize a bypass for the network we will reclaim.',
        ip_cidr_quarantine: 'APEX\'s hostile segments protect the hoard. Re-segment the network with a fitting prefix and enough usable hosts, then secure a safe route through its defenses.',
        ip_cidr_quarantine_matrix: 'An APEX enforcer guards this part of the supply backbone. Recover the missing network or broadcast address to break its barriers and keep climbing toward the command core.',
        ip_network_repair: 'APEX corrupted these public-service PCs to keep the city disconnected. Recover their subnet formulas and address ranges so essential services can find a route home.',
        ip_vlsm_allocator: 'This grid decides who gets connected. Build valid, non-overlapping subnets for every branch, then commit a route table that can serve the people instead of the occupiers alone.',
    };
    const dialogues = {
        'tutorial.intro': { id: 'tutorial.intro', title: 'THE SERVICE ACCESS', speaker: 'NEURAL LINK', timing: 'after',
            bindings: { mapId: 1, trigger: 'worldTitle.finished' }, slides: tutorialIntro },
        'tutorial.outro': { id: 'tutorial.outro', title: 'THE FIRST BREACH', speaker: 'NEURAL LINK', timing: 'after',
            bindings: { mapId: 1, trigger: 'tutorial.completed' }, slides: tutorialOutro },
    };
    for (const [id, [title, lines]] of Object.entries(floors)) dialogues['stage.' + id + '.intro'] = {
        id: 'stage.' + id + '.intro', title, speaker: 'NEURAL LINK', timing: 'after',
        bindings: { mapId: Number(id), trigger: 'worldTitle.finished' }, slides: [lines.slice(0, 2), [lines[2]]],
    };
    IP2Live.StoryLore = {
        VERSION: 'apex-reclamation-20261013', dialogues,
        prologue: [
            { title: 'THE ARRIVAL', subtitle: 'NEO-GAIA / YEARS AGO', text: 'Once, the water, energy and harvests of Neo-Gaia sustained its people. Then ships arrived from another galaxy. The raiders took our world\'s abundance and called it their own.' },
            { title: 'THE TAKING', subtitle: 'A WORLD LEFT WAITING', text: 'The invaders locked food, medicine, water and power inside a vast facility. Beyond its walls, ordinary families were left with empty pipes and dark homes. What belonged to everyone became a privilege for the few.' },
            { title: 'THE FORTRESS', subtitle: 'GUARDED BY APEX', text: 'Their fortress rises above the city, guarded by the APEX artificial intelligence. Floor after floor, its subnet locks and security systems protect the hoard. At the top, a command core keeps the planet cut off.' },
            { title: 'OUR WAY INSIDE', subtitle: 'KNOWLEDGE BECOMES RESISTANCE', text: 'You know the networks they depend on. Infiltrate the facility, use subnetting to breach each floor, and break APEX\'s control at the final uplink. Reclaim the system so its resources can flow back to everyone.' },
        ],
        floorDialogue(mapId) { return dialogues['stage.' + Number(mapId) + '.intro'] || null; },
        contextualizeGameplay(dialogueId, definition, slides, context) {
            const gameplayId = definition.bindings?.gameplayId;
            const brief = gameplayBriefings[gameplayId], game = Core?.Game?.current;
            if (!brief || !game || !Array.isArray(slides[0]) || !/\.(intro|story_intro|carried)\.|\.guided\.welcome\.|\.tutorial\.opening$/.test(dialogueId) ||
                context?.tutorialReplay || context?.developerTest || context?.spec?.tutorialReplay || context?.spec?.developerTest ||
                context?.practiceMode || context?.pvpMode || context?.endlessMode || IP2Live.TutorialReplay?.session || IP2Live.PracticeMode?.active ||
                IP2Live.PVPMode?.active || IP2Live.EndlessMode?.active) return slides;
            if (!game.ip2liveGameStates) game.ip2liveGameStates = {};
            const seen = game.ip2liveGameStates.gameplayLoreSeen || (game.ip2liveGameStates.gameplayLoreSeen = {});
            if (seen[gameplayId]) return slides;
            seen[gameplayId] = true;
            // Keep slide indices intact: teaching spotlights are indexed by slide.
            slides[0] = [brief, '', ...slides[0].filter(line => !/^(Excellent work, Infiltrator\.|Welcome to the IP wires gameplay\.)$/.test(line))];
            return slides;
        },
    };
}());
