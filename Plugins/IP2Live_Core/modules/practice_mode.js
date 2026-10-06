/** Persistent access to isolated, disposable networking practice sessions. */
(function () {
    const KEY = 'ip2live.practice.unlocks.v1';
    const entries = [
        ['ip_class_wires', '1', 'IP Class Wires', 'Connect each IP address to its network class.', 'wires'],
        ['ip_patch_panel_classes', '2', 'IP Patch Panel', 'Route moving packets to the correct class and mask.', 'patch'],
        ['ip_cidr_binary_panel', '3', 'CIDR Binary Panel', 'Build a subnet mask by configuring binary bits.', 'binary'],
        ['ip_subnet_simulator', '4', 'Subnet Simulator', 'Balance subnet counts and usable host capacity.', 'subnet'],
        ['ip_host_power_reactor', '4.5', 'Host-Power Reactor', 'Convert host bits into usable address capacity.', 'reactor'],
        ['ip_cidr_quarantine', '5', 'Network Re-Segmentation', 'Divide an allocated network, verify host capacity, and secure a safe route.', 'quarantine'],
        ['ip_cidr_quarantine_matrix', '6', 'Quarantine Matrix', 'Fit multiple network zones into one address space.', 'matrix'],
        ['ip_network_repair', '7', 'Network Repair', 'Repair network, broadcast and usable IP addresses.', 'repair'],
        ['ip_vlsm_allocator', '8', 'VLSM Infiltration Grid', 'Allocate variable-sized subnets without overlap.', 'vlsm'],
        ['ip_class_wires_harder', '1', 'Adaptive IP Wires', 'Reclassify connections as the network shifts.', 'wires', true],
        ['ip_cidr_binary_panel_harder', '3', 'Adaptive CIDR Panel', 'Rebuild masks against changing subnet targets.', 'binary', true],
    ].map(([id, number, name, description, icon, harder]) => ({ id, number, name, description, icon, harder: !!harder }));

    const PracticeMode = {
        entries, unlocks: {}, _loaded: false, active: false, returning: false,
        lockedMessage: 'Practice Mode will be unlocked once you encounter your first Networking Gameplay',

        _load() {
            if (this._loaded) return;
            this._loaded = true;
            try {
                const data = JSON.parse(localStorage.getItem(KEY) || '{}');
                for (const entry of entries) if (data[entry.id] === true) this.unlocks[entry.id] = true;
            } catch (error) { /* A storage failure must not prevent the menu from opening. */ }
        },
        isUnlocked(id) {
            this._load();
            return id ? this.unlocks[id] === true : entries.some(entry => this.unlocks[entry.id]);
        },
        unlock(gameplayId, announce = true) {
            this._load();
            const entry = entries.find(item => item.id === gameplayId);
            if (!entry || this.unlocks[gameplayId]) return false;
            const first = !this.isUnlocked();
            this.unlocks[gameplayId] = true;
            try { localStorage.setItem(KEY, JSON.stringify(this.unlocks)); }
            catch (error) { console.warn('[IP2Live] Practice unlock could not be persisted:', error); }
            if (announce && IP2Live.Achievements) {
                if (first) IP2Live.Achievements.show({ id: 'practice-mode', title: 'Practice Mode unlocked', description: 'Replay completed lessons from the main menu.' });
                IP2Live.Achievements.show({ id: 'practice-' + gameplayId,
                    title: 'Practice mode for Gameplay ' + entry.number + (entry.harder ? ' — Harder' : '') + ' unlocked',
                    description: entry.name + ' • Tutorial and Gameplay available' });
            }
            return true;
        },
        recordCompletion(gameplayId, payload) {
            const data = payload || {}, spec = data.spec || {};
            if (this.active || data.developerTest || spec.developerTest || data.tutorialReplay || spec.tutorialReplay) return false;
            const source = IP2Live.GameManager.getGameplayQuestSpecs(gameplayId).find(item =>
                item.id === (data.questId || spec.id) && (!data.objectiveId || item.objectiveId === data.objectiveId));
            if (!source || !(source.tutorial || source.harderIntro)) return false;
            return this.unlock(gameplayId);
        },
        syncFromCampaign() {
            if (this.active) return;
            const qm = IP2Live.QuestManager;
            if (!qm || !qm.completedObjectives) return;
            for (const entry of entries) {
                const completed = IP2Live.GameManager.getGameplayQuestSpecs(entry.id).some(spec =>
                    (spec.tutorial || spec.harderIntro) && qm.completedObjectives[spec.id] &&
                    qm.completedObjectives[spec.id][spec.objectiveId]);
                if (completed) this.unlock(entry.id, false);
            }
        },
        launch(gameplayId, kind, grid) {
            if (this.active || this.returning || !this.isUnlocked(gameplayId)) return false;
            this.active = true;
            this.grid = grid;
            this.kind = kind === 'tutorial' ? 'tutorial' : 'gameplay';
            this.gameplayId = gameplayId;
            this.round = 0;
            this.savedGame = Core.Game.current;
            this.savedManagerState = IP2Live.GameManager.state;
            // Practice is a menu scene, not an engine campaign. Leaving the engine
            // game unset prevents saves and avoids a partially initialized Game.
            // TutorialReplay owns and restores each manager's temporary puzzle data.
            Core.Game.current = null;
            if (IP2Live.QuestMinimap) IP2Live.QuestMinimap.destroy();
            return this._launchRound();
        },
        _launchRound() {
            if (!this.active || this.returning) return false;
            this.round++;
            const opened = IP2Live.TutorialReplay.launch(this.gameplayId, {
                practiceMode: true, practiceGameplay: this.kind === 'gameplay', round: this.round,
            });
            if (!opened) this.returnToGrid('This gameplay could not be opened. Please try again.');
            return opened;
        },
        configureScreen(screen) {
            if (!screen || !screen.options || !screen.options.practiceMode) return;
            screen.maxAttempts = Infinity;
            screen.enforceAttemptLimit = false;
            screen.options.maxAttempts = Infinity;
            screen.options.enforceAttemptLimit = false;
            if ('chances' in screen) screen.chances = Infinity;
            if ('maxChances' in screen) screen.maxChances = Infinity;
            screen._ip2liveSessionRestoreChecked = true;
        },
        onReplayFinished(outcome) {
            if (!this.active) return;
            if ((this.kind === 'gameplay' && outcome === 'completed') || outcome === 'failed') {
                // Defer until the previous completion callback has fully unwound.
                const grid = this.grid;
                Promise.resolve().then(() => {
                    if (this.active && !this.returning && this.grid === grid) this._launchRound();
                });
                return;
            }
            this.returnToGrid(outcome === 'unavailable' ? 'This gameplay is unavailable. Please try again.' : '');
        },
        finishFromPause(screen) {
            const replay = IP2Live.TutorialReplay, transition = IP2Live.MenuTransition;
            if (!this.active || this.returning || !replay.session || replay.session.screen !== screen ||
                !transition || typeof transition.launch !== 'function') return false;
            return transition.launch(() => {
                if (!replay.session || replay.session.screen !== screen) return false;
                if (Manager.Stack.top && Manager.Stack.top.sourceScreen === screen) Manager.Stack.pop();
                if (IP2Live.GameplayPause) IP2Live.GameplayPause.closeMenu();
                // Cleanup still runs through TutorialReplay; only the return animation changes.
                this._returnWithTV = true;
                try { return replay.finishScreen(screen); }
                finally { this._returnWithTV = false; }
            });
        },
        returnToGrid(message) {
            if (!this.active || this.returning) return false;
            this.returning = true;
            Core.Game.current = this.savedGame;
            IP2Live.GameManager.state = this.savedManagerState;
            this.savedGame = null;
            if (IP2Live.QuestMinimap) IP2Live.QuestMinimap.destroy();
            const music = IP2Live.MusicManager;
            if (music && music.ZONE) music.play(music.ZONE.MAIN_MENU);
            if (this.grid) this.grid.notice = message || '';
            const done = (loading) => {
                if (loading && Manager.Stack.top === loading) Manager.Stack.pop();
                this.active = false;
                this.returning = false;
                Manager.Stack.requestPaintHUD = true;
            };
            if (this._returnWithTV) done();
            else if (IP2Live.LoadingScreen) IP2Live.LoadingScreen.show({
                mode: 'push', status: 'Returning to Practice', detail: 'Choose your next exercise', onComplete: done,
            });
            else done();
            return true;
        },
    };
    IP2Live.PracticeMode = PracticeMode;
})();
