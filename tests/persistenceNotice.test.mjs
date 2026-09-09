import test from "node:test";
import assert from "node:assert/strict";

import showPersistenceWarning from "../src/components/PersistenceNotice.js";

test("showPersistenceWarning displays a non-blocking storage notice", () => {
  const notice = { hidden: true, textContent: "" };

  showPersistenceWarning(notice, "localStorage");

  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /seguirá funcionando/i);
  assert.match(notice.textContent, /localStorage/);
});
