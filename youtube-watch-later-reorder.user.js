// ==UserScript==
// @name         YouTube Watch Later Reorder
// @namespace    https://github.com/rafaelbiasi/userscripts
// @description  Mantém o botão "Assistir mais tarde" sempre no final da barra superior do player.
// @author       Rafael Biasi
// @match        *://*.youtube.com/watch?v=*
// @grant        none
// @run-at       document-idle
// @noframes
// @version      2.0.0
// @updateURL    https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-reorder.meta.js
// @downloadURL  https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-reorder.user.js
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    const SELECTOR_TOP_BUTTONS = '.ytp-chrome-top-buttons';
    const SELECTOR_WATCH_LATER_BTN = '.ytp-watch-later-button.ytp-button';

    let lastVideoId = null;

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

    function initWatcher() {
        const list = document.querySelector(SELECTOR_TOP_BUTTONS);
        if (!list) return false;

        moveWatchLater();

        // Observa apenas mudanças dentro da barra de botões
        const obs = new MutationObserver(() => moveWatchLater());
        obs.observe(list, { childList: true });
        return true;
    }

    function init() {
        const vid = getVideoId();
        if (!vid || vid === lastVideoId) return;

        lastVideoId = vid;

        const tryInit = setInterval(() => {
            if (initWatcher()) {
                clearInterval(tryInit);
            }
        }, 300);
    }

    // Detecta troca de vídeo no SPA do YouTube
    new MutationObserver(init).observe(document.body, { childList: true, subtree: true });

    init();
})();
