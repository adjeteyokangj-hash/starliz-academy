import test from "node:test";
import assert from "node:assert/strict";

import {
  getProfile,
  hydrateProfilesFromServer,
  saveProfiles,
  setActiveProfileId,
} from "../src/lib/store";

test("hydrateProfilesFromServer keeps cache when /api/children fails after refresh retry", async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

  const memory = new Map<string, string>();
  const localStorageStub: Storage = {
    get length() {
      return memory.size;
    },
    clear() {
      memory.clear();
    },
    getItem(key) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    key(index) {
      return [...memory.keys()][index] ?? null;
    },
    removeItem(key) {
      memory.delete(key);
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
  };

  (globalThis as { window: unknown }).window = {
    localStorage: localStorageStub,
    dispatchEvent() {
      return true;
    },
  };
  (globalThis as { localStorage: Storage }).localStorage = localStorageStub;
  if (typeof (globalThis as { Event?: unknown }).Event !== "function") {
    (globalThis as { Event: new (type: string) => { type: string } }).Event = class Event {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };
  }

  saveProfiles([
    {
      id: "child-1",
      name: "Ada",
      avatar: "star",
    } as never,
  ]);
  setActiveProfileId("child-1");

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const result = await hydrateProfilesFromServer();
    assert.equal(result, "ok");
    assert.equal(getProfile()?.id, "child-1");
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window: unknown }).window = originalWindow;
    }
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      (globalThis as { localStorage: Storage }).localStorage = originalLocalStorage;
    }
    globalThis.fetch = originalFetch;
  }
});
