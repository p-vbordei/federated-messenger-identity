import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContactMap } from "./contact-map.ts";
import { normalizeHandle } from "./normalize.ts";

describe("normalize", () => {
  it("normalises whatsapp to E.164", () => {
    assert.equal(normalizeHandle("whatsapp", "+1 (234) 567-890"), "+1234567890");
    assert.equal(normalizeHandle("whatsapp", "1234567890"), "+1234567890");
  });
  it("strips telegram @", () => {
    assert.equal(normalizeHandle("telegram", "@alice_t"), "alice_t");
  });
  it("strips discord discriminator", () => {
    assert.equal(normalizeHandle("discord", "alice#1234"), "alice");
  });
  it("lowercases imessage", () => {
    assert.equal(normalizeHandle("imessage", "Alice@Apple.COM"), "alice@apple.com");
  });
});

describe("ContactMap", () => {
  it("resolves a handle to a contact", () => {
    const m = ContactMap.empty("user:vlad");
    m.add({
      id: "alice",
      displayName: "Alice Example",
      handles: [
        { channel: "whatsapp", handle: "+1234567890" },
        { channel: "slack", handle: "T0XYZ:U0ABC" },
      ],
    });
    const found = m.resolve({ channel: "whatsapp", handle: "+1 (234) 567-890" });
    assert.equal(found?.id, "alice");
    const found2 = m.resolve({ channel: "slack", handle: "T0xyz:u0abc" });
    assert.equal(found2?.id, "alice");
  });

  it("returns null when not resolvable", () => {
    const m = ContactMap.empty("user:vlad");
    assert.equal(m.resolve({ channel: "telegram", handle: "ghost" }), null);
  });

  it("forward-looks-up a handle", () => {
    const m = ContactMap.empty("user:vlad");
    m.add({
      id: "alice",
      displayName: "Alice",
      handles: [
        { channel: "imessage", handle: "alice@personal.com", label: "personal" },
        { channel: "imessage", handle: "alice@work.com", label: "work" },
      ],
    });
    assert.equal(m.handle("alice", "imessage", "work"), "alice@work.com");
    assert.equal(m.handle("alice", "imessage", "personal"), "alice@personal.com");
    assert.equal(m.handle("alice", "imessage"), "alice@personal.com"); // first match
  });

  it("merges two maps", () => {
    const a = ContactMap.empty("u");
    a.add({ id: "alice", displayName: "Alice", handles: [{ channel: "slack", handle: "T:U1" }] });
    const b = ContactMap.empty("u");
    b.add({ id: "alice", displayName: "Alice", handles: [{ channel: "telegram", handle: "@alice" }] });
    a.merge(b);
    const alice = a.list().find((c) => c.id === "alice")!;
    assert.equal(alice.handles.length, 2);
  });

  it("refuses duplicate contacts", () => {
    const m = ContactMap.empty("u");
    m.add({ id: "x", displayName: "X", handles: [] });
    assert.throws(() => m.add({ id: "x", displayName: "X again", handles: [] }));
  });
});
