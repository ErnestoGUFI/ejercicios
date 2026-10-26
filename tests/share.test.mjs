import test from "node:test";
import assert from "node:assert/strict";

import { items } from "../src/data/items.js";
import { PWA_CONFIG } from "../src/pwa/config.js";
import { buildTopicShareData, createShareService, readShareFlags } from "../src/pwa/share.js";

const publishedRoot = "https://ernestogufi.github.io/ejercicios/";
const javascript = items.find((item) => item.id === "javascript");
const shareData = buildTopicShareData(javascript, publishedRoot);

function createNavigator({ share = async () => {}, canShare, writeText = async () => {} } = {}) {
  const calls = { share: [], canShare: [], writeText: [], receivers: [] };
  const navigatorObject = { calls };

  if (share) {
    navigatorObject.share = function (data) {
      calls.share.push(data);
      calls.receivers.push(this);
      return share(data);
    };
  }
  if (canShare) {
    navigatorObject.canShare = (data) => {
      calls.canShare.push(data);
      return canShare(data);
    };
  }
  if (writeText) {
    navigatorObject.clipboard = {
      writeText(text) {
        calls.writeText.push(text);
        return writeText(text);
      },
    };
  }
  return navigatorObject;
}

function rejectWith(name) {
  return async () => {
    throw new DOMException("", name);
  };
}

test("readShareFlags reads ?sin-share and ?sin-portapapeles", () => {
  assert.deepEqual(readShareFlags(""), { nativeDisabled: false, clipboardDisabled: false });
  assert.deepEqual(readShareFlags("?sin-share"), { nativeDisabled: true, clipboardDisabled: false });
  assert.deepEqual(readShareFlags("?sin-portapapeles"), { nativeDisabled: false, clipboardDisabled: true });
  assert.deepEqual(readShareFlags("?sin-share&sin-portapapeles"), { nativeDisabled: true, clipboardDisabled: true });
  assert.deepEqual(readShareFlags("?sin-sync"), { nativeDisabled: false, clipboardDisabled: false });
  assert.deepEqual(readShareFlags(), { nativeDisabled: false, clipboardDisabled: false });
});

test("the share data points to the canonical topic link", () => {
  assert.deepEqual(shareData, {
    title: "JavaScript · Tech catálogo",
    text: "JavaScript: Lenguaje para crear interactividad en la web.",
    url: "https://ernestogufi.github.io/ejercicios/#/item/javascript",
  });
  assert.equal(buildTopicShareData(javascript).url, new URL("#/item/javascript", PWA_CONFIG.baseUrl).href);
  assert.equal(
    buildTopicShareData({ id: "c#/x", name: "C#", description: "Lenguaje." }, publishedRoot).url,
    "https://ernestogufi.github.io/ejercicios/#/item/c%23%2Fx",
  );
});

test("the shared link never carries the test flags or the current address", () => {
  const hadLocation = "location" in globalThis;
  const previousLocation = globalThis.location;
  globalThis.location = { href: `${publishedRoot}?sin-share&timeout-ubicacion#/item/python` };

  try {
    const data = buildTopicShareData(javascript, `${publishedRoot}?sin-share&sin-portapapeles&sin-sync&timeout-ubicacion`);
    assert.equal(data.url, "https://ernestogufi.github.io/ejercicios/#/item/javascript");
    assert.doesNotMatch(data.url, /sin-|timeout-ubicacion|python/);
  } finally {
    if (hadLocation) globalThis.location = previousLocation;
    else delete globalThis.location;
  }
});

test("getMode depends on navigator.share and ?sin-share, and is checked on every call", () => {
  const navigatorObject = createNavigator();
  const service = createShareService({ navigatorObject });

  assert.equal(service.getMode(), "native");
  delete navigatorObject.share;
  assert.equal(service.getMode(), "copy");
  navigatorObject.share = async () => {};
  assert.equal(service.getMode(), "native");

  assert.equal(createShareService({ navigatorObject, search: "?sin-share" }).getMode(), "copy");
  assert.equal(createShareService({ navigatorObject: createNavigator({ share: null }) }).getMode(), "copy");
  assert.equal(createShareService({ navigatorObject: undefined }).getMode(), "copy");
});

test("a resolved native share is reported as shared and copies nothing", async () => {
  const navigatorObject = createNavigator({ canShare: () => true });
  const service = createShareService({ navigatorObject });

  assert.deepEqual(await service.share(shareData), { outcome: "shared", nativeFailed: false });
  assert.deepEqual(navigatorObject.calls.canShare, [shareData]);
  assert.deepEqual(navigatorObject.calls.share, [shareData]);
  assert.equal(navigatorObject.calls.receivers[0], navigatorObject);
  assert.deepEqual(navigatorObject.calls.writeText, []);
});

