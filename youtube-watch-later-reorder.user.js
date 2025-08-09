// ==UserScript==
// @name         YouTube Watch Later Reorder
// @namespace    https://github.com/rafaelbiasi/userscripts
// @description  Reposiciona o botão "Assistir mais tarde" (Watch Later) para o final da barra superior do player, de forma resiliente a mudanças de DOM no SPA do YouTube.
// @author       Rafael Biasi
// @match        *://*.youtube.com/watch?v=*
// @grant        none
// @run-at       document-idle
// @noframes
// @version      1.0.0
// @updateURL    https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-reorder.meta.js
// @downloadURL  https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-reorder.user.js
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = 'YTWLR';
    const LOG_ENABLED = true;
    const DEBUG_ENABLED = true;

    const SELECTOR_TOP_BUTTONS = '.ytp-chrome-top-buttons';
    const SELECTOR_WATCH_LATER_BTN = '.ytp-chrome-top-buttons > .ytp-watch-later-button.ytp-button';

    const PROCESS_DEBOUNCE_MS = 200;
    const IDLE_STOP_MS = 4000;

    let observer = null;
    let debounceTimer = null;
    let idleTimer = null;
    let processedSinceLastIdle = false;

    init();

    function init() {
        debug('init');
        installSpaListeners();
        processNow();
        startObserver();
    }

    function installSpaListeners() {
        const reprocess = () => {
            processSafe();
            restartObserver();
        };

        ['yt-navigate-finish', 'yt-navigate-start'].forEach((evt) => {
            window.addEventListener(evt, () => {
                debug('SPA event:', evt, location.href);
                reprocess();
            }, { passive: true });
        });

        const push = history.pushState;
        history.pushState = function (...args) {
            const ret = push.apply(this, args);
            queueProcess();
            return ret;
        };
        const replace = history.replaceState;
        history.replaceState = function (...args) {
            const ret = replace.apply(this, args);
            queueProcess();
            return ret;
        };
        window.addEventListener('popstate', () => queueProcess(), { passive: true });
    }

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(onMutations);
        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        debug('MutationObserver started');
    }

    function stopObserver() {
        if (!observer) return;
        observer.disconnect();
        observer = null;
        debug('MutationObserver stopped');
    }

    function restartObserver() {
        stopObserver();
        startObserver();
    }

    function onMutations(mutations) {
        if (!mutations || mutations.length === 0) return;
        processedSinceLastIdle = true;
        queueProcess();
    }

    function queueProcess() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            processSafe();
            scheduleIdleStop();
        }, PROCESS_DEBOUNCE_MS);
    }

    function processNow() {
        processSafe();
        scheduleIdleStop();
    }

    function scheduleIdleStop() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (!processedSinceLastIdle) {
                stopObserver();
            }
            processedSinceLastIdle = false;
        }, IDLE_STOP_MS);
    }

    function processSafe() {
        try {
            reorderWatchLater();
        } catch (e) {
            log('Erro ao reposicionar Watch Later:', e);
        }
    }

    function reorderWatchLater() {
        const list = document.querySelector(SELECTOR_TOP_BUTTONS);
        if (!list) return;

        const wl = list.querySelector(SELECTOR_WATCH_LATER_BTN);
        if (!wl) return;

        if (wl !== list.lastElementChild) {
            list.removeChild(wl);
            list.appendChild(wl);
            debug('Watch Later movido para o final');
        }
    }

    function log(...args) {
        if (LOG_ENABLED) console.log(LOG_PREFIX, ...args);
    }

    function debug(...args) {
        if (LOG_ENABLED && DEBUG_ENABLED) console.debug(LOG_PREFIX, ...args);
    }
})();