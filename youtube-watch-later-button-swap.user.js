// ==UserScript==
// @name         YouTube Watch Later Button Swap
// @namespace    https://github.com/rafaelbiasi/userscripts
// @description  Move o botão "Assistir mais tarde" (Watch Later) para o início do grupo de botões do player, de forma idempotente e resiliente ao SPA do YouTube.
// @author       Rafael Biasi
// @match        *://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @noframes
// @version      1.0.0
// @updateURL    https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-button-swap.meta.js
// @downloadURL  https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-watch-later-button-swap.user.js
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// ==/UserScript==

// noinspection D
(function () {
    'use strict';

    let LOG_ENABLED = false;
    let DEBUG_ENABLED = true;
    const LOG_PREFIX = 'YTWL';

    const YT_NAV_EVENTS = ['yt-navigate-start', 'yt-navigate-finish'];
    const PROCESS_DEBOUNCE_MS = 200;
    const STABLE_IDLE_MS = 5000;

    const SELECTORS_TOP_BUTTONS = [
        '.ytp-chrome-top .ytp-chrome-top-buttons',
        '.ytp-chrome-top-buttons'
    ];

    const SELECTORS_WATCH_LATER = [
        '.ytp-watch-later-button.ytp-button',
        'button[aria-label*="Assistir mais tarde"]',
        'button[aria-label*="Watch later"]'
    ];

    let observer = null;
    let debounceTimer = null;
    let idleTimer = null;
    let processedSinceLastIdle = false;

    init();

    function init() {
        log('init');
        installSpaListeners();
        startObserver();
        queueProcess();
        if (document.readyState === 'loading') {
            document.addEventListener('readystatechange', () => {
                if (document.readyState === 'interactive' || document.readyState === 'complete') {
                    queueProcess();
                }
            }, { once: true });
        }
    }

    function installSpaListeners() {
        YT_NAV_EVENTS.forEach((evt) => {
            window.addEventListener(evt, () => {
                debug('SPA event:', evt, location.href);
                queueProcess();
                restartObserver();
            }, { passive: true });
        });

        const pushState = history.pushState;
        history.pushState = function (...args) {
            const ret = pushState.apply(this, args);
            debug('history.pushState', args);
            queueProcess();
            return ret;
        };
        const replaceState = history.replaceState;
        history.replaceState = function (...args) {
            const ret = replaceState.apply(this, args);
            debug('history.replaceState', args);
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
            attributeFilter: ['class', 'hidden', 'style', 'aria-label']
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

    function scheduleIdleStop() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (!processedSinceLastIdle) {
                stopObserver();
            }
            processedSinceLastIdle = false;
        }, STABLE_IDLE_MS);
    }

    function processSafe() {
        try {
            processWatchLaterSwap();
        } catch (e) {
            log('Erro ao ajustar Watch Later:', e);
        }
    }

    function processWatchLaterSwap() {
        const topButtons = queryFirst(SELECTORS_TOP_BUTTONS);
        if (!topButtons) {
            debug('Top buttons container não encontrado.');
            return;
        }

        const wlButton = queryFirst(SELECTORS_WATCH_LATER, topButtons) || queryFirst(SELECTORS_WATCH_LATER);
        if (!wlButton) {
            debug('Watch Later button não encontrado.');
            return;
        }

        const firstInteractiveChild = getFirstInteractiveChild(topButtons);
        if (firstInteractiveChild === wlButton) {
            debug('Watch Later já está na primeira posição.');
            return;
        }

        try {
            topButtons.insertBefore(wlButton, topButtons.firstChild);
            debug('Watch Later movido para a primeira posição.');
        } catch (e) {
            debug('Falha ao mover Watch Later:', e);
        }
    }

    function getFirstInteractiveChild(container) {
        if (!container) return null;
        const children = Array.from(container.children || []);
        for (const c of children) {
            if (isNodeVisible(c) && isFocusable(c)) {
                return c;
            }
        }
        return null;
    }

    function isNodeVisible(el) {
        if (!(el instanceof HTMLElement)) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return true;
    }

    function isFocusable(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (el.tabIndex >= 0) return true;
        if (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button') return true;
        return false;
    }

    function queryFirst(selectors, root = document) {
        if (Array.isArray(selectors)) {
            for (const sel of selectors) {
                const n = root.querySelector(sel);
                if (n) return n;
            }
            return null;
        }
        return root.querySelector(selectors);
    }

    function log(...args) {
        if (LOG_ENABLED) console.log(LOG_PREFIX, ...args);
    }
    function debug(...args) {
        if (LOG_ENABLED && DEBUG_ENABLED) console.debug(LOG_PREFIX, ...args);
    }
})();