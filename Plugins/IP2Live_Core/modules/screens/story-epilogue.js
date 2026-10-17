/** Reuse Origins' foreground clock, text fitting, typing and transition rules. */
(function () {
    class StoryEpilogueScreen extends IP2Live.StoryPrologueScreen {
        constructor(owner) {
            super(() => { owner._finishCutscene(); return true; });
            this.owner=owner; this.art=IP2Live.EpilogueArt; this.channelLabel='IP2LIVE / EPILOGUE';
            this.beats=this.art.beats; this.characters=Array.from(this.beats[0].text);
        }
        _available() {
            return !this.loading && !this.closed && !this.owner.closed && Manager.Stack.top===this.owner &&
                !document.hidden && (!document.hasFocus || document.hasFocus());
        }
        _startAudio() {} // The owner keeps one epilogue score continuous across all four slides.
        _syncAudio() {}
        _stopMusic() {}
        close() {
            super.close(); this.owner=null;
        }
    }
    IP2Live.StoryEpilogueScreen=StoryEpilogueScreen;
}());
