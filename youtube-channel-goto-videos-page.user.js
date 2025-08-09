// ==UserScript==
// @name         YouTube Channel Links → Videos Tab
// @namespace    https://rafaelbiasi.dev/userscripts
// @version      1.0.0
// @description  Converte links de canais no YouTube para apontarem diretamente à aba "Vídeos", de forma idempotente e resiliente a mudanças de DOM do SPA.
// @author       Rafael Biasi
// @match        *://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    let LOG_ENABLED = false;
    let DEBUG_ENABLED = true;

    const LOG_PREFIX = 'YTCV';

    const PROCESS_DEBOUNCE_MS = 250;
    const STABLE_IDLE_MS = 5000;

    const YT_NAV_EVENTS = ['yt-navigate-finish', 'yt-navigate-start'];

    const SELECTOR_CANDIDATES = [
        // Em vídeos/assistir: link do dono do vídeo
        'a.ytd-video-owner-renderer[href*="/channel/"]:not([href*="/videos"])',
        'a.ytd-video-owner-renderer[href^="/@"]:not([href*="/videos"])',

        // Em listagens/search/results: miniaturas e nomes de canal
        'a#channel-thumbnail[href*="/channel/"]:not([href*="/videos"])',
        'a#channel-thumbnail[href^="/@"]:not([href*="/videos"])',
        '#text-container a[href*="/channel/"]:not([href*="/videos"])',
        '#text-container a[href^="/@"]:not([href*="/videos"])',

        // Página inicial do canal e outras superfícies onde aparece o avatar/nome
        'a#avatar-link[href*="/channel/"]:not([href*="/videos"])',
        'a#avatar-link[href^="/@"]:not([href*="/videos"])',

        // Fallbacks em componentes genéricos contendo links de canal
        'a[href*="/channel/"]:not([href*="/videos"])',
        'a[href^="/@"]:not([href*="/videos"])'
    ];

    const CHANNEL_PATH_PREFIXES = [
        '/channel/',
        '/c/',
        '/user/',
        '/@'
    ];

    let observer = null;
    let debounceTimer = null;
    let idleTimer = null;
    let processedSinceLastIdle = false;

    init();

    function init() {
        log('init');
        installSpaListeners();
        processNow();
        startObserver();
    }

    function installSpaListeners() {
        YT_NAV_EVENTS.forEach((evt) => {
            window.addEventListener(evt, () => {
                debug('SPA event:', evt, location.href);
                processNow();
                restartObserver();
            }, {passive: true});
        });

        const pushState = history.pushState;
        history.pushState = function (...args) {
            debug("args for pushState:", args);
            const ret = pushState.apply(this, args);
            queueProcess();
            return ret;
        };
        const replaceState = history.replaceState;
        history.replaceState = function (...args) {
            const ret = replaceState.apply(this, args);
            queueProcess();
            return ret;
        };
        window.addEventListener('popstate', () => queueProcess(), {passive: true});
    }

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(onMutations);
        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href']
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
            processLinksSafe();
            scheduleIdleStop();
        }, PROCESS_DEBOUNCE_MS);
    }

    function processNow() {
        processLinksSafe();
        scheduleIdleStop();
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

    function processLinksSafe() {
        try {
            processLinks();
        } catch (e) {
            log('Erro ao processar links:', e);
        }
    }

    function processLinks() {
        debug('processLinks', location.pathname);

        if (location.hostname !== 'www.youtube.com') return;

        const path = location.pathname;
        if (isContentRoute(path)) {
            debug('Página de conteúdo; processando somente links claramente de canal.');
        }

        const seen = new Set();
        for (const sel of SELECTOR_CANDIDATES) {
            const nodes = document.querySelectorAll(sel);
            if (!nodes || nodes.length === 0) continue;

            nodes.forEach((a) => {
                if (!(a instanceof HTMLAnchorElement)) return;
                if (seen.has(a)) return;
                seen.add(a);

                try {
                    const updated = normalizeChannelUrlToVideos(a);
                    if (updated) debug('Atualizado:', a.href);
                } catch (e) {
                    debug('Falha ao normalizar link:', a, e);
                }
            });
        }
    }

    function isContentRoute(pathname) {
        return (
            pathname.startsWith('/watch') ||
            pathname.startsWith('/shorts') ||
            pathname.startsWith('/playlist')
        );
    }

    function normalizeChannelUrlToVideos(anchor) {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return false;

        const url = toAbsoluteUrl(rawHref);
        if (!url) return false;

        if (url.hostname !== 'www.youtube.com') return false;

        const path = url.pathname;

        if (isVideosPath(path)) return false;

        if (!isChannelRoot(path)) return false;

        const normalizedPath = ensureTrailingSlash(path) + 'videos';

        url.pathname = normalizedPath;

        const finalHref = url.toString();
        if (finalHref === anchor.href) return false;

        anchor.href = finalHref;
        return true;
    }

    function isChannelRoot(pathname) {
        const segs = pathname.split('/').filter(Boolean);
        if (segs.length === 1 && pathname.startsWith('/@')) {
            return true;
        }
        if (segs.length === 2) {
            const [p1] = segs;
            return CHANNEL_PATH_PREFIXES.some((p) => pathname.startsWith(p));
        }
        return false;
    }

    function isVideosPath(pathname) {
        if (!pathname) return false;
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length < 2) return false;
        const last = parts[parts.length - 1].toLowerCase();
        return last === 'videos';
    }

    function ensureTrailingSlash(pathname) {
        return pathname.endsWith('/') ? pathname : pathname + '/';
    }

    function toAbsoluteUrl(href) {
        try {
            return new URL(href, location.origin);
        } catch {
            return null;
        }
    }

    function log(...args) {
        if (LOG_ENABLED) console.log(LOG_PREFIX, ...args);
    }

    function debug(...args) {
        if (LOG_ENABLED && DEBUG_ENABLED) console.debug(LOG_PREFIX, ...args);
    }
})();