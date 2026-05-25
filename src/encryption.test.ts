import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { ContactMap } from "./contact-map.ts";
import { generateIdentity, identityToRecipient } from "age-encryption";

test("Encryption: round-trip encrypted open/save", async () => {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);

  const map = ContactMap.empty("test-owner");
  map.add({
    id: "alice",
    displayName: "Alice",
    handles: [{ channel: "whatsapp", handle: "+1234567890" }],
  });

  const testFile = `./test-encrypted-${Date.now()}.fmi.json.age`;
  try {
    // Save encrypted
    await map.saveEncrypted(testFile, [recipient]);

    // Open encrypted with valid identity
    const loaded = await ContactMap.openEncrypted(testFile, [identity]);
    assert.equal(loaded.toJson().ownerKey, "test-owner");
    
    const alice = loaded.list().find((c) => c.id === "alice");
    assert.ok(alice);
    assert.equal(alice.displayName, "Alice");

    // Add handle and save (should automatically re-encrypt)
    loaded.addHandle("alice", { channel: "slack", handle: "T0:U0" });
    await loaded.save(testFile);

    // Verify it is re-encrypted by reopening
    const reloaded = await ContactMap.openEncrypted(testFile, [identity]);
    const aliceUpdated = reloaded.list().find((c) => c.id === "alice");
    assert.ok(aliceUpdated);
    assert.equal(reloaded.handle("alice", "slack"), "t0:u0");

  } finally {
    try {
      await fs.unlink(testFile);
    } catch {
      // ignore
    }
  }
});

test("Encryption: decrypt fails with wrong identity", async () => {
  const identity1 = await generateIdentity();
  const identity2 = await generateIdentity();
  const recipient1 = await identityToRecipient(identity1);

  const map = ContactMap.empty("test-owner");
  const testFile = `./test-encrypted-fail-${Date.now()}.fmi.json.age`;

  try {
    await map.saveEncrypted(testFile, [recipient1]);

    // Open with wrong identity should throw
    await assert.rejects(async () => {
      await ContactMap.openEncrypted(testFile, [identity2]);
    });
  } finally {
    try {
      await fs.unlink(testFile);
    } catch {
      // ignore
    }
  }
});

test("Encryption: multi-recipient support", async () => {
  const id1 = await generateIdentity();
  const id2 = await generateIdentity();
  const r1 = await identityToRecipient(id1);
  const r2 = await identityToRecipient(id2);

  const map = ContactMap.empty("test-owner");
  map.add({ id: "bob", displayName: "Bob", handles: [] });

  const testFile = `./test-encrypted-multi-${Date.now()}.fmi.json.age`;

  try {
    // Encrypt to both recipients
    await map.saveEncrypted(testFile, [r1, r2]);

    // Can decrypt with id1
    const loaded1 = await ContactMap.openEncrypted(testFile, [id1]);
    assert.equal(loaded1.list()[0]?.id, "bob");

    // Can decrypt with id2
    const loaded2 = await ContactMap.openEncrypted(testFile, [id2]);
    assert.equal(loaded2.list()[0]?.id, "bob");
  } finally {
    try {
      await fs.unlink(testFile);
    } catch {
      // ignore
    }
  }
});
