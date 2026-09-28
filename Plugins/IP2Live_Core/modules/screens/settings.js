/** Shared popup styling; volume and keyboard preferences remain persistent. */
class IP2LiveSettingsMenu extends Scene.Base {
    constructor() {
        super(true);
        this.backdrop = IP2Live.PopupChrome.capture();
    }

    initialize() {
        /*
         * BACK is no longer part of this array.
         * It is a separate footer button; Escape also goes back.
         */
        this.menuItems = [
            'KEY BINDINGS',
            'SFX VOLUME',
            'MUSIC VOLUME',
            'LANGUAGE [EN]',
        ];

        this.selectedIndex =
            0;

        this.hoverIndex =
            -1;

        this.hoverBack =
            false;

        this.backButtonRect =
            null;

        this.animTick =
            0;

        this.scanlineOffset =
            0;

        this.adjustingVolumeType =
            null;

        this.sfxVolume =
            this._readSfxVolumePercent();

        this.musicVolume =
            this._readMusicVolumePercent();

        this._applySfxVolumeSetting();

        this._applyMusicVolumeSetting();

        this.bgFx =
            IP2Live.BgFx.create();

        this.buttonRects =
            [];

        this.volumeHitTargets =
            [];

        this.fadeIn =
            0;
    }

    async load() {
        if (
            !IP2Live.Assets.bgImage ||
            !IP2Live.Assets.oxaniumMediumLoaded
        ) {
            await IP2Live.Assets.loadAll();
        }

        const cW =
            Common.Platform.ctx.canvas.width;

        const cH =
            Common.Platform.ctx.canvas.height;

        this.bgFx.seed(
            cW,
            cH
        );

        this.loading =
            false;

        Manager.Stack.requestPaintHUD =
            true;
    }

    onKeyPressed(key) {
        /*
         * While volume adjustment mode is active,
         * Enter or Esc closes adjustment mode.
         */
        if (
            this.adjustingVolumeType
        ) {
            if (
                Data.Keyboards.checkActionMenu(
                    key
                ) ||
                Data.Keyboards.checkCancelMenu(
                    key
                )
            ) {
                this.adjustingVolumeType =
                    null;

                try {
                    Data.Systems.soundConfirmation.playSound();
                } catch (error) {}

                Manager.Stack.requestPaintHUD =
                    true;
            }

            return true;
        }

        if (
            Data.Keyboards.checkActionMenu(
                key
            )
        ) {
            this._confirmSelection();

            return true;
        }

        /*
         * ESC still behaves as Back.
         */
        if (
            Data.Keyboards.checkCancelMenu(
                key
            )
        ) {
            this._resume();

            return true;
        }

        return true;
    }

