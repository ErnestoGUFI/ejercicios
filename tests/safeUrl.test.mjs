import test from "node:test";
import assert from "node:assert/strict";

import safeUrl from "../src/utils/safeUrl.js";

test("safeUrl allows web links and rejects unsafe protocols", () => {
  assert.equal(safeUrl("https://developer.mozilla.org/"), "https://developer.mozilla.org/");
  assert.equal(safeUrl("http://example.com/guide"), "http://example.com/guide");
  assert.equal(safeUrl("javascript:alert(1)"), "#");
  assert.equal(safeUrl("not a url"), "#");
});
