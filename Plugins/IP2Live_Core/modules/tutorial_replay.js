/** Owns isolated tutorial instances without changing campaign progress. */
class IP2LiveTutorialReplay {
    constructor() { this.session = null; this._serial = 0; }

    launch(gameplayId, context) {
        const gm = IP2Live.GameManager;
        const node = gm.flowConfig.gameplayNodes[gameplayId];
        const owner = node && IP2Live[node.manager];
        const qm = IP2Live.QuestManager;
        if (!owner || typeof owner[node.method] !== 'function' || !qm || this.session || gm._activeGameplayNode) return false;
        if (IP2Live.NeuralLifeForce && IP2Live.NeuralLifeForce.isRunOver()) return false;
        const source = gm.getGameplayQuestSpecs(gameplayId).find((entry) => entry.tutorial || entry.harderIntro);
        if (!source || !Manager || !Manager.Stack || typeof Manager.Stack.push !== 'function') return false;

        const spec = gm._clonePlain(source);
        const mapId = gm._currentMapId();
        const token = 'neural.tutorial_replay.' + gameplayId + '.' + Date.now() + '.' + (++this._serial);
        spec.tutorialReplay = true;
        spec.tutorial = true;
        spec.tutorialSource = { mapId: source.mapId, questId: source.id, objectiveId: source.dialogueObjectiveId || source.objectiveId };
        spec.id = token;
        spec.mapId = mapId;
        // A synthetic quest identity keeps replay sessions separate from campaign saves.
        const options = Object.assign({}, spec, {
            spec, tutorialReplay: true, mapId, questId: token, objectiveId: source.objectiveId,
            tutorialMode: true, guidedTutorial: true, tutorialFeedback: true,
            showIntro: false, useLoading: false, mode: 'push', _fromGameManager: true,
        });
        const savedOwnerState = {};
        for (const key of ['_state', '_introShown', '_introShownMaps', '_tutorialShownKeys', '_triggerLocks']) {
            if (Object.prototype.hasOwnProperty.call(owner, key)) savedOwnerState[key] = gm._clonePlain(owner[key]);
        }
        const music = IP2Live.MusicManager;
        this.session = {
            gameplayId, options, owner, savedOwnerState, screen: null,
            cidrState: gm._clonePlain(IP2Live.CIDRGameplayState),
            hadCidrState: Object.prototype.hasOwnProperty.call(IP2Live, 'CIDRGameplayState'),
            musicZone: music && typeof music._resolveStageZoneFromMap === 'function'
                ? music._resolveStageZoneFromMap()
                : (music && typeof music.currentZone === 'function' ? music.currentZone() : null),
            returnQuestId: qm.activeQuestId, returnObjectiveId: qm.activeObjectiveId,
        };
        if ('_state' in savedOwnerState) owner._state = null;
        if ('_introShown' in savedOwnerState) owner._introShown = false;
        if ('_introShownMaps' in savedOwnerState) owner._introShownMaps = {};
        if ('_tutorialShownKeys' in savedOwnerState) owner._tutorialShownKeys = {};
        if (owner._musicRestoreTimer) {
            clearTimeout(owner._musicRestoreTimer);
            owner._musicRestoreTimer = null;
        }
        gm._activeGameplayNode = token;
        const open = () => {
            if (!this.session || this.session.options !== options) return;
            gm._setState(gm.STATE.GAMEPLAY_ACTIVE, options);
            try {
                if (owner[node.method](options) === false) this.finish(gameplayId, options, 'unavailable');
            } catch (error) {
                this.finish(gameplayId, options, 'unavailable');
            }
        };
        gm._logTelemetryEvent('neural_tutorial_replay', {
            gameplayId, mapId, questId: qm.activeQuestId, objectiveId: qm.activeObjectiveId,
            payload: { action: 'started', tutorialQuestId: source.id },
        });
        // Replays open the puzzle directly; campaign pre-dialogues are never queued.
        open();
        return true;
    }