    onKeyPressedAndRepeat(key) {
        /*
         * Volume adjustment.
         */
        if (
            this.adjustingVolumeType
        ) {
            const isLeft =
                (
                    Data.Keyboards.menuControls &&
                    Data.Keyboards.menuControls.Left
                )
                    ? Data.Keyboards.isKeyEqual(
                        key,
                        Data.Keyboards.menuControls.Left
                    )
                    : (
                        key === 37 ||
                        key === 65
                    );

            const isRight =
                (
                    Data.Keyboards.menuControls &&
                    Data.Keyboards.menuControls.Right
                )
                    ? Data.Keyboards.isKeyEqual(
                        key,
                        Data.Keyboards.menuControls.Right
                    )
                    : (
                        key === 39 ||
                        key === 68
                    );

            if (
                isLeft
            ) {
                this._nudgeVolume(
                    this.adjustingVolumeType,
                    -10
                );
            } else if (
                isRight
            ) {
                this._nudgeVolume(
                    this.adjustingVolumeType,
                    10
                );
            }

            return true;
        }

        /*
         * Main menu navigation.
         */
        const prev =
            this.selectedIndex;

        if (
            Data.Keyboards.isKeyEqual(
                key,
                Data.Keyboards.menuControls.Up
            )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex -
                    1 +
                    this.menuItems.length
                ) %
                this.menuItems.length;
        } else if (
            Data.Keyboards.isKeyEqual(
                key,
                Data.Keyboards.menuControls.Down
            )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex +
                    1
                ) %
                this.menuItems.length;
        }

        if (
            this.selectedIndex !==
            prev
        ) {
            this.hoverIndex =
                -1;

            this.hoverBack =
                false;

            try {
                Data.Systems.soundCursor.playSound();
            } catch (error) {}

            Manager.Stack.requestPaintHUD =
                true;
        }

        return true;
    }

    onMouseMove(
        x,
        y
    ) {
        /*
         * Top-left Back icon.
         */
        const overBack =
            this._isBackButtonAt(
                x,
                y
            );

        if (
            overBack !==
            this.hoverBack
        ) {
            this.hoverBack =
                overBack;

            if (
                overBack
            ) {
                this.hoverIndex =
                    -1;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            Manager.Stack.requestPaintHUD =
                true;
        }

        if (
            overBack
        ) {
            return true;
        }

        const newHover =
            this._getButtonAt(
                x,
                y
            );

        if (
            newHover !==
            this.hoverIndex
        ) {
            this.hoverIndex =
                newHover;

            if (
                newHover >= 0 &&
                newHover !==
                    this.selectedIndex
            ) {
                this.selectedIndex =
                    newHover;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            Manager.Stack.requestPaintHUD =
                true;
        }

        return true;
    }

    onMouseUp(
        x,
        y
    ) {
        /*
         * Upper-left Back icon.
         */
        if (
            this._isBackButtonAt(
                x,
                y
            )
        ) {
            this._resume();

            return true;
        }

        /*
         * Volume interaction takes priority.
         */
        const volumeHit =
            this._getVolumeHitAt(
                x,
                y
            );

        if (
            volumeHit
        ) {
            this.selectedIndex =
                volumeHit.index;

            this.adjustingVolumeType =
                volumeHit.type;

            if (
                volumeHit.action ===
                'decrease'
            ) {
                this._nudgeVolume(
                    volumeHit.type,
                    -10
                );
            } else if (
                volumeHit.action ===
                'increase'
            ) {
                this._nudgeVolume(
                    volumeHit.type,
                    10
                );
            } else if (
                volumeHit.action ===
                'bar'
            ) {
                const pct =
                    (
                        (
                            x -
                            volumeHit.x
                        ) /
                        volumeHit.w
                    ) *
                    100;

                this._setVolumePercent(
                    volumeHit.type,

                    Math.round(
                        pct /
                        5
                    ) *
                    5
                );

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}

                Manager.Stack.requestPaintHUD =
                    true;
            }

            return true;
        }

        /*
         * Regular Settings rows.
         */
        const idx =
            this._getButtonAt(
                x,
                y
            );

        if (
            idx >= 0
        ) {
            if (
                idx !==
                this.selectedIndex
            ) {
                this.selectedIndex =
                    idx;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            this._confirmSelection();
        }

        return true;
    }

    _isBackButtonAt(
        x,
        y
    ) {
        const r =
            this.backButtonRect;

        return !!(
            r &&
            x >= r.x &&
            x <= r.x + r.w &&
            y >= r.y &&
            y <= r.y + r.h
        );
    }

    _getButtonAt(
        x,
        y
    ) {
        for (
            let i = 0;
            i < this.buttonRects.length;
            i++
        ) {
            const r =
                this.buttonRects[i];

            if (
                x >= r.x &&
                x <= r.x + r.w &&
                y >= r.y &&
                y <= r.y + r.h
            ) {
                return i;
            }
        }

        return -1;
    }

    _getVolumeHitAt(
        x,
        y
    ) {
        for (
            let i = 0;
            i < this.volumeHitTargets.length;
            i++
        ) {
            const r =
                this.volumeHitTargets[i];

            if (
                x >= r.x &&
                x <= r.x + r.w &&
                y >= r.y &&
                y <= r.y + r.h
            ) {
                return r;
            }
        }

        return null;
    }

    _confirmSelection() {
        const volumeType =
            this._volumeTypeForIndex(
                this.selectedIndex
            );

        /*
         * Enter on volume row toggles adjustment mode.
         */
        if (
            volumeType
        ) {
            if (
                !this.adjustingVolumeType
            ) {
                this.adjustingVolumeType =
                    volumeType;
            } else {
                this.adjustingVolumeType =
                    null;
            }

            try {
                Data.Systems.soundConfirmation.playSound();
            } catch (error) {}

            Manager.Stack.requestPaintHUD =
                true;

            return;
        }

        /*
         * Language currently informational only.
         */
        if (
            this.selectedIndex ===
            3
        ) {
            try {
                if (
                    Data.Systems.soundImpossible
                ) {
                    Data.Systems.soundImpossible.playSound();
                } else {
                    Data.Systems.soundCancel.playSound();
                }
            } catch (error) {}

            return;
        }

        try {
            Data.Systems.soundConfirmation.playSound();
        } catch (error) {}

        this._executeAction(
            this.selectedIndex
        );
    }

    _resume() {
        try {
            Data.Systems.soundCancel.playSound();
        } catch (error) {}

        if (IP2Live.MenuTransition) IP2Live.MenuTransition.back();
        else Manager.Stack.pop();
    }

    _executeAction(idx) {
        /*
         * Key Bindings.
         */
        if (
            idx === 0
        ) {
            /*
             * Apply the modern skin in case the
             * keyboard module loaded after settings.js.
             */
            if (
                IP2Live._modernizeKeyboardMenuUI
            ) {
                IP2Live._modernizeKeyboardMenuUI();
            }

            const KeyboardMenuClass =
                window.IP2LiveKeyboardMenu;

            if (
                KeyboardMenuClass
            ) {
                Manager.Stack.push(
                    new KeyboardMenuClass()
                );
            }
        }
    }

    _volumeTypeForIndex(index) {
        if (
            index === 1
        ) {
            return 'sfx';
        }

        if (
            index === 2
        ) {
            return 'music';
        }

        return null;
    }

    _volumeForType(type) {
        return type === 'music'
            ? this.musicVolume
            : this.sfxVolume;
    }

    _readSfxVolumePercent() {
        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.sfxVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.sfxVolume
                    )
                ) *
                100
            );
        }

        if (
            IP2Live.SoundFX &&
            typeof IP2Live.SoundFX.getMasterVolume ===
                'function'
        ) {
            return Math.round(
                IP2Live.SoundFX.getMasterVolume() *
                100
            );
        }

        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.masterVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.masterVolume
                    )
                ) *
                100
            );
        }

        return 100;
    }

    _readMusicVolumePercent() {
        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.musicVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.musicVolume
                    )
                ) *
                100
            );
        }

        if (
            typeof IP2Live !==
                'undefined' &&
            typeof IP2Live.masterVolume ===
                'number'
        ) {
            return Math.round(
                Math.max(
                    0,
                    Math.min(
                        1,
                        IP2Live.masterVolume
                    )
                ) *
                100
            );
        }

        if (
            IP2Live.MusicManager &&
            typeof IP2Live.MusicManager.getVolume ===
                'function'
        ) {
            return Math.round(
                IP2Live.MusicManager.getVolume() *
                100
            );
        }

        return 100;
    }

    _nudgeVolume(
        type,
        amount
    ) {
        this._setVolumePercent(
            type,

            this._volumeForType(
                type
            ) +
            amount
        );

        try {
            Data.Systems.soundCursor.playSound();
        } catch (error) {}

        Manager.Stack.requestPaintHUD =
            true;
    }

    _setVolumePercent(
        type,
        value
    ) {
        const next =
            Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        value
                    )
                )
            );

        if (
            type === 'music'
        ) {
            this.musicVolume =
                next;

            this._applyMusicVolumeSetting();

            this._saveAudioSettings();

            return;
        }

        this.sfxVolume =
            next;

        this._applySfxVolumeSetting();

        this._saveAudioSettings();
    }

    _applySfxVolumeSetting() {
        const volume =
            this.sfxVolume /
            100;

        IP2Live.sfxVolume =
            volume;

        if (
            IP2Live.SoundFX &&
            typeof IP2Live.SoundFX.setMasterVolume ===
                'function'
        ) {
            IP2Live.SoundFX.setMasterVolume(
                volume
            );
        }
    }

    _applyMusicVolumeSetting() {
        const volume =
            this.musicVolume /
            100;

        IP2Live.musicVolume =
            volume;

        if (
            IP2Live.MusicManager &&
            typeof IP2Live.MusicManager.setVolume ===
                'function'
        ) {
            IP2Live.MusicManager.setVolume(
                volume
            );
        }
    }

    _saveAudioSettings() {
        try {
            if (
                typeof localStorage ===
                'undefined'
            ) {
                return false;
            }

            localStorage.setItem(
                'IP2Live.audio-settings.v1',

                JSON.stringify({
                    musicVolume:
                        this.musicVolume /
                        100,

                    sfxVolume:
                        this.sfxVolume /
                        100,
                })
            );

            return true;
        } catch (error) {
            console.warn(
                '[IP2Live] Audio settings could not be saved:',
                error
            );

            return false;
        }
    }

    update() {
        this.animTick++;

        this.scanlineOffset =
            (
                this.scanlineOffset +
                0.5
            ) %
            4;

        this.fadeIn =
            Math.min(
                1,
                this.fadeIn +
                0.07
            );

        if (
            this.bgFx &&
            typeof this.bgFx.update ===
                'function'
        ) {
            this.bgFx.update(
                this.animTick
            );
        }

        if (
            this.animTick %
                2 ===
                0 ||
            this.fadeIn <
                1
        ) {
            Manager.Stack.requestPaintHUD =
                true;
        }
    }

    draw3D() {
        Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx=Common.Platform.ctx, c=ctx.canvas, scale=Math.min(c.width/1280,c.height/720), chrome=IP2Live.PopupChrome;
        const w=580,h=390,x=(c.width/scale-w)/2,y=(c.height/scale-h)/2;
        ctx.save(); chrome.backdrop(ctx,this.backdrop,this.animTick*0.085); ctx.scale(scale,scale);
        chrome.animate(ctx,{x,y,w,h},this.animTick*0.085);
        chrome.panel(ctx,x,y,w,h,1,1,false,this.animTick); chrome.heading(ctx,'SETTINGS',x,y,w);
        this.buttonRects=[]; this.volumeHitTargets=[];
        ['KEY BINDINGS','SFX VOLUME','MUSIC VOLUME','LANGUAGE [EN]'].forEach((label,i)=>{
            const r={x:x+30,y:y+76+i*60,w:w-60,h:50}, active=this.selectedIndex===i;
            this.buttonRects.push({x:r.x*scale,y:r.y*scale,w:r.w*scale,h:r.h*scale});
            chrome.row(ctx,r.x,r.y,r.w,r.h,active && i!==3);
            ctx.textAlign='left';ctx.font='bold 15px Oxanium-Medium, sans-serif';ctx.fillStyle=i===3?'#687d86':'#e0edef';ctx.fillText(label,r.x+16,r.y+30);
            if(i===0){ctx.textAlign='right';ctx.fillStyle='#83b9c1';ctx.fillText('>',r.x+r.w-20,r.y+30);}
            if(i===1||i===2){
                const type=i===1?'sfx':'music', value=i===1?this.sfxVolume:this.musicVolume;
                const bx=r.x+240,by=r.y+14,bw=150;
                ctx.fillStyle='#162831';ctx.fillRect(bx,by,bw,22);ctx.fillStyle=active?'#d5c878':'#69aab3';ctx.fillRect(bx+3,by+3,(bw-6)*value/100,16);
                ctx.font='14px Oxanium-Medium, sans-serif';ctx.fillStyle='#d4e3e6';ctx.textAlign='center';ctx.fillText('-',bx-18,by+16);ctx.fillText('+',bx+bw+18,by+16);ctx.textAlign='right';ctx.fillText(value+'%',r.x+r.w-12,by+16);
                [{action:'decrease',x:bx-32,w:28},{action:'bar',x:bx,w:bw},{action:'increase',x:bx+bw+4,w:28}].forEach(t=>this.volumeHitTargets.push({index:i,type,action:t.action,x:t.x*scale,y:(by-5)*scale,w:t.w*scale,h:32*scale}));
            }
        });
        const back={x:x+w/2-90,y:y+h-57,w:180,h:36};this.backButtonRect={x:back.x*scale,y:back.y*scale,w:back.w*scale,h:back.h*scale};
        chrome.button(ctx,back,1,1,'BACK','Oxanium-Medium',this.hoverBack?1:0,this.animTick,true);ctx.restore();
    }

}


/*
 * Expose Settings class.
 */
window.IP2LiveSettingsMenu =
    IP2LiveSettingsMenu;


/* =========================================================
 * MODERN KEY BINDINGS SKIN
 * =========================================================
 *
 * This wraps the project's existing IP2LiveKeyboardMenu.
 * It does NOT replace the original rebinding logic.
 */

function IP2LiveModernizeKeyboardMenuUI() { return !!window.IP2LiveKeyboardMenu; }
IP2Live._modernizeKeyboardMenuUI = IP2LiveModernizeKeyboardMenuUI;
