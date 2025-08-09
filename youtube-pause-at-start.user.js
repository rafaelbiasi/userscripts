// ==UserScript==
// @name         YouTube Pause at Start
// @namespace    https://github.com/rafaelbiasi/userscripts
// @description  Pausa o vídeo imediatamente ao abrir uma página de vídeo (exceto playlists) e libera o controle ao usuário após a pausa bem sucedida. Utiliza estratégia resiliente ao SPA do YouTube.
// @author       Rafael Biasi
// @match        *://*.youtube.com/watch?v=*
// @grant        none
// @run-at       document-start
// @noframes
// @version      1.0.0
// @updateURL    https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-pause-at-start.meta.js
// @downloadURL  https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/youtube-pause-at-start.user.js
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = 'YPAS';
    const LOG_ENABLED = true;
    const DEBUG_ENABLED = true;

    const VIDEO_EVENT = 'playing';
    const TRY_PAUSE_INTERVAL_MS = 10;
    const TRY_PAUSE_TIMEOUT_MS = 1000;
    const RESET_CT_BEFORE_SEC = 20;
    const WAIT_MAX_TRIES = 1200;
    const SELECTOR_VIDEO = '.html5-video-container video.html5-main-video';

    let playingHandler = null;
    let tryPauseTimer = null;

    init();

    function init() {
        installGlobalErrorLogging();
        if (isPlaylistPage()) {
            debug('Página de playlist detectada; script não se aplica.');
            return;
        }
        whenReadyForVideo().catch((e) => log('Falha no bootstrap:', e));
        installSpaGuards();
    }

    function installGlobalErrorLogging() {
        window.addEventListener('error', (event) => {
            console.error(LOG_PREFIX, 'Erro não tratado:', event.error || event.message || event);
        }, { passive: true });
        window.addEventListener('unhandledrejection', (event) => {
            console.error(LOG_PREFIX, 'Promise rejeitada:', event.reason);
        }, { passive: true });
    }

    function installSpaGuards() {
        const rearm = () => {
            if (isPlaylistPage()) {
                debug('Navegação para playlist; sem ação.');
                return;
            }
            whenReadyForVideo().catch((e) => log('Falha ao rearmar em SPA:', e));
        };

        ['yt-navigate-finish', 'yt-navigate-start'].forEach((evt) => {
            window.addEventListener(evt, () => {
                debug('SPA event:', evt, location.href);
                rearm();
            }, { passive: true });
        });

        const origPush = history.pushState;
        history.pushState = function (...args) {
            const ret = origPush.apply(this, args);
            queueMicrotask(rearm);
            return ret;
        };
        const origReplace = history.replaceState;
        history.replaceState = function (...args) {
            const ret = origReplace.apply(this, args);
            queueMicrotask(rearm);
            return ret;
        };
        window.addEventListener('popstate', () => queueMicrotask(rearm), { passive: true });
    }

    async function whenReadyForVideo() {
        debug('Aguardando elemento de vídeo...');
        const video = await waitForElement(SELECTOR_VIDEO, WAIT_MAX_TRIES);
        if (!video) {
            log('Vídeo não encontrado no prazo.');
            return;
        }
        if (isPlaylistPage()) {
            debug('Playlist detectada após vídeo; abortando.');
            return;
        }
        prepareAndPause(video);
    }

    function prepareAndPause(videoEl) {
        debug('Preparando vídeo para pausa imediata', videoEl);

        try { videoEl.preload = 'auto'; } catch {}
        try { videoEl.autoplay = false; } catch {}
        const oldMuted = temporarilyMute(videoEl, true);

        playingHandler = () => onPlaying(videoEl, oldMuted);
        videoEl.addEventListener(VIDEO_EVENT, playingHandler, { once: false, passive: true });

        const startAt = performance.now();
        clearInterval(tryPauseTimer);
        tryPauseTimer = setInterval(() => {
            try {
                forcePauseCycle(videoEl, oldMuted, startAt);
            } catch (e) {
                debug('Erro em forcePauseCycle:', e);
            }
        }, TRY_PAUSE_INTERVAL_MS);

        forcePauseCycle(videoEl, oldMuted, startAt);
    }

    function forcePauseCycle(videoEl, oldMuted, startAt) {
        safePause(videoEl);
        temporarilyMute(videoEl, true);

        if (Number.isFinite(videoEl.currentTime) && videoEl.currentTime < RESET_CT_BEFORE_SEC) {
            videoEl.currentTime = 0;
        }

        const elapsed = performance.now() - startAt;
        if (elapsed >= TRY_PAUSE_TIMEOUT_MS && videoEl.paused) {
            finalizePause(videoEl, oldMuted);
        }
    }

    function onPlaying(videoEl, oldMuted) {
        debug('Evento playing detectado; forçando pausa imediata.');
        safePause(videoEl);
        temporarilyMute(videoEl, true);
    }

    function finalizePause(videoEl, oldMuted) {
        debug('Pausa estabilizada; liberando controle ao usuário.');
        clearInterval(tryPauseTimer);
        tryPauseTimer = null;
        if (playingHandler) {
            videoEl.removeEventListener(VIDEO_EVENT, playingHandler);
            playingHandler = null;
        }
        temporarilyMute(videoEl, oldMuted);
        safePause(videoEl);
    }

    function safePause(videoEl) {
        try {
            videoEl.pause();
        } catch (e) {
        }
    }

    function temporarilyMute(videoEl, mute) {
        const old = !!videoEl.muted;
        try {
            videoEl.muted = !!mute;
        } catch {}
        return old;
    }

    function isPlaylistPage() {
        const url = new URL(location.href);
        return url.searchParams.has('list');
    }

    async function waitForElement(selector, maxTries = 600) {
        debug('waitForElement:', selector, 'maxTries:', maxTries);
        let tries = 0;

        const existing = document.querySelector(selector);
        if (existing) return existing;

        return new Promise((resolve, reject) => {
            const tick = () => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (++tries >= maxTries) return reject(new Error(`Timeout esperando por selector: ${selector}`));
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    function log(...args) {
        if (LOG_ENABLED) console.log(LOG_PREFIX, ...args);
    }

    function debug(...args) {
        if (LOG_ENABLED && DEBUG_ENABLED) console.debug(LOG_PREFIX, ...args);
    }
})();