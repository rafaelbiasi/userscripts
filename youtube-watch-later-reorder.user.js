// ==UserScript==
// @name         YouTube Watch Later Reorder
// @namespace    https://github.com/rafaelbiasi/userscripts
// @description  Mantém o botão "Assistir mais tarde" sempre no final da barra superior do player.
// @author       Rafael Biasi
// @match        *://*.youtube.com/watch?v=*
// @grant        none
// @run-at       document-start
// @noframes
// @version      2.0.1
// @updateURL    https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-reorder.meta.js
// @downloadURL  https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-reorder.user.js
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    const SELECTOR_TOP_BUTTONS = '.ytp-chrome-top-buttons';
    const SELECTOR_WATCH_LATER_BTN = '.ytp-watch-later-button.ytp-button';

    let lastVideoId = null;
    let watcherObserver = null;
    let rafId = null;

    function getVideoId() {
        try {
            return new URL(location.href).searchParams.get('v');
        } catch {
            return null;
        }
    }

    function moveWatchLater() {
        const list = document.querySelector(SELECTOR_TOP_BUTTONS);
        if (!list) return;

        const wl = list.querySelector(SELECTOR_WATCH_LATER_BTN);
        if (!wl) return;

        if (wl !== list.lastElementChild) {
            list.appendChild(wl);
        }
    }

    function attachListObserver(list) {
        if (watcherObserver) {
            try { watcherObserver.disconnect(); } catch (e) {}
        }

        moveWatchLater();

        watcherObserver = new MutationObserver(() => moveWatchLater());
        watcherObserver.observe(list, { childList: true, subtree: true });
    }

    function tryFindList() {
        const list = document.querySelector(SELECTOR_TOP_BUTTONS);
        if (list) {
            attachListObserver(list);
            return true;
        }
        return false;
    }

    function startRafLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        const loop = () => {
            if (tryFindList()) {
                rafId = null;
                return;
            }
            rafId = requestAnimationFrame(loop);
        };
        loop();
    }

    function init() {
        const vid = getVideoId();
        if (!vid || vid === lastVideoId) return;

        lastVideoId = vid;
        startRafLoop();
    }

    const observeTarget = document.body || document.documentElement;
    new MutationObserver(init).observe(observeTarget, { childList: true, subtree: true });

    init();
})();
