import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContactMap } from "./contact-map.ts";
import { normalizeHandle, normalizeChannel } from "./normalize.ts";

describe("normalize (edge cases)", () => {
  it("whatsapp: variants canonicalise to +1234567890", () => {
    assert.equal(normalizeHandle("whatsapp", "+1 234.567.890"), "+1234567890");
    assert.equal(normalizeHandle("whatsapp", "1234567890"), "+1234567890");
    assert.equal(normalizeHandle("whatsapp", "+1-234-567-890"), "+1234567890");
    assert.equal(normalizeHandle("whatsapp", "+1 (234) 567-890"), "+1234567890");
  });

  it("signal: behaves like whatsapp for E.164", () => {
    assert.equal(normalizeHandle("signal", "+1-234-567-890"), "+1234567890");
    assert.equal(normalizeHandle("signal", "1234567890"), "+1234567890");
  });

  it("email: trims whitespace + lowercases", () => {
    assert.equal(normalizeHandle("email", "  Alice@Example.COM  "), "alice@example.com");
    assert.equal(normalizeHandle("email", "\tBob@HOST.io\n"), "bob@host.io");
  });

  it("telegram: leading @ stripped, case preserved (current impl)", () => {
    assert.equal(normalizeHandle("telegram", "@Alice_T"), "Alice_T");
    assert.equal(normalizeHandle("telegram", "Alice_T"), "Alice_T");
    // No lowercasing — documents current behaviour.
    assert.notEqual(normalizeHandle("telegram", "@Alice"), "alice");
  });

  it("slack: T0:U1 / t0:u1 / 'T0:U1\\n' all normalise to t0:u1", () => {
    assert.equal(normalizeHandle("slack", "T0:U1"), "t0:u1");
    assert.equal(normalizeHandle("slack", "t0:u1"), "t0:u1");
    assert.equal(normalizeHandle("slack", "T0:U1\n"), "t0:u1");
  });

  it("matrix: @User:Server.com -> @user:server.com", () => {
    assert.equal(normalizeHandle("matrix", "@User:Server.com"), "@user:server.com");
  });

  it("discord: alice#1234 -> alice; alice stays alice", () => {
    assert.equal(normalizeHandle("discord", "alice#1234"), "alice");
    assert.equal(normalizeHandle("discord", "alice"), "alice");
    // Mixed case is lowercased too.
    assert.equal(normalizeHandle("discord", "Alice#9999"), "alice");
  });

  it("unknown channel: returned as-is after trim", () => {
    assert.equal(normalizeHandle("myspace", "  CoolDude_42 "), "CoolDude_42");
  });

  it("normalizeChannel lowercases + trims", () => {
    assert.equal(normalizeChannel(" WhatsApp "), "whatsapp");
  });
});

