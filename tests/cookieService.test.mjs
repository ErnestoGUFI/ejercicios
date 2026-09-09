import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteCookie,
  getCookie,
  setCookie,
} from "../src/services/CookieService.js";

function createCookieDocument() {
  const values = new Map();
  const writes = [];

  return {
    writes,
    get cookie() {
      return [...values.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
    set cookie(cookie) {
      writes.push(cookie);
      const [pair] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (/Max-Age=0/.test(cookie)) values.delete(name);
      else values.set(name, value);
    },
  };
}

test("setCookie stores an encoded value with an explicit expiration", () => {
  const cookieDocument = createCookieDocument();

  assert.equal(setCookie("visits", "2 visits", 30, cookieDocument), true);
  assert.equal(getCookie("visits", cookieDocument), "2 visits");
  assert.match(cookieDocument.writes[0], /Expires=/);
  assert.match(cookieDocument.writes[0], /SameSite=Lax/);
});

test("deleteCookie removes only the requested cookie", () => {
  const cookieDocument = createCookieDocument();
  setCookie("visits", "3", 30, cookieDocument);
  setCookie("another", "kept", 30, cookieDocument);

  assert.equal(deleteCookie("visits", cookieDocument), true);
  assert.equal(getCookie("visits", cookieDocument), null);
  assert.equal(getCookie("another", cookieDocument), "kept");
  assert.match(cookieDocument.writes.at(-1), /Max-Age=0/);
});

test("cookie helpers fail in a controlled way when cookies are unavailable", () => {
  const warnings = [];
  const cookieDocument = {
    get cookie() {
      throw new Error("cookies disabled");
    },
    set cookie(_value) {
      throw new Error("cookies disabled");
    },
  };

  assert.equal(setCookie("visits", "1", 30, cookieDocument, warnings.push.bind(warnings)), false);
  assert.equal(getCookie("visits", cookieDocument, warnings.push.bind(warnings)), null);
  assert.equal(deleteCookie("visits", cookieDocument, warnings.push.bind(warnings)), false);
  assert.deepEqual(warnings, ["guardar", "leer", "eliminar"]);
});

test("setCookie reports when the browser silently rejects a cookie", () => {
  const warnings = [];
  const cookieDocument = {
    get cookie() {
      return "";
    },
    set cookie(_value) {},
  };

  assert.equal(
    setCookie("visits", "1", 30, cookieDocument, warnings.push.bind(warnings)),
    false,
  );
  assert.deepEqual(warnings, ["guardar"]);
});

test("deleteCookie reports when the browser silently keeps a cookie", () => {
  const warnings = [];
  const cookieDocument = {
    get cookie() {
      return "visits=1";
    },
    set cookie(_value) {},
  };

  assert.equal(
    deleteCookie("visits", cookieDocument, warnings.push.bind(warnings)),
    false,
  );
  assert.deepEqual(warnings, ["eliminar"]);
});
