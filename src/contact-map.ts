import { promises as fs } from "node:fs";
import type { Contact, ContactMapJson, Handle } from "./types.ts";
import { normalizeChannel, normalizeHandle } from "./normalize.ts";

export class ContactMap {
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

  async save(path: string): Promise<void> {
    this.state.updatedAt = new Date().toISOString();
    await fs.writeFile(path, JSON.stringify(this.state, null, 2));
  }

  toJson(): ContactMapJson {
    return structuredClone(this.state);
  }

  add(contact: Contact): void {
    if (this.state.contacts.find((c) => c.id === contact.id)) {
      throw new Error(`Contact ${contact.id} already exists`);
    }
    this.state.contacts.push({
      ...contact,
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
  }

  removeHandle(contactId: string, channel: string, handle: string): void {
    const c = this.requireContact(contactId);
    const nch = normalizeChannel(channel);
    const nh = normalizeHandle(channel, handle);
    c.handles = c.handles.filter((h) => !(h.channel === nch && h.handle === nh));
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
        for (const h of oc.handles) this.addHandle(oc.id, h);
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
