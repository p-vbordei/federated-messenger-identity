import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContactMap } from "./contact-map.ts";
import type { Contact } from "./types.ts";

const CONTACTS: Contact[] = [
  {
    id: "alice",
    displayName: "Alice Anderson",
    handles: [
      { channel: "whatsapp", handle: "+1 (234) 567-0001" },
      { channel: "email", handle: "Alice@Example.COM" },
      { channel: "telegram", handle: "@alice_a" },
    ],
  },
  {
    id: "bob",
    displayName: "Bob Baker",
    handles: [
      { channel: "signal", handle: "+1-234-567-0002" },
      { channel: "slack", handle: "T0:UBOB" },
      { channel: "discord", handle: "bob#1111" },
    ],
  },
  {
    id: "carol",
    displayName: "Carol Chen",
    handles: [
      { channel: "imessage", handle: "Carol@apple.com" },
      { channel: "matrix", handle: "@Carol:Server.com" },
      { channel: "email", handle: "carol@work.io" },
      { channel: "telegram", handle: "carol_c" },
    ],
  },
  {
    id: "dan",
    displayName: "Dan Diaz",
    handles: [
      { channel: "whatsapp", handle: "1234567004" },
      { channel: "email", handle: "dan@d.io" },
      { channel: "slack", handle: "T0:UDAN" },
    ],
  },
  {
    id: "eve",
    displayName: "Eve Edwards",
    handles: [
      { channel: "discord", handle: "Eve#7777" },
      { channel: "telegram", handle: "@eve_e" },
      { channel: "email", handle: "eve@e.org" },
    ],
  },
];

function build(owner: string): ContactMap {
  const m = ContactMap.empty(owner);
  for (const c of CONTACTS) m.add(c);
  return m;
}

describe("scenarios", () => {
  it("builds 5 contacts with 3+ handles and resolves each handle back to its contact", () => {
    const m = build("user:vlad");
    assert.equal(m.list().length, 5);
    for (const c of CONTACTS) {
      assert.ok(c.handles.length >= 3, `${c.id} should have >=3 handles`);
      for (const h of c.handles) {
        const resolved = m.resolve({ channel: h.channel, handle: h.handle });
        assert.equal(
          resolved?.id,
          c.id,
          `expected handle ${h.channel}:${h.handle} to resolve to ${c.id}, got ${resolved?.id ?? "null"}`,
        );
      }
    }
  });

  it("resolves with un-normalised lookups (the whole point of normalisation)", () => {
    const m = build("user:vlad");
    assert.equal(m.resolve({ channel: "WHATSAPP", handle: "234.567.0001" /* missing leading 1 */ })?.id, undefined);
    assert.equal(m.resolve({ channel: "WhatsApp", handle: "+1 234 567 0001" })?.id, "alice");
    assert.equal(m.resolve({ channel: "Email", handle: "  ALICE@EXAMPLE.com " })?.id, "alice");
    assert.equal(m.resolve({ channel: "discord", handle: "EVE#0000" })?.id, "eve");
    assert.equal(m.resolve({ channel: "matrix", handle: "@carol:server.com" })?.id, "carol");
  });

  it("merging laptop + phone maps (same owner): no duplicate handles", () => {
    const laptop = build("user:vlad");

    // The phone has the same base contacts (created independently) plus a new contact
    // and a few extra/alternate handles for existing contacts that should dedupe.
    const phone = ContactMap.empty("user:vlad");
    for (const c of CONTACTS) phone.add(c);
    // Re-add the same handles in different (un-normalised) shapes — should dedupe on merge.
    phone.addHandle("alice", { channel: "WhatsApp", handle: "+1-234-567-0001" });
    phone.addHandle("alice", { channel: "email", handle: "ALICE@example.com" });
    phone.addHandle("bob", { channel: "discord", handle: "Bob#2222" }); // same after strip+lower
    // Truly new handle on phone:
    phone.addHandle("alice", { channel: "slack", handle: "T9:UALICE" });
    // Brand new contact only on phone:
    phone.add({
      id: "frank",
      displayName: "Frank Foster",
      handles: [
        { channel: "email", handle: "frank@f.com" },
        { channel: "telegram", handle: "@frank_f" },
        { channel: "whatsapp", handle: "+10000000006" },
      ],
    });

    laptop.merge(phone);

    // 6 contacts total.
    assert.equal(laptop.list().length, 6);

    // No duplicate (channel, handle) pairs on any contact.
    for (const c of laptop.list()) {
      const seen = new Set<string>();
      for (const h of c.handles) {
        const key = `${h.channel}::${h.handle}`;
        assert.ok(!seen.has(key), `duplicate ${key} on ${c.id}`);
        seen.add(key);
      }
    }

    // Alice picked up the new slack handle.
    const alice = laptop.list().find((c) => c.id === "alice")!;
    assert.ok(alice.handles.some((h) => h.channel === "slack" && h.handle === "t9:ualice"));

    // Frank is present.
    assert.ok(laptop.list().some((c) => c.id === "frank"));

    // Owner preserved.
    assert.equal(laptop.toJson().ownerKey, "user:vlad");
  });
});
