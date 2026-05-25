import { test } from "node:test";
import assert from "node:assert/strict";
import { ContactMap } from "./contact-map.ts";
import { exportDelta, importDelta } from "./sync.ts";
import { generateIdentity, identityToRecipient } from "age-encryption";

test("Sync: export and import deltas with age encryption", async () => {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);

  const map1 = ContactMap.empty("shared-owner");
  const map2 = ContactMap.empty("shared-owner");

  // Step 1: Add a contact to map1
  const t0 = new Date().toISOString();
  map1.add({
    id: "alice",
    displayName: "Alice",
    handles: [{ channel: "whatsapp", handle: "+1" }],
    updatedAt: t0,
  });

  // Step 2: Export delta from map1
  // We export since 1970 to get all changes
  const encryptedDelta = await exportDelta(map1, "1970-01-01T00:00:00Z", [recipient]);

  // Step 3: Import delta into map2
  const result = await importDelta(map2, encryptedDelta, [identity]);
  assert.equal(result.mergedCount, 1);
  assert.equal(map2.list().length, 1);
  assert.equal(map2.list()[0]?.id, "alice");
  assert.equal(map2.handle("alice", "whatsapp"), "+1");
});

test("Sync: conflict resolution (last-writer-wins)", async () => {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);

  const map1 = ContactMap.empty("shared-owner");
  const map2 = ContactMap.empty("shared-owner");

  const now = Date.now();
  const timeOld = new Date(now - 10000).toISOString();
  const timeNew = new Date(now).toISOString();

  // Map1 has an older update
  map1.add({
    id: "alice",
    displayName: "Alice Old",
    handles: [{ channel: "whatsapp", handle: "+1" }],
    updatedAt: timeOld,
  });

  // Map2 has a newer update
  map2.add({
    id: "alice",
    displayName: "Alice New",
    handles: [{ channel: "whatsapp", handle: "+2" }],
    updatedAt: timeNew,
  });

  // Import older Map1 changes into newer Map2 -> Map2 should NOT be overwritten
  const delta1 = await exportDelta(map1, "1970-01-01T00:00:00Z", [recipient]);
  await importDelta(map2, delta1, [identity]);
  assert.equal(map2.list().find((c) => c.id === "alice")?.displayName, "Alice New");
  assert.equal(map2.handle("alice", "whatsapp"), "+2");

  // Import newer Map2 changes into older Map1 -> Map1 SHOULD be overwritten
  const delta2 = await exportDelta(map2, "1970-01-01T00:00:00Z", [recipient]);
  await importDelta(map1, delta2, [identity]);
  assert.equal(map1.list().find((c) => c.id === "alice")?.displayName, "Alice New");
  assert.equal(map1.handle("alice", "whatsapp"), "+2");
});
