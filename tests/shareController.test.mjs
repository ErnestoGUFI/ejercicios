import test from "node:test";
import assert from "node:assert/strict";

import ShareControl, { SHARE_LABELS } from "../src/components/ShareControl.js";
import ShareController, { SHARE_MESSAGES } from "../src/controllers/ShareController.js";
import { createShareService } from "../src/pwa/share.js";

const publishedRoot = "https://ernestogufi.github.io/ejercicios/";
const javascriptUrl = "https://ernestogufi.github.io/ejercicios/#/item/javascript";

function createControl(topicId = "javascript") {
  const feedback = { hidden: true, textContent: "", dataset: {} };
  const fallback = { hidden: true };
  const link = {
    value: "",
    focusCalls: 0,
    selectCalls: 0,
    focus() {
      this.focusCalls += 1;
    },
    select() {
      this.selectCalls += 1;
    },
  };
  const control = {
    querySelector: (selector) => ({
      "[data-share-feedback]": feedback,
      "[data-share-fallback]": fallback,
      "[data-share-link]": link,
    })[selector] ?? null,
  };
  const button = {
    disabled: false,
    textContent: SHARE_LABELS.native,
    dataset: { shareTopic: topicId },
    closest: (selector) => ({ "[data-share-topic]": button, ".share-control": control })[selector] ?? null,
  };
  return { button, feedback, fallback, link };
}

function createDocument() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
    },
    click(target) {
      return Promise.all((listeners.click ?? []).map((listener) => listener({ target })));
    },
  };
}

function createFakeService(result, mode = "native") {
  return {
    mode,
    calls: [],
    getMode() {
      return this.mode;
    },
    share(data) {
      this.calls.push(data);
      return typeof result === "function" ? result(data) : Promise.resolve(result);
    },
  };
}

function setup(result, { mode, topicId } = {}) {
  const document = createDocument();
  const shareService = createFakeService(result, mode);
  const elements = createControl(topicId);
  new ShareController({ document, shareService, baseUrl: publishedRoot }).init();
  return { document, shareService, ...elements };
}

test("ShareControl labels the button by mode and renders a hidden read-only fallback", () => {
  const native = ShareControl({ topicId: "javascript", url: javascriptUrl });
  const copy = ShareControl({ topicId: "javascript", url: javascriptUrl, mode: "copy" });

  assert.match(native, /<button class="sw-button sw-button-secondary" type="button" data-share-topic="javascript">Compartir tema<\/button>/);
  assert.match(copy, /data-share-topic="javascript">Copiar enlace del tema<\/button>/);
  assert.match(native, /<p class="saved-resource-feedback" data-share-feedback role="status" hidden><\/p>/);
  assert.match(native, /<div class="form-field share-fallback" data-share-fallback hidden>/);
  assert.match(native, /<label for="share-link">Enlace del tema<\/label>/);
  assert.match(
    native,
    /<input id="share-link" type="text" readonly value="https:\/\/ernestogufi\.github\.io\/ejercicios\/#\/item\/javascript" data-share-link>/,
  );
});

test("ShareControl escapes the topic id and the link", () => {
  const html = ShareControl({ topicId: '"><script>', url: 'https://example.com/?a="b"' });

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-share-topic="&quot;&gt;&lt;script&gt;"/);
  assert.match(html, /value="https:\/\/example\.com\/\?a=&quot;b&quot;"/);
});

test("the controller only listens to clicks and ignores other targets", async () => {
  const { document, shareService } = setup({ outcome: "shared", nativeFailed: false });

  assert.deepEqual(Object.keys(document.listeners), ["click"]);
  assert.equal(document.listeners.click.length, 1);
  await document.click({ closest: () => null });
  assert.equal(shareService.calls.length, 0);
});

test("without a share service the controller adds no listeners", () => {
  const document = createDocument();
  new ShareController({ document }).init();

  assert.deepEqual(document.listeners, {});
});

test("the click calls share() synchronously with the canonical topic data", async () => {
  const { document, shareService, button, feedback, fallback } = setup({ outcome: "shared", nativeFailed: false });
  let microtaskRan = false;
  queueMicrotask(() => {
    microtaskRan = true;
  });

  const clicked = document.click(button);

  assert.equal(microtaskRan, false);
  assert.deepEqual(shareService.calls, [
    {
      title: "JavaScript · Tech catálogo",
      text: "JavaScript: Lenguaje para crear interactividad en la web.",
      url: javascriptUrl,
    },
  ]);
  await clicked;
  assert.equal(feedback.hidden, false);
  assert.equal(feedback.dataset.feedbackState, "success");
  assert.equal(feedback.textContent, "Listo: enviamos «JavaScript» a la app que elegiste.");
  assert.equal(fallback.hidden, true);
});

test("the button stays disabled while the share is pending", async () => {
  let finish;
  const { shareService, button } = setup(() => new Promise((resolve) => {
    finish = resolve;
  }));
  const controller = new ShareController({ shareService, baseUrl: publishedRoot });

  const pending = controller.shareTopic(button);
  assert.equal(button.disabled, true);

  finish({ outcome: "cancelled", nativeFailed: false, errorName: "AbortError" });
  assert.equal(await pending, "cancelled");
  assert.equal(button.disabled, false);
});