test("share() is called synchronously, before the first microtask runs", async () => {
  const navigatorObject = createNavigator({ canShare: () => true });
  const service = createShareService({ navigatorObject });
  let microtaskRan = false;
  queueMicrotask(() => {
    microtaskRan = true;
  });

  const pending = service.share(shareData);

  assert.equal(navigatorObject.calls.share.length, 1);
  assert.equal(microtaskRan, false);
  await pending;
});

test("without Web Share, writeText() is also called before the first microtask", async () => {
  const navigatorObject = createNavigator({ share: null });
  const service = createShareService({ navigatorObject });
  let microtaskRan = false;
  queueMicrotask(() => {
    microtaskRan = true;
  });

  const pending = service.share(shareData);

  assert.deepEqual(navigatorObject.calls.writeText, [shareData.url]);
  assert.equal(microtaskRan, false);
  assert.deepEqual(await pending, { outcome: "copied", nativeFailed: false });
});

test("AbortError means the person cancelled: nothing is copied", async () => {
  const navigatorObject = createNavigator({ share: rejectWith("AbortError") });
  const service = createShareService({ navigatorObject });

  assert.deepEqual(await service.share(shareData), { outcome: "cancelled", nativeFailed: false, errorName: "AbortError" });
  assert.deepEqual(navigatorObject.calls.writeText, []);
});

test("InvalidStateError means a share menu is already open: nothing is copied", async () => {
  const navigatorObject = createNavigator({ share: rejectWith("InvalidStateError") });
  const service = createShareService({ navigatorObject });

  assert.deepEqual(await service.share(shareData), { outcome: "busy", nativeFailed: false, errorName: "InvalidStateError" });
  assert.deepEqual(navigatorObject.calls.writeText, []);
});

test("canShare() returning false skips share() and copies the link", async () => {
  const navigatorObject = createNavigator({ canShare: () => false });
  const service = createShareService({ navigatorObject });

  assert.deepEqual(await service.share(shareData), { outcome: "copied", nativeFailed: true });
  assert.equal(navigatorObject.calls.share.length, 0);
  assert.deepEqual(navigatorObject.calls.writeText, [shareData.url]);
});

test("without canShare() the native share is still attempted", async () => {
  const navigatorObject = createNavigator();
  const service = createShareService({ navigatorObject });

  assert.equal((await service.share(shareData)).outcome, "shared");
  assert.equal(navigatorObject.calls.share.length, 1);
});

test("other native errors fall back to copying only the URL", async () => {
  for (const name of ["NotAllowedError", "DataError", "TypeError"]) {
    const navigatorObject = createNavigator({ share: rejectWith(name) });
    const service = createShareService({ navigatorObject });

    assert.deepEqual(await service.share(shareData), { outcome: "copied", nativeFailed: true, errorName: name });
    assert.deepEqual(navigatorObject.calls.writeText, [shareData.url]);
  }

  const throwingCanShare = createNavigator({
    canShare: () => {
      throw new TypeError("Datos no válidos");
    },
  });
  const result = await createShareService({ navigatorObject: throwingCanShare }).share(shareData);
  assert.deepEqual(result, { outcome: "copied", nativeFailed: true, errorName: "TypeError" });
  assert.equal(throwingCanShare.calls.share.length, 0);
});

test("?sin-share copies the link even if navigator.share exists", async () => {
  const navigatorObject = createNavigator();
  const service = createShareService({ navigatorObject, search: "?sin-share" });

  assert.deepEqual(await service.share(shareData), { outcome: "copied", nativeFailed: false });
  assert.equal(navigatorObject.calls.share.length, 0);
  assert.deepEqual(navigatorObject.calls.writeText, ["https://ernestogufi.github.io/ejercicios/#/item/javascript"]);
});

test("a rejected or missing clipboard ends in manual copy", async () => {
  const rejected = createNavigator({ share: null, writeText: rejectWith("NotAllowedError") });
  assert.deepEqual(await createShareService({ navigatorObject: rejected }).share(shareData), {
    outcome: "manual",
    nativeFailed: false,
  });
  assert.equal(rejected.calls.writeText.length, 1);

  const missing = createNavigator({ share: null, writeText: null });
  assert.deepEqual(await createShareService({ navigatorObject: missing }).share(shareData), {
    outcome: "manual",
    nativeFailed: false,
  });

  const bothFail = createNavigator({ share: rejectWith("NotAllowedError"), writeText: rejectWith("NotAllowedError") });
  assert.deepEqual(await createShareService({ navigatorObject: bothFail }).share(shareData), {
    outcome: "manual",
    nativeFailed: true,
    errorName: "NotAllowedError",
  });
});

test("?sin-portapapeles goes to manual copy without calling writeText()", async () => {
  const navigatorObject = createNavigator();
  const service = createShareService({ navigatorObject, search: "?sin-share&sin-portapapeles" });

  assert.equal(service.getMode(), "copy");
  assert.deepEqual(await service.share(shareData), { outcome: "manual", nativeFailed: false });
  assert.equal(navigatorObject.calls.share.length, 0);
  assert.equal(navigatorObject.calls.writeText.length, 0);
});
