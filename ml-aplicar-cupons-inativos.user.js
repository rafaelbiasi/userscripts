// ==UserScript==
// @name         ML - Aplicar Cupons Inativos
// @namespace    https://github.com/rafaelbiasi/userscripts/
// @description  Clica automaticamente em todos os botões “Aplicar” na lista de cupons inativos do Mercado Livre e recarrega a página quando terminar.
// @author       Rafael Biasi
// @match        https://www.mercadolivre.com.br/cupons/filter?status=inactive&source_page=int_applied_filters
// @grant        none
// @run-at       document-idle
// @noframes
// @version      1.0.0
// @updateURL    https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/ml-aplicar-cupons-inativos.meta.js
// @downloadURL  https://github.com/rafaelbiasi/userscripts/raw/refs/heads/main/ml-aplicar-cupons-inativos.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mercadolivre.com.br
// ==/UserScript==

(() => {
    'use strict';

  // Ajuste fino dos tempos
  const START_DELAY_MS = 900;
  const BETWEEN_MIN_MS = 300;
  const BETWEEN_MAX_MS = 650;
  const IDLE_BEFORE_RELOAD_MS = 1200;
  const MAX_RUNTIME_MS = 20_000;
  const MARK_ATTR = 'data-auto-aplicar-clicked';
  const DEBUG = false;

  const log = (...args) => DEBUG && console.log('[Cupons]', ...args);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  function getAplicarButtons() {
    return [...document.querySelectorAll('button.andes-button')]
      .filter(btn =>
        btn.isConnected &&
        !btn.disabled &&
        btn.offsetParent !== null &&
        btn.textContent.trim().toLowerCase() === 'aplicar' &&
        !btn.hasAttribute(MARK_ATTR)
      );
  }

  function simulateHumanClick(el) {
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
    const common = { bubbles: true, cancelable: true, view: window };
    try { el.dispatchEvent(new PointerEvent('pointerdown', { ...common, pointerType: 'mouse', buttons: 1 })); } catch {}
    el.dispatchEvent(new MouseEvent('mousedown', { ...common, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...common, buttons: 1 }));
    el.click();
  }

  async function run() {
    if (document.readyState !== 'complete') {
      await new Promise(res => window.addEventListener('load', res, { once: true }));
    }
    await sleep(START_DELAY_MS);

    let lastDomChange = Date.now();
    let clicks = 0;
    const t0 = Date.now();

    const mo = new MutationObserver(() => { lastDomChange = Date.now(); });
    mo.observe(document.body, { childList: true, subtree: true });

    try {
      while (Date.now() - t0 < MAX_RUNTIME_MS) {
        const buttons = getAplicarButtons();

        if (buttons.length === 0) {
          if (clicks > 0 && Date.now() - lastDomChange > IDLE_BEFORE_RELOAD_MS) {
            break;
          }
          await sleep(150);
          continue;
        }

        for (const btn of buttons) {
          btn.setAttribute(MARK_ATTR, '1');
          log('Clicando:', btn);
          simulateHumanClick(btn);
          clicks++;
          await sleep(rand(BETWEEN_MIN_MS, BETWEEN_MAX_MS));
        }
      }
    } finally {
      mo.disconnect();
    }

    if (clicks > 0) {
      log('Recarregando após aplicar cupons...');
      location.reload();
    } else {
      log('Nenhum botão "Aplicar" encontrado (ou já aplicados).');
    }
  }

  run();
})();