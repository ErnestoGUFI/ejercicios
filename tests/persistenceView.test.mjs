import test from "node:test";
import assert from "node:assert/strict";

import PersistenceView from "../src/views/PersistenceView.js";

test("PersistenceView shows all three current values and independent clear actions", () => {
  const persistence = {
    getSnapshot: () => ({
      theme: "dark",
      newsSearch: "javascript",
      visits: 4,
    }),
  };

  const html = PersistenceView({}, persistence);

  assert.match(html, /Persistencia/);
  assert.match(html, /localStorage/);
  assert.match(html, /Oscuro/);
  assert.match(html, /sessionStorage/);
  assert.match(html, /javascript/);
  assert.match(html, /Cookie/);
  assert.match(html, /4 aperturas/);
  assert.match(html, /data-clear-persistence="theme"/);
  assert.match(html, /data-clear-persistence="news-search"/);
  assert.match(html, /data-clear-persistence="visits"/);
});
