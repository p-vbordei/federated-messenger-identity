import { ContactMap } from "./src/contact-map.ts";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { promises as fs } from "node:fs";

async function run() {
  const id1 = await generateIdentity();
  const id2 = await generateIdentity();
  const r1 = await identityToRecipient(id1);
  const r2 = await identityToRecipient(id2);

  const testFile = `./test-bug.fmi.json.age`;

  const map = ContactMap.empty("owner");
  map.add({ id: "bob", displayName: "Bob", handles: [] });
  await map.saveEncrypted(testFile, [r1, r2]);

  // Read with only id1
  const loaded1 = await ContactMap.openEncrypted(testFile, [id1]);
  // Add a handle
  loaded1.addHandle("bob", { channel: "slack", handle: "b" });
  // Save (should preserve r2)
  await loaded1.save(testFile);

  // Read with id2. If r2 was stripped, this will fail!
  try {
    await ContactMap.openEncrypted(testFile, [id2]);
    console.log("SUCCESS: r2 was preserved");
  } catch (e) {
    console.error("FAIL: r2 was stripped!", (e as Error).message);
  }

  await fs.unlink(testFile);
}

run().catch(console.error);
