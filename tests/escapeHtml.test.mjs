import test from "node:test";
import assert from "node:assert/strict";

import escapeHtml from "../src/utils/escapeHtml.js";

test("escapeHtml keeps persisted text from becoming markup", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});