describe("ContactMap (edge cases)", () => {
  it("empty(owner) produces correct spec / owner / empty contacts", () => {
    const m = ContactMap.empty("user:vlad").toJson();
    assert.equal(m.spec, "federated-messenger-identity/0.1");
    assert.equal(m.ownerKey, "user:vlad");
    assert.deepEqual(m.contacts, []);
    assert.equal(typeof m.createdAt, "string");
    assert.equal(typeof m.updatedAt, "string");
  });

  it("add rejects duplicates by id", () => {
    const m = ContactMap.empty("u");
    m.add({ id: "x", displayName: "X", handles: [] });
    assert.throws(() => m.add({ id: "x", displayName: "X2", handles: [] }), /already exists/);
  });

  it("addHandle is idempotent on normalised equality", () => {
    const m = ContactMap.empty("u");
    m.add({ id: "a", displayName: "A", handles: [] });
    m.addHandle("a", { channel: "whatsapp", handle: "+1 (234) 567-890" });
    m.addHandle("a", { channel: "whatsapp", handle: "1234567890" });
    m.addHandle("a", { channel: "WhatsApp", handle: "+1-234-567-890" });
    const handles = m.toJson().contacts[0]!.handles;
    assert.equal(handles.length, 1);
    assert.equal(handles[0]!.handle, "+1234567890");
    assert.equal(handles[0]!.channel, "whatsapp");
  });

  it("removeHandle is idempotent (safe to call twice)", () => {
    const m = ContactMap.empty("u");
    m.add({
      id: "a", displayName: "A",
      handles: [{ channel: "email", handle: "a@b.com" }],
    });
    m.removeHandle("a", "email", "A@B.COM");
    m.removeHandle("a", "email", "a@b.com"); // second call is no-op
    assert.equal(m.toJson().contacts[0]!.handles.length, 0);
  });

  it("resolve is case-insensitive for emails / e164-tolerant for phones", () => {
    const m = ContactMap.empty("u");
    m.add({
      id: "a", displayName: "A",
      handles: [
        { channel: "email", handle: "alice@host.com" },
        { channel: "whatsapp", handle: "+19998887777" },
      ],
    });
    assert.equal(m.resolve({ channel: "email", handle: "ALICE@HOST.COM" })?.id, "a");
    // E.164-tolerant: punctuation/whitespace stripped, leading + preserved.
    assert.equal(m.resolve({ channel: "whatsapp", handle: "+1 999-888-7777" })?.id, "a");
    assert.equal(m.resolve({ channel: "whatsapp", handle: "+1(999) 888.7777" })?.id, "a");
    // No leading + → one is prepended, so "19998887777" also matches "+19998887777".
    assert.equal(m.resolve({ channel: "whatsapp", handle: "19998887777" })?.id, "a");
    assert.equal(m.resolve({ channel: "EMAIL", handle: "alice@host.com" })?.id, "a");
  });

  it("handle: no label -> first match; label match -> labelled; label miss -> first match (current impl)", () => {
    const m = ContactMap.empty("u");
    m.add({
      id: "a", displayName: "A",
      handles: [
        { channel: "email", handle: "p@x.com", label: "personal" },
        { channel: "email", handle: "w@x.com", label: "work" },
      ],
    });
    assert.equal(m.handle("a", "email"), "p@x.com");
    assert.equal(m.handle("a", "email", "work"), "w@x.com");
    // Label miss: documents current behaviour — falls back to first match.
    assert.equal(m.handle("a", "email", "nonexistent-label"), "p@x.com");
    // Channel miss: null
    assert.equal(m.handle("a", "telegram"), null);
  });

  it("allHandles returns every handle on a channel (preserves labels)", () => {
    const m = ContactMap.empty("u");
    m.add({
      id: "a", displayName: "A",
      handles: [
        { channel: "email", handle: "a@b.com", label: "p" },
        { channel: "email", handle: "c@d.com", label: "w" },
        { channel: "telegram", handle: "@x" },
      ],
    });
    const emails = m.allHandles("a", "email");
    assert.equal(emails.length, 2);
    assert.deepEqual(emails.map((h) => h.label).sort(), ["p", "w"]);
  });

  it("merge preserves owner; merging different owners throws", () => {
    const a = ContactMap.empty("user:vlad");
    a.add({ id: "x", displayName: "X", handles: [] });
    const b = ContactMap.empty("user:vlad");
    b.add({ id: "y", displayName: "Y", handles: [] });
    a.merge(b);
    assert.equal(a.toJson().ownerKey, "user:vlad");
    assert.equal(a.list().length, 2);

    const c = ContactMap.empty("user:vlad");
    const d = ContactMap.empty("user:eve");
    assert.throws(() => c.merge(d), /owner/i);
  });

  it("find is case-insensitive substring on displayName", () => {
    const m = ContactMap.empty("u");
    m.add({ id: "a1", displayName: "Alice Anderson", handles: [] });
    m.add({ id: "a2", displayName: "alice baker", handles: [] });
    m.add({ id: "b", displayName: "Bob", handles: [] });
    const hits = m.find("ALICE").map((c) => c.id).sort();
    assert.deepEqual(hits, ["a1", "a2"]);
    assert.equal(m.find("son").length, 1);
    assert.equal(m.find("nobody").length, 0);
  });

  it("list(group) filters by group label", () => {
    const m = ContactMap.empty("u");
    m.add({ id: "a", displayName: "A", handles: [], groups: ["family"] });
    m.add({ id: "b", displayName: "B", handles: [], groups: ["work"] });
    m.add({ id: "c", displayName: "C", handles: [], groups: ["family", "work"] });
    m.add({ id: "d", displayName: "D", handles: [] });
    assert.deepEqual(m.list("family").map((c) => c.id).sort(), ["a", "c"]);
    assert.deepEqual(m.list("work").map((c) => c.id).sort(), ["b", "c"]);
    assert.equal(m.list().length, 4);
    assert.equal(m.list("ghost").length, 0);
  });

  it("ContactMap.open(path) round-trip: write -> read -> equal", async () => {
    const path = join(tmpdir(), `fmi-roundtrip-${process.pid}-${Date.now()}.json`);
    try {
      const a = ContactMap.empty("user:vlad");
      a.add({
        id: "alice",
        displayName: "Alice",
        notes: "test note",
        primaryChannel: "email",
        groups: ["friends"],
        handles: [
          { channel: "email", handle: "alice@x.com", label: "personal", verifiedAt: "2026-01-01T00:00:00Z" },
          { channel: "telegram", handle: "@Alice_T" },
        ],
      });
      await a.save(path);
      const b = await ContactMap.open(path);
      const aJson = a.toJson();
      const bJson = b.toJson();
      assert.deepEqual(bJson.contacts, aJson.contacts);
      assert.equal(bJson.ownerKey, aJson.ownerKey);
      assert.equal(bJson.spec, aJson.spec);
    } finally {
      await fs.rm(path, { force: true });
    }
  });

  it("serialisation preserves verifiedAt, label, and groups", async () => {
    const path = join(tmpdir(), `fmi-serial-${process.pid}-${Date.now()}.json`);
    try {
      const m = ContactMap.empty("u");
      m.add({
        id: "a",
        displayName: "A",
        groups: ["g1", "g2"],
        handles: [
          { channel: "email", handle: "a@b.com", label: "main", verifiedAt: "2026-05-24T00:00:00Z" },
        ],
      });
      await m.save(path);
      const raw = JSON.parse(await fs.readFile(path, "utf8"));
      const h = raw.contacts[0].handles[0];
      assert.equal(h.label, "main");
      assert.equal(h.verifiedAt, "2026-05-24T00:00:00Z");
      assert.deepEqual(raw.contacts[0].groups, ["g1", "g2"]);
    } finally {
      await fs.rm(path, { force: true });
    }
  });

  it("fromJson rejects an unsupported spec", () => {
    assert.throws(
      () => ContactMap.fromJson({ spec: "bogus/9.9" } as never),
      /Unsupported spec/,
    );
  });
});
