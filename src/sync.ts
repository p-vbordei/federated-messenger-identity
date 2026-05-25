import { ContactMap } from "./contact-map.ts";
import type { Contact } from "./types.ts";
import { Encrypter, Decrypter } from "age-encryption";

export interface SyncPackage {
  ownerKey: string;
  since: string;
  generatedAt: string;
  contacts: Contact[];
}

/**
 * Exports contacts updated since a specific ISO timestamp, encrypted for a list of recipients.
 */
export async function exportDelta(
  map: ContactMap,
  since: string,
  recipients: string[],
): Promise<Uint8Array> {
  const allContacts = map.list();
  const sinceTime = new Date(since).getTime();

  const updatedContacts = allContacts.filter((c) => {
    const updatedAt = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    return updatedAt > sinceTime;
  });

  const pkg: SyncPackage = {
    ownerKey: map.toJson().ownerKey,
    since,
    generatedAt: new Date().toISOString(),
    contacts: updatedContacts,
  };

  const jsonStr = JSON.stringify(pkg);
  const encrypter = new Encrypter();
  for (const r of recipients) {
    encrypter.addRecipient(r);
  }
  return await encrypter.encrypt(jsonStr);
}

/**
 * Decrypts a sync package and merges the contacts into the destination map using last-writer-wins conflict resolution.
 */
export async function importDelta(
  map: ContactMap,
  encryptedDelta: Uint8Array,
  identities: string[],
): Promise<{ mergedCount: number }> {
  const decrypter = new Decrypter();
  for (const id of identities) {
    decrypter.addIdentity(id);
  }
  const decryptedJson = await decrypter.decrypt(encryptedDelta, "text");
  const pkg = JSON.parse(decryptedJson) as SyncPackage;

  if (pkg.ownerKey !== map.toJson().ownerKey) {
    throw new Error(
      `Cannot import delta with different owner: ${map.toJson().ownerKey} vs ${pkg.ownerKey}`,
    );
  }

  const tempMap = ContactMap.fromJson({
    spec: "federated-messenger-identity/0.1",
    ownerKey: pkg.ownerKey,
    createdAt: new Date().toISOString(),
    updatedAt: pkg.generatedAt,
    contacts: pkg.contacts,
  });

  map.merge(tempMap);

  return { mergedCount: pkg.contacts.length };
}