    prepareScreen(screen, options) {
        if (!options || !options.tutorialReplay) return false;
        const replay = this.session;
        if (!replay || replay.options !== options) return false;
        screen.options = Object.assign({}, screen.options, {
            tutorialReplay: true, spec: options.spec, gameplayId: replay.gameplayId,
            questId: options.questId, objectiveId: options.objectiveId, mapId: options.mapId,
        });
        replay.screen = screen;
        return true;
    }

    finish(gameplayId, options, outcome, result) {
        const gm = IP2Live.GameManager;
        const opts = options || {};
        if (!(opts.tutorialReplay || (opts.spec && opts.spec.tutorialReplay))) return false;
        const replay = this.session;
        // Consume duplicate or stale replay callbacks without touching the campaign.
        if (!replay || replay.gameplayId !== gameplayId || replay.options.spec.id !== (opts.questId || (opts.spec && opts.spec.id))) return true;
        this.session = null;
        gm._activeGameplayNode = null;
        const dialogue = IP2Live.DialogueManager;
        if (dialogue && typeof dialogue.resetTransitionState === 'function') {
            dialogue.resetTransitionState({ stopActive: true, discardActive: true });
        } else if (dialogue && typeof dialogue.discardActive === 'function') dialogue.discardActive();
        if (replay.screen) {
            replay.screen._ip2liveGameplayExited = true;
            if (Manager && Manager.Stack && Manager.Stack.top === replay.screen) Manager.Stack.pop();
        }
        replay.owner._active = false;
        replay.owner._activeAttempt = null;
        Object.assign(replay.owner, replay.savedOwnerState);
        if (replay.hadCidrState) IP2Live.CIDRGameplayState = replay.cidrState;
        else delete IP2Live.CIDRGameplayState;
        if (IP2Live.GameplayPause && typeof IP2Live.GameplayPause.clearSession === 'function') IP2Live.GameplayPause.clearSession(gameplayId, replay.options);
        if (IP2Live.GameplayPause && IP2Live.GameplayPause.activeScreen === replay.screen) IP2Live.GameplayPause.activeScreen = null;
        const music = IP2Live.MusicManager;
        if (music && replay.musicZone && typeof music.play === 'function') music.play(replay.musicZone);
        gm._setState(gm.STATE.NEXT_NODE, { gameplayId, tutorialReplay: true, outcome });
        gm._logTelemetryEvent('neural_tutorial_replay', {
            gameplayId, mapId: replay.options.mapId, questId: replay.returnQuestId, objectiveId: replay.returnObjectiveId,
            payload: { action: outcome, tutorialQuestId: replay.options.spec.tutorialSource.questId },
        });
        gm._ensureQuestMinimap();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        if ((outcome === 'failed' || outcome === 'unavailable') && IP2Live.ARDiagnosticRewind) {
            IP2Live.ARDiagnosticRewind.show({
                title: outcome === 'failed' ? 'PRACTICE AGAIN?' : 'TUTORIAL UNAVAILABLE',
                lines: [outcome === 'failed' ? 'This was practice. Your HP and quest progress are unchanged. Review the tutorial again, or continue to your quest.' : 'The tutorial could not be opened. Your current quest is ready to retry.'],
                actions: outcome === 'failed' ? [
                    { id: 'tutorial', label: 'Retry Tutorial', onSelect: () => this.launch(gameplayId) },
                    { id: 'continue', label: 'Continue' },
                ] : undefined,
            });
        }
        return true;
    }


    finishScreen(screen) {
        const replay = this.session;
        if (!replay || replay.screen !== screen) return false;
        return this.finish(replay.gameplayId, replay.options, 'finished');
    }
}
IP2Live.TutorialReplay = new IP2LiveTutorialReplay();
window.IP2LiveTutorialReplay = IP2LiveTutorialReplay;