test("cancelling is neutral and busy is reported without copying", async () => {
  const cancelled = setup({ outcome: "cancelled", nativeFailed: false, errorName: "AbortError" });
  await cancelled.document.click(cancelled.button);
  assert.equal(cancelled.feedback.dataset.feedbackState, "info");
  assert.equal(cancelled.feedback.textContent, "Cerraste el menú sin compartir. Puedes intentarlo cuando quieras.");
  assert.equal(cancelled.fallback.hidden, true);

  const busy = setup({ outcome: "busy", nativeFailed: false, errorName: "InvalidStateError" });
  await busy.document.click(busy.button);
  assert.equal(busy.feedback.textContent, "Ya hay un menú de compartir abierto.");
  assert.equal(busy.fallback.hidden, true);
});

test("copy messages depend on whether the native menu failed", async () => {
  const copied = setup({ outcome: "copied", nativeFailed: false }, { mode: "copy" });
  await copied.document.click(copied.button);
  assert.equal(copied.feedback.dataset.feedbackState, "success");
  assert.equal(
    copied.feedback.textContent,
    "Copiamos el enlace de «JavaScript» al portapapeles. Pégalo en el chat o correo que quieras.",
  );
  assert.equal(copied.button.textContent, "Copiar enlace del tema");

  const afterFailure = setup({ outcome: "copied", nativeFailed: true, errorName: "NotAllowedError" });
  await afterFailure.document.click(afterFailure.button);
  assert.equal(
    afterFailure.feedback.textContent,
    "No se pudo abrir el menú para compartir; copiamos el enlace de «JavaScript» al portapapeles.",
  );
  assert.equal(afterFailure.button.textContent, "Compartir tema");
});

test("manual copy shows the fallback field, focuses it and selects the link", async () => {
  const { document, button, feedback, fallback, link } = setup({ outcome: "manual", nativeFailed: false }, { mode: "copy" });

  await document.click(button);

  assert.equal(fallback.hidden, false);
  assert.equal(link.value, javascriptUrl);
  assert.equal(link.focusCalls, 1);
  assert.equal(link.selectCalls, 1);
  assert.equal(feedback.textContent, SHARE_MESSAGES.manual());
  assert.match(feedback.textContent, /Ctrl\+C \(⌘C en Mac\)/);
});

test("a later successful copy hides the manual fallback again", async () => {
  let outcome = "manual";
  const { document, button, fallback } = setup(() => Promise.resolve({ outcome, nativeFailed: false }), { mode: "copy" });

  await document.click(button);
  assert.equal(fallback.hidden, false);
  outcome = "copied";
  await document.click(button);
  assert.equal(fallback.hidden, true);
});

test("the label follows the mode detected on each click", async () => {
  const { document, shareService, button } = setup({ outcome: "copied", nativeFailed: false });
  shareService.mode = "copy";

  await document.click(button);

  assert.equal(button.textContent, "Copiar enlace del tema");
});

test("unknown topics and detached buttons do not show feedback", async () => {
  const unknown = setup({ outcome: "shared", nativeFailed: false }, { topicId: "cobol" });
  await unknown.document.click(unknown.button);
  assert.equal(unknown.shareService.calls.length, 0);
  assert.equal(unknown.feedback.hidden, true);

  const detached = setup({ outcome: "shared", nativeFailed: false });
  detached.button.isConnected = false;
  await detached.document.click(detached.button);
  assert.equal(detached.shareService.calls.length, 1);
  assert.equal(detached.feedback.hidden, true);
  assert.equal(detached.button.disabled, false);
});

test("with the real service and ?sin-share the canonical link reaches the clipboard", async () => {
  const copiedTexts = [];
  const navigatorObject = {
    share: async () => assert.fail("share() must not run with ?sin-share"),
    clipboard: { writeText: async (text) => copiedTexts.push(text) },
  };
  const document = createDocument();
  const shareService = createShareService({ navigatorObject, search: "?sin-share" });
  const { button, feedback } = createControl();
  new ShareController({ document, shareService, baseUrl: `${publishedRoot}?sin-share` }).init();

  await document.click(button);

  assert.deepEqual(copiedTexts, [javascriptUrl]);
  assert.match(feedback.textContent, /^Copiamos el enlace de «JavaScript»/);
});

test("with the real service and no clipboard the result is manual copy", async () => {
  const document = createDocument();
  const shareService = createShareService({ navigatorObject: {} });
  const { button, fallback, link } = createControl();
  new ShareController({ document, shareService, baseUrl: publishedRoot }).init();

  await document.click(button);

  assert.equal(fallback.hidden, false);
  assert.equal(link.selectCalls, 1);
  assert.equal(button.textContent, "Copiar enlace del tema");
});

test("focus returns to the share button after the native menu closes", async () => {
  const { button } = createControl();
  const document = createDocument();
  document.activeElement = button;
  button.focusCalls = 0;
  button.focus = function focus() { this.focusCalls += 1; };
  const controller = new ShareController({ document, shareService: createFakeService({ outcome: "cancelled", nativeFailed: false }), baseUrl: publishedRoot });

  await controller.shareTopic(button);

  assert.equal(button.focusCalls, 1);
});
