/** DOM HUD + a scene-owned, keyboard accessible Story mistake-review sidebar. */
(function () {
    'use strict';
    const styleId = 'ip2-error-diagnostic-styles';
    const icon = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 5h12l9 9v12l-9 9H14l-9-9V14z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M14 14h12v12H14zM10 17h4m-4 6h4m12-6h4m-4 6h4M17 10v4m6-4v4m-6 12v4m6-4v4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20 17v5m0 2v1" stroke="#fff0d9" stroke-width="2"/></svg>';
    const pinIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1 6 4 4v2H5v-2l4-4zM12 15v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function rich(node, text) {
        for (const part of String(text || '').split(/(\*\*.*?\*\*)/g)) {
            if (!part) continue;
            node.appendChild(part.startsWith('**') ? el('strong', '', part.slice(2, -2)) : document.createTextNode(part));
        }
    }
    function stop(event) { event.stopPropagation(); }
    function reduced() { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function styles() {
        if (document.getElementById(styleId)) return;
        const node = el('style'); node.id = styleId;
        node.textContent = `
.ip2-error-hud,.ip2-diag-overlay {font-family:'Oxanium-Medium',Oxanium,sans-serif;color:#e8f3f6;box-sizing:border-box}
.ip2-error-hud *, .ip2-diag-overlay * {box-sizing:border-box;font-family:inherit}
.ip2-error-hud {position:fixed;height:64px;z-index:2147483001;pointer-events:none}
.ip2-error-caption {position:absolute;right:76px;top:14px;text-align:right;font-size:10px;letter-spacing:1.1px;color:#91acb7;line-height:1.7}
.ip2-error-caption strong {display:block;color:#e9c67c;font-size:11px;letter-spacing:.7px}
.ip2-error-trigger {position:absolute;right:0;top:0;width:60px;height:60px;border:1px solid #a9814b;border-radius:20px;color:#ffd28a;cursor:pointer;pointer-events:auto;background:repeating-linear-gradient(0deg,#e9bb5705 0 1px,transparent 1px 4px),radial-gradient(ellipse at 30% 0,#77604265,transparent 70%),linear-gradient(140deg,#252b34,#111923 65%,#0a1018);box-shadow:inset 0 0 0 4px #080f1880,inset 0 1px 0 #f9df9b50,0 6px 22px #0008;transition:background .2s,box-shadow .2s}
.ip2-error-trigger:before {content:'';position:absolute;inset:6px;border:1px solid #c69b5250;border-radius:15px;pointer-events:none}
.ip2-error-trigger:hover {box-shadow:inset 0 0 0 4px #080f1880,0 0 20px #e9b34f35}
.ip2-error-trigger svg {width:37px;height:37px;display:block;margin:auto;filter:drop-shadow(0 0 6px #ffd28a35)}
.ip2-error-badge {position:absolute;right:-5px;top:-6px;min-width:24px;height:24px;padding:0 5px;border-radius:9px;border:2px solid #0c1721;background:#ff596f;color:#fff7ef;font-size:12px;display:grid;place-items:center;box-shadow:0 0 14px #ff3d5d40}
.ip2-error-badge.is-zero {background:#233e48;color:#94bbc6;box-shadow:none}
.ip2-error-toast-window {position:absolute;right:69px;top:3px;width:min(265px,calc(100vw - 108px));height:56px;overflow:hidden;pointer-events:none}
.ip2-error-toast {height:100%;padding:10px 17px;background:repeating-linear-gradient(110deg,#ffcb7808 0 1px,transparent 1px 8px),linear-gradient(100deg,#152735ee,#242820f8);border-left:2px solid #ffd28a;clip-path:polygon(8px 0,100% 0,100% 100%,0 100%,0 8px);transform:translateX(110%);opacity:0}
.ip2-error-toast strong {display:block;font-size:12px;letter-spacing:1px;color:#ffe3ab}.ip2-error-toast span {display:block;font-size:10px;color:#aec2cb;margin-top:4px}
@keyframes ip2-diagnostic-toast {0%,100%{transform:translateX(110%);opacity:0}14%,78%{transform:translateX(0);opacity:1}}
.ip2-diag-overlay {position:fixed;inset:0;z-index:2147483010;font-size:14px}
.ip2-diag-scrim {position:absolute;inset:0;background:linear-gradient(90deg,#020b1225,#020811b0);backdrop-filter:blur(3px)}
.ip2-diag-shell {position:absolute;right:20px;top:20px;bottom:20px;width:min(900px,calc(100vw - 40px));display:flex;flex-direction:column;background:repeating-linear-gradient(0deg,#b0d6e803 0 1px,transparent 1px 5px),linear-gradient(140deg,#152532,#0c1621 48%,#101c28);border:1px solid #65879180;border-top:2px solid #eac77d;box-shadow:-24px 0 80px #0009,inset 0 0 55px #0003;clip-path:polygon(16px 0,calc(100% - 32px) 0,100% 32px,100% 100%,18px 100%,0 calc(100% - 18px),0 16px);animation:ip2-diagnostic-enter .24s ease-out}
@keyframes ip2-diagnostic-enter {from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
.ip2-diag-shell:before {content:'';position:absolute;pointer-events:none;right:4px;top:100px;bottom:24px;width:3px;background:repeating-linear-gradient(0deg,#6f8b9660 0 3px,transparent 3px 12px)}
.ip2-diag-header {display:flex;align-items:center;gap:13px;padding:20px 26px 18px;border-bottom:1px solid #66849145;background:linear-gradient(105deg,#d6ad5d13,transparent 65%);flex:none}
.ip2-diag-emblem {width:47px;height:47px;color:#edca84;flex:none;position:relative}.ip2-diag-emblem svg {width:100%;height:100%}
.ip2-diag-eyebrow {font-size:10px;color:#d8ba7e;letter-spacing:1.5px;margin:0 0 6px}.ip2-diag-title {font-size:23px;letter-spacing:.2px;margin:0;font-weight:600;line-height:1.15}.ip2-diag-subtitle {font-size:12px;color:#9db6c3;line-height:1.45;margin:6px 0 0}
.ip2-diag-close {margin-left:auto;align-self:flex-start;min-width:38px;height:38px;flex:none;border:1px solid #7293a350;border-radius:10px;background:#0b151e;color:#bcd2dd;font-size:23px;cursor:pointer}
.ip2-diag-split {display:grid;grid-template-columns:minmax(230px,31%) minmax(0,1fr);flex:1;min-height:0}
.ip2-diag-list-pane {display:flex;flex-direction:column;min-height:0;border-right:1px solid #57758345;background:#07131d50}
.ip2-diag-list-heading {padding:14px 18px 12px;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#a9bfca;letter-spacing:1.2px;border-bottom:1px solid #57758330}
.ip2-diag-count {padding:4px 7px;color:#f0ca82;background:#d2a14812;border:1px solid #c9a96740;border-radius:5px;letter-spacing:0;font-size:11px}
.ip2-diag-list {overflow:auto;padding:12px;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#466773 #0b1620}
.ip2-diag-row {position:relative;display:block;width:100%;text-align:left;margin:0 0 8px;padding:12px 14px 12px 16px;border:0;border-left:2px solid #718b95;background:repeating-linear-gradient(120deg,#b7d4df03 0 1px,transparent 1px 8px),linear-gradient(110deg,#192a35,#111f2b);color:#e0edf3;cursor:pointer;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,5px 100%,0 calc(100% - 5px));box-shadow:inset 0 1px 0 #bdd2dc15}
.ip2-diag-row:after {content:'';position:absolute;right:10px;bottom:12px;width:12px;height:3px;background:repeating-linear-gradient(90deg,#cbb98e70 0 2px,transparent 2px 4px)}
.ip2-diag-row:hover,.ip2-diag-row[aria-pressed=true] {background:linear-gradient(110deg,#31413d,#1a2b35);border-left-color:#f1cf8a;box-shadow:inset 0 1px 0 #eed19440}
.ip2-diag-row-game {display:block;color:#c8b88e;text-transform:uppercase;font-size:10px;letter-spacing:.6px;line-height:1.3}
.ip2-diag-row-top {display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px}
.ip2-diag-row-title {display:block;font-size:14px;line-height:1.3;font-weight:600;padding-right:4px;overflow-wrap:anywhere}
.ip2-diag-row-meta {display:block;color:#91aab8;font-size:10px;line-height:1.35}
.ip2-diag-row-foot {display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:9px;flex-wrap:wrap}
.ip2-diag-row-summary {display:block;margin-top:6px;color:#9ccdcf;font-size:11px;line-height:1.3}
.ip2-diag-repeat {font-size:9px;line-height:1.4;color:#9dd8ce;background:#64c7b80b;padding:2px 5px;border-radius:3px;white-space:nowrap}
.ip2-diag-pinned-mark {display:flex;align-items:center;color:#f0cf8c;font-size:9px;letter-spacing:.4px;gap:3px;white-space:nowrap}.ip2-diag-pinned-mark svg{width:13px;height:13px}
.ip2-diag-group-label {display:flex;align-items:center;justify-content:space-between;padding:5px 4px 9px;color:#839eac;font-size:9px;letter-spacing:1.4px}
.ip2-diag-group-label.is-pinned {color:#dfc18a}.ip2-diag-group-label:not(:first-child){padding-top:13px}
.ip2-diag-list-policy {padding:11px 17px 13px;margin:0;color:#8da7b5;font-size:10px;line-height:1.45;border-top:1px solid #57758330}
.ip2-diag-detail {min-height:0;display:flex;flex-direction:column;overflow:hidden;position:relative}
.ip2-diag-detail-scroll {padding:20px 26px;overflow:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#466773 #0b1620}
.ip2-diag-back {display:none;margin:0 0 18px;color:#c7dbe6;background:#17303c;border:1px solid #52778260;padding:9px 12px;border-radius:6px;cursor:pointer;font-size:12px}
.ip2-diag-detail h2 {font-size:22px;font-weight:600;margin:8px 0 11px;line-height:1.25;overflow-wrap:anywhere}
.ip2-diag-detail h3 {margin:0 0 8px;font-size:10px;color:#93b9c9;letter-spacing:1.4px;text-transform:uppercase}
.ip2-diag-detail p {line-height:1.55;color:#bfd1dc;font-size:14px;margin:0;overflow-wrap:anywhere}
.ip2-diag-detail-tools {display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px;flex-wrap:wrap}
.ip2-diag-observations {font-size:10px;color:#8daeba;letter-spacing:.3px}
.ip2-diag-pin {display:flex;align-items:center;gap:6px;border:1px solid #9b86564a;border-radius:5px;background:#d7bd7208;color:#c6baa0;padding:6px 9px;font-size:11px;line-height:1.25;cursor:pointer}.ip2-diag-pin svg{width:15px;height:15px}.ip2-diag-pin:hover,.ip2-diag-pin[aria-pressed=true]{border-color:#d9b87585;color:#ffe1a1;background:#cfad5714}
.ip2-diag-detail strong {color:#ffe1a1;font-weight:600;background:#e6bf5d0d;padding:0 2px}
.ip2-diag-rule {height:1px;background:linear-gradient(90deg,#b49b644c,#53778425,transparent);margin:16px 0}
.ip2-diag-answer-grid {display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:16px 0}
.ip2-diag-answer {padding:13px 14px;background:linear-gradient(120deg,#241f2a,#17212b);border-top:2px solid #c77983;min-width:0}
.ip2-diag-answer.is-correct {background:linear-gradient(120deg,#133337,#14252e);border-top-color:#69c9bd}
.ip2-diag-answer .ip2-diag-value {white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;color:#f3d7dc;line-height:1.45}
.ip2-diag-answer.is-correct .ip2-diag-value {color:#b5e7dc}
.ip2-diag-hint {padding:14px 16px;background:repeating-linear-gradient(120deg,#d1ba7904 0 1px,transparent 1px 8px),linear-gradient(120deg,#3c342326,#17283390);border-left:2px solid #d9b86c;margin-top:16px}
.ip2-diag-hint h3 {color:#e2c486}
.ip2-diag-actions {padding:14px 26px 17px;border-top:1px solid #65849140;background:linear-gradient(#10202b,#0b1723);flex:none}
.ip2-diag-debug {width:100%;padding:14px 20px;border:1px solid #79cabd80;color:#dcfff3;background:repeating-linear-gradient(120deg,#d7fdea05 0 1px,transparent 1px 6px),linear-gradient(100deg,#224b46,#1c3439);font-size:12px;letter-spacing:1px;cursor:pointer;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}
.ip2-diag-debug:hover {background:#2b5a50}.ip2-diag-debug:disabled {opacity:.6;cursor:wait}
.ip2-diag-actions-note {font-size:10px!important;color:#92adae!important;margin:8px 0!important;line-height:1.45!important}
.ip2-diag-leave {padding:0;border:0;background:none;color:#a6bdc9;font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.ip2-diag-empty {display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:240px;height:100%;padding:28px;text-align:center;background:radial-gradient(ellipse at center,#3c695a12,transparent 60%)}
.ip2-diag-empty .ip2-diag-emblem {width:70px;height:70px;margin-bottom:18px;opacity:.65}.ip2-diag-empty h2 {font-size:22px}.ip2-diag-empty p {max-width:340px;margin-top:8px}
.ip2-diag-overlay button:focus-visible,.ip2-error-trigger:focus-visible {outline:2px solid #80e9e1;outline-offset:3px}
@media(max-width:740px){.ip2-diag-shell{right:10px;top:10px;bottom:10px;width:calc(100vw - 20px)}.ip2-diag-header{padding:19px 18px 16px}.ip2-diag-title{font-size:19px}.ip2-diag-split{grid-template-columns:1fr}.ip2-diag-detail{display:none}.ip2-diag-shell.has-selection .ip2-diag-list-pane{display:none}.ip2-diag-shell.has-selection .ip2-diag-detail{display:flex}.ip2-diag-back{display:inline-block}.ip2-diag-detail-scroll{padding:20px}.ip2-diag-actions{padding:15px 20px}.ip2-diag-answer-grid{grid-template-columns:1fr}.ip2-diag-detail h2{font-size:20px}.ip2-diag-list-pane{border:0}}
@media(max-height:560px){.ip2-diag-header{padding-top:14px;padding-bottom:12px}.ip2-diag-subtitle{display:none}.ip2-diag-actions{padding-top:12px;padding-bottom:12px}}
@media(prefers-reduced-motion:reduce){.ip2-diag-shell{animation:none}.ip2-error-trigger{transition:none}}
`;
        document.head.appendChild(node);
    }
    class ErrorDiagnosticSidebar extends Scene.Base {
        constructor(ui) { super(false); this.ui = ui; this.parentScene = Manager.Stack.top; this.loading = false; }
        update() { if (!this.ui.overlay || !this.ui.overlay.isConnected) { if (Manager.Stack.top === this) Manager.Stack.pop(); return; } Manager.Stack.requestPaintHUD = true; }
        draw3D() { if (this.parentScene && this.parentScene.draw3D) this.parentScene.draw3D(); }
        drawHUD() { if (this.parentScene && this.parentScene.drawHUD) this.parentScene.drawHUD(); }
        onKeyPressed(key) { if (String(key && (key.key || key.name || key.code) || key).toUpperCase() === 'ESCAPE' || Data.Keyboards && Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) this.ui.close(); return true; }
        onKeyReleased() { return true; }
        onKeyPressedRepeat() { return true; }
        onKeyPressedAndRepeat() { return true; }
        onMouseDown() { return true; }
        onMouseUp() { return true; }
        onMouseMove() { return true; }
        close() { if (this.ui && this.ui.screen === this) this.ui.close(); }
    }
    class ErrorDiagnosticUI {
        constructor(journal) {
            styles(); this.journal = journal; this.visible = false; this.screen = null; this.selected = null; this._signature = '';
            this.root = el('div', 'ip2-error-hud'); this.root.setAttribute('aria-label', 'Story error diagnostics');
            this.caption = el('div', 'ip2-error-caption', 'ERROR DIAGNOSTICS'); this.caption.appendChild(el('strong', '', 'REVIEW & UNDERSTAND'));
            this.trigger = el('button', 'ip2-error-trigger'); this.trigger.type = 'button'; this.trigger.innerHTML = icon; this.trigger.setAttribute('aria-expanded', 'false');
            this.badge = el('span', 'ip2-error-badge', '0'); this.badge.setAttribute('aria-hidden', 'true'); this.trigger.appendChild(this.badge);
            this.toastWindow = el('div', 'ip2-error-toast-window'); this.toast = el('div', 'ip2-error-toast'); this.toast.setAttribute('role', 'status'); this.toast.setAttribute('aria-live', 'polite'); this.toastWindow.appendChild(this.toast);
            this.root.append(this.caption, this.toastWindow, this.trigger); document.body.appendChild(this.root);
            for (const type of ['mousedown','mouseup','pointerdown','pointerup','touchstart','touchend']) this.trigger.addEventListener(type, stop);
            this.trigger.addEventListener('click', event => { stop(event); if (this.screen) this.close(); else this.open(); });
            this.refresh();
        }
        setVisible(visible) { this.visible = visible; this.root.style.display = visible ? 'block' : 'none'; }
        place(bounds) {
            if (!bounds || !bounds.width || !bounds.height) { this.setVisible(false); return; }
            const top = bounds.bottom + 12;
            // If the minimap fills a very short viewport, hide rather than cover it or the game controls.
            if (top + 64 > window.innerHeight - 8) { this.setVisible(false); return; }
            Object.assign(this.root.style, { left: bounds.left + 'px', top: top + 'px', width: bounds.width + 'px' });
        }
        notify(count) {
            this.toast.replaceChildren(el('strong', '', 'NEW ERROR LOGGED'), el('span', '', count === 1 ? 'One new error is ready to review' : count + ' new errors are ready to review'));
            this.caption.style.opacity = '0'; this.toast.style.animation = 'none'; void this.toast.offsetWidth;
            this.toast.style.animation = reduced() ? 'none' : 'ip2-diagnostic-toast 3.7s both';
            if (reduced()) { this.toast.style.transform = 'none'; this.toast.style.opacity = '1'; }
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => this.dismissNotification(), 3750);
        }
        dismissNotification() {
            clearTimeout(this._toastTimer);
            this.caption.style.opacity = ''; this.toast.style.animation = ''; this.toast.style.transform = ''; this.toast.style.opacity = '';
        }
        refresh() {
            const entries = this.journal.entries(), count = entries.length;
            if (this._count !== count) {
                this._count = count; this.badge.textContent = String(count); this.badge.classList.toggle('is-zero', !count);
                this.trigger.setAttribute('aria-label', 'Error diagnostics: ' + count + ' unresolved mistakes'); this.trigger.title = 'Review ' + count + ' unresolved mistakes';
            }
            const state = this.journal.getState(false);
            const signature = (state ? state.revision : 0) + ':' + count;
            if (this.overlay && this._signature !== signature && !this._debugging) {
                const selection = this.selected, scroll = this.detailScroll && this.detailScroll.scrollTop || 0;
                this._signature = signature; this.renderList(); this.renderDetail();
                if (this.selected === selection && this.detailScroll) this.detailScroll.scrollTop = scroll;
            }
        }
        open() {
            if (this.screen || !this.visible || Manager.Stack.top !== Scene.Map.current) return false;
            this.selected = null; this._signature = ''; this.screen = new ErrorDiagnosticSidebar(this);
            Manager.Stack.push(this.screen); IP2Live.InputGuard && IP2Live.InputGuard.reset();
            this.overlay = el('div', 'ip2-diag-overlay');
            const scrim = el('div', 'ip2-diag-scrim'); scrim.addEventListener('click', () => this.close());
            this.shell = el('section', 'ip2-diag-shell'); this.shell.setAttribute('role', 'dialog'); this.shell.setAttribute('aria-modal', 'true'); this.shell.setAttribute('aria-labelledby', 'ip2-diagnostic-title');
            const header = el('header', 'ip2-diag-header'), emblem = el('div', 'ip2-diag-emblem'); emblem.innerHTML = icon;
            const copy = el('div'); copy.appendChild(el('p', 'ip2-diag-eyebrow', 'NEURAL DECK / ERROR MEMORY'));
            const title = el('h1', 'ip2-diag-title', 'Understand your mistakes'); title.id = 'ip2-diagnostic-title'; copy.append(title, el('p', 'ip2-diag-subtitle', 'Review each error once. Pin a recap to keep it for later quests.'));
            this.closeButton = el('button', 'ip2-diag-close', '×'); this.closeButton.type = 'button'; this.closeButton.setAttribute('aria-label', 'Close error diagnostics'); this.closeButton.addEventListener('click', () => this.close());
            header.append(emblem, copy, this.closeButton);
            const split = el('div', 'ip2-diag-split'), listPane = el('div', 'ip2-diag-list-pane');
            const heading = el('div', 'ip2-diag-list-heading', 'ALL GAMEPLAYS'); this.listCount = el('span', 'ip2-diag-count'); heading.appendChild(this.listCount);
            this.list = el('div', 'ip2-diag-list'); this.list.setAttribute('aria-label', 'Unresolved mistakes, newest first');
            this.detail = el('section', 'ip2-diag-detail'); this.detail.setAttribute('tabindex', '-1');
            listPane.append(heading, this.list, el('p', 'ip2-diag-list-policy', 'Unpinned errors clear when a new quest starts. Pin errors to keep them between quests.'));
            split.append(listPane, this.detail); this.shell.append(header, split); this.overlay.append(scrim, this.shell);
            for (const type of ['mousedown','mouseup','pointerdown','pointerup','click','wheel','touchstart','touchend']) this.overlay.addEventListener(type, stop);
            this._keyHandler = event => {
                if (Manager.Stack.top !== this.screen) return;
                event.stopImmediatePropagation();
                if (event.key === 'Escape') { event.preventDefault(); this.close(); }
                if (event.key === 'Tab') {
                    const focusable = Array.from(this.shell.querySelectorAll('button:not(:disabled)')).filter(node => node.getClientRects().length);
                    const first = focusable[0], last = focusable[focusable.length - 1];
                    if (event.shiftKey && (document.activeElement === first || !this.shell.contains(document.activeElement))) { event.preventDefault(); last && last.focus(); }
                    else if (!event.shiftKey && (document.activeElement === last || !this.shell.contains(document.activeElement))) { event.preventDefault(); first && first.focus(); }
                }
            };
            document.addEventListener('keydown', this._keyHandler, true); document.body.appendChild(this.overlay);
            this.trigger.setAttribute('aria-expanded', 'true'); this.refresh(); this.renderDetail(); this.closeButton.focus();
            return true;
        }
        close() {
            if (!this.screen && !this.overlay) return;
            if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);
            this._keyHandler = null;
            if (this.overlay) this.overlay.remove(); this.overlay = null;
            const screen = this.screen; this.screen = null;
            if (screen && Manager.Stack.top === screen) Manager.Stack.pop();
            this._debugging = false; this.selected = null; this.trigger.setAttribute('aria-expanded', 'false');
            IP2Live.InputGuard && IP2Live.InputGuard.reset();
            if (this.visible && this.root.isConnected) this.trigger.focus({ preventScroll: true });
        }
        destroy() { this.close(); clearTimeout(this._toastTimer); if (this._animationFrame) cancelAnimationFrame(this._animationFrame); this.root.remove(); }
        renderList() {
            const previousScroll = this.list.scrollTop, entries = this.journal.entries(); this.list.replaceChildren();
            this.listCount.textContent = entries.length + ' OPEN'; this.rows = new Map();
            const pinned = entries.filter(entry => entry.pinned), unpinned = entries.filter(entry => !entry.pinned);
            for (const [label, group] of [['PINNED', pinned], ['UNPINNED', unpinned]]) {
                if (!group.length) continue;
                if (pinned.length) this.list.appendChild(el('div', 'ip2-diag-group-label' + (label === 'PINNED' ? ' is-pinned' : ''), label + ' / ' + group.length));
                for (const entry of group) {
                const row = el('button', 'ip2-diag-row'); row.type = 'button'; row.setAttribute('aria-pressed', String(this.selected === entry.id));
                const top = el('span', 'ip2-diag-row-top'); top.appendChild(el('span', 'ip2-diag-row-game', entry.gameplayLabel));
                if (entry.pinned) { const mark = el('span', 'ip2-diag-pinned-mark'); mark.innerHTML = pinIcon; mark.appendChild(document.createTextNode('PINNED')); top.appendChild(mark); }
                row.append(top, el('span', 'ip2-diag-row-title', entry.title));
                if (['ip_classification', 'mask_classification', 'classify'].includes(entry.row.stepKey) || entry.row.concept === 'ipv4_classification') {
                    row.appendChild(el('span', 'ip2-diag-row-summary', (entry.row.submitted == null ? 'Unmatched' : 'Class ' + entry.submitted) + ' → Class ' + entry.expected));
                }
                const foot = el('span', 'ip2-diag-row-foot'); foot.appendChild(el('span', 'ip2-diag-row-meta',
                    '#' + String(entry.sequence).padStart(3, '0') + (entry.stageId ? ' · Stage ' + entry.stageId + (entry.levelId ? ' / ' + entry.levelId : '') : '')));
                if (entry.occurrences > 1) foot.appendChild(el('span', 'ip2-diag-repeat', 'Seen ' + entry.occurrences + '×'));
                row.appendChild(foot);
                row.addEventListener('click', () => { if (this._debugging) return; this.selected = entry.id; this.renderList(); this.renderDetail(); this.detail.focus({ preventScroll: true }); });
                this.list.appendChild(row); this.rows.set(entry.id, row);
                }
            }
            if (!entries.length) this.list.appendChild(el('p', 'ip2-diag-subtitle', 'No unresolved mistakes. New Story errors will appear here.'));
            this.list.scrollTop = previousScroll;
            if (this.selected && !entries.some(entry => entry.id === this.selected)) { this.selected = null; this.renderDetail(); }
        }
        renderDetail() {
            if (!this.detail) return;
            const entry = this.journal.entries().find(item => item.id === this.selected); this.shell.classList.toggle('has-selection', !!entry); this.detail.replaceChildren();
            this.detailScroll = null;
            if (!entry) {
                const empty = el('div', 'ip2-diag-empty'), emblem = el('div', 'ip2-diag-emblem'); emblem.innerHTML = icon;
                empty.append(emblem, el('h2', '', this.journal.entries().length ? 'Every mistake has a lesson' : 'Error memory is clear'),
                    el('p', '', this.journal.entries().length ? 'Select an error to review its latest example and correction. Pin a recap to keep it when you start a new quest.' : 'New errors appear after you return to the world. Repeated mistakes share one recap; pin anything you want to keep.'));
                this.detail.appendChild(empty); return;
            }
            const scroll = el('div', 'ip2-diag-detail-scroll'), back = el('button', 'ip2-diag-back', '← All mistakes'); back.type = 'button';
            back.addEventListener('click', () => this.leave());
            this.detailScroll = scroll;
            scroll.append(back, el('p', 'ip2-diag-eyebrow', entry.gameplayLabel + ' / ERROR #' + String(entry.sequence).padStart(3, '0')), el('h2', '', entry.title));
            const tools = el('div', 'ip2-diag-detail-tools');
            tools.appendChild(el('span', 'ip2-diag-observations', 'Seen ' + (entry.occurrences || 1) + ((entry.occurrences || 1) === 1 ? ' time' : ' times') + ' · Latest example'));
            this.pinButton = el('button', 'ip2-diag-pin'); this.pinButton.type = 'button'; this.pinButton.innerHTML = pinIcon;
            this.pinButton.appendChild(document.createTextNode(entry.pinned ? 'Pinned · Unpin' : 'Pin error'));
            this.pinButton.setAttribute('aria-label', entry.pinned ? 'Unpin error' : 'Pin error'); this.pinButton.setAttribute('aria-pressed', String(entry.pinned));
            this.pinButton.title = entry.pinned ? 'Unpin to allow clearing when the next quest starts' : 'Keep this recap across quest changes';
            this.pinButton.addEventListener('click', () => {
                if (this._debugging) return;
                this.journal.setPinned(entry.id, !entry.pinned); this.refresh(); this.pinButton.focus({ preventScroll: true });
            });
            tools.appendChild(this.pinButton); scroll.append(tools, el('div', 'ip2-diag-rule'));
            scroll.appendChild(el('h3', '', 'Why this was wrong')); const why = el('p'); rich(why, entry.why); scroll.appendChild(why);
            const answers = el('div', 'ip2-diag-answer-grid');
            for (const [label, value, correct] of [['YOU SUBMITTED',entry.submitted,false],['EXPECTED RESULT',entry.expected,true]]) {
                const box = el('div', 'ip2-diag-answer' + (correct ? ' is-correct' : '')); box.append(el('h3', '', label), el('div', 'ip2-diag-value', value)); answers.appendChild(box);
            }
            const hint = el('div', 'ip2-diag-hint'); hint.appendChild(el('h3', '', 'Try this next')); const hintText = el('p'); rich(hintText, entry.hint); hint.appendChild(hintText); scroll.append(answers, hint);
            const actions = el('div', 'ip2-diag-actions'); this.debugButton = el('button', 'ip2-diag-debug', 'DEBUG · ACKNOWLEDGE'); this.debugButton.type = 'button'; this.debugButton.addEventListener('click', () => this.debug(entry));
            const leave = el('button', 'ip2-diag-leave', 'Leave unresolved'); leave.type = 'button'; leave.addEventListener('click', () => this.leave());
            actions.append(this.debugButton, el('p', 'ip2-diag-actions-note', 'I understand this mistake. Remove its recap; my recorded answers and scores stay unchanged.'), leave); this.detail.append(scroll, actions);
        }
        leave() { if (this._debugging) return; this.selected = null; this.renderList(); this.renderDetail(); this.closeButton.focus(); }
        debug(entry) {
            if (this._debugging || !this.journal.acknowledge(entry.id)) return false;
            this._debugging = true; this.debugButton.disabled = true; this.debugButton.textContent = 'DEBUGGING…';
            const row = this.rows.get(entry.id), start = performance.now(), selected = this.selected;
            const finish = () => {
                this._debugging = false; this._animationFrame = null;
                if (!this.overlay) return;
                if (this.selected === selected) this.selected = null;
                this._signature = ''; this.refresh(); this.renderDetail();
                const next = this.list.querySelector('button'); (next || this.closeButton).focus();
            };
            if (!row || reduced()) { finish(); return true; }
            const height = row.getBoundingClientRect().height, columns = 14, lines = 8;
            const step = now => {
                if (!this.overlay || !row.isConnected) { this._animationFrame = null; return; }
                const elapsed = now - start, dissolve = Math.min(1, elapsed / 430);
                const images = [], positions = [], sizes = [];
                for (let y = 0; y < lines; y++) for (let x = 0; x < columns; x++) {
                    const threshold = ((x * 37 + y * 59 + x * y * 11) % 113) / 113;
                    if (threshold < dissolve) continue;
                    images.push('linear-gradient(#000,#000)'); positions.push((x * 100 / (columns - 1)) + '% ' + (y * 100 / (lines - 1)) + '%'); sizes.push((100 / columns + .15) + '% ' + (100 / lines + .15) + '%');
                }
                row.style.maskImage = images.join(',') || 'linear-gradient(transparent,transparent)'; row.style.maskPosition = positions.join(','); row.style.maskSize = sizes.join(','); row.style.maskRepeat = 'no-repeat';
                if (elapsed > 430) { const collapse = Math.min(1, (elapsed - 430) / 230); row.style.height = Math.max(0, height * (1 - collapse)) + 'px'; row.style.minHeight = '0'; row.style.paddingTop = row.style.paddingBottom = '0'; row.style.marginBottom = (8 * (1 - collapse)) + 'px'; row.style.overflow = 'hidden'; }
                if (elapsed >= 660) finish(); else this._animationFrame = requestAnimationFrame(step);
            };
            this._animationFrame = requestAnimationFrame(step); return true;
        }
    }
    IP2Live.ErrorDiagnosticUI = ErrorDiagnosticUI;
    IP2Live.ErrorDiagnosticSidebar = ErrorDiagnosticSidebar;
})();
