import { promises as fs } from "node:fs";
import type { Contact, ContactMapJson, Handle } from "./types.ts";
import { normalizeChannel, normalizeHandle } from "./normalize.ts";
import { Encrypter, Decrypter, identityToRecipient } from "age-encryption";

export class ContactMap {
  private encryptionState?: {
    path: string;
    identities: string[];
    recipients: string[];
  };

  private constructor(private state: ContactMapJson) {}

  static empty(ownerKey: string): ContactMap {
    const now = new Date().toISOString();
    return new ContactMap({
      spec: "federated-messenger-identity/0.1",
      ownerKey,
      createdAt: now,
      updatedAt: now,
      contacts: [],
    });
  }

  static fromJson(json: ContactMapJson): ContactMap {
    if (json.spec !== "federated-messenger-identity/0.1") {
      throw new Error(`Unsupported spec: ${json.spec}`);
    }
    return new ContactMap(json);
  }

  static async open(path: string): Promise<ContactMap> {
    const raw = await fs.readFile(path, "utf8");
    return ContactMap.fromJson(JSON.parse(raw));
  }

  static async openEncrypted(path: string, identities: string[]): Promise<ContactMap> {
    const rawEncrypted = await fs.readFile(path);
    const decrypter = new Decrypter();
    for (const id of identities) {
      decrypter.addIdentity(id);
    }
    const decryptedJson = await decrypter.decrypt(rawEncrypted, "text");
    const map = ContactMap.fromJson(JSON.parse(decryptedJson));
    let recipients = map.state.recipients;
    if (!recipients || recipients.length === 0) {
      recipients = await Promise.all(identities.map((id) => identityToRecipient(id)));
    }
    map.encryptionState = { path, identities, recipients };
    return map;
  }

  async save(path: string): Promise<void> {
    this.state.updatedAt = new Date().toISOString();
    const jsonStr = JSON.stringify(this.state, null, 2);

    if (this.encryptionState || path.endsWith(".age")) {
      const recipients = this.state.recipients || this.encryptionState?.recipients;
      if (!recipients || recipients.length === 0) {
        throw new Error("No recipients configured for encryption. Use saveEncrypted instead.");
      }
      this.state.recipients = recipients;
      const encrypter = new Encrypter();
      for (const r of recipients) {
        encrypter.addRecipient(r);
      }
      const ciphertext = await encrypter.encrypt(jsonStr);
      await fs.writeFile(path, ciphertext);
    } else {
      await fs.writeFile(path, jsonStr);
    }
  }

  async saveEncrypted(path: string, recipients: string[]): Promise<void> {
    this.state.updatedAt = new Date().toISOString();
    this.state.recipients = recipients;
    const jsonStr = JSON.stringify(this.state, null, 2);
    const encrypter = new Encrypter();
    for (const r of recipients) {
      encrypter.addRecipient(r);
    }
    const ciphertext = await encrypter.encrypt(jsonStr);
    await fs.writeFile(path, ciphertext);
    this.encryptionState = { path, identities: this.encryptionState?.identities || [], recipients };
  }

  toJson(): ContactMapJson {
    return structuredClone(this.state);
  }

  add(contact: Contact): void {
    if (this.state.contacts.find((c) => c.id === contact.id)) {
      throw new Error(`Contact ${contact.id} already exists`);
    }
    const now = new Date().toISOString();
    this.state.contacts.push({
      ...contact,
      createdAt: contact.createdAt || now,
      updatedAt: contact.updatedAt || now,
      handles: contact.handles.map((h) => ({
        ...h,
        channel: normalizeChannel(h.channel),
        handle: normalizeHandle(h.channel, h.handle),
      })),
    });
  }

  addHandle(contactId: string, handle: Handle): void {
    const c = this.requireContact(contactId);
    const norm: Handle = {
      ...handle,
      channel: normalizeChannel(handle.channel),
      handle: normalizeHandle(handle.channel, handle.handle),
    };
    if (c.handles.find((h) => h.channel === norm.channel && h.handle === norm.handle)) return;
    c.handles.push(norm);
    c.updatedAt = new Date().toISOString();
  }

  removeHandle(contactId: string, channel: string, handle: string): void {
    const c = this.requireContact(contactId);
    const nch = normalizeChannel(channel);
    const nh = normalizeHandle(channel, handle);
    const lenBefore = c.handles.length;
    c.handles = c.handles.filter((h) => !(h.channel === nch && h.handle === nh));
    if (c.handles.length !== lenBefore) {
      c.updatedAt = new Date().toISOString();
    }
  }

  merge(other: ContactMap): void {
    if (other.state.ownerKey !== this.state.ownerKey) {
      throw new Error(
        `Cannot merge maps with different owners: ${this.state.ownerKey} vs ${other.state.ownerKey}`,
      );
    }
    for (const oc of other.state.contacts) {
      const existing = this.state.contacts.find((c) => c.id === oc.id);
      if (!existing) {
        this.add(oc);
      } else {
        const existingTime = new Date(existing.updatedAt || 0).getTime();
        const otherTime = new Date(oc.updatedAt || 0).getTime();
        if (otherTime > existingTime) {
          const idx = this.state.contacts.indexOf(existing);
          this.state.contacts[idx] = structuredClone(oc);
        } else if (otherTime === existingTime) {
          for (const h of oc.handles) {
            this.addHandle(oc.id, h);
          }
          if (oc.notes && !existing.notes) existing.notes = oc.notes;
          if (oc.primaryChannel && !existing.primaryChannel) existing.primaryChannel = oc.primaryChannel;
          if (oc.groups) {
            existing.groups = Array.from(new Set([...(existing.groups || []), ...oc.groups]));
          }
        }
      }
    }
  }

  list(group?: string): Contact[] {
    if (!group) return [...this.state.contacts];
    return this.state.contacts.filter((c) => c.groups?.includes(group));
  }

  find(displayName: string): Contact[] {
    const q = displayName.toLowerCase();
    return this.state.contacts.filter((c) => c.displayName.toLowerCase().includes(q));
  }

  resolve(query: { channel: string; handle: string }): Contact | null {
    const ch = normalizeChannel(query.channel);
    const h = normalizeHandle(query.channel, query.handle);
    return (
      this.state.contacts.find((c) =>
        c.handles.some((x) => x.channel === ch && x.handle === h),
      ) ?? null
    );
  }

  handle(contactId: string, channel: string, label?: string): string | null {
    const c = this.requireContact(contactId);
    const ch = normalizeChannel(channel);
    const matches = c.handles.filter((h) => h.channel === ch);
    if (matches.length === 0) return null;
    if (label) {
      const labelled = matches.find((m) => m.label === label);
      if (labelled) return labelled.handle;
    }
    return matches[0]!.handle;
  }

  allHandles(contactId: string, channel: string): Handle[] {
    const c = this.requireContact(contactId);
    const ch = normalizeChannel(channel);
    return c.handles.filter((h) => h.channel === ch);
  }

  private requireContact(id: string): Contact {
    const c = this.state.contacts.find((x) => x.id === id);
    if (!c) throw new Error(`Unknown contact: ${id}`);
    return c;
  }
}
