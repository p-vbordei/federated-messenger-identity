# Architecture — federated-messenger-identity

## Schema

```ts
export interface ContactMap {
  spec: "federated-messenger-identity/0.1";
  ownerKey: string;
  createdAt: string;
  updatedAt: string;
  contacts: Contact[];
}

export interface Contact {
  id: string;                       // user-chosen short id, e.g. "alice"
  displayName: string;
  notes?: string;
  primaryChannel?: string;
  handles: Handle[];
  groups?: string[];                // optional labels: "family", "work"
}

export interface Handle {
  channel: string;                  // "whatsapp" | "slack" | "imessage" | ...
  handle: string;                   // channel-native handle, normalised
  label?: string;                   // e.g. "personal", "work"
  verifiedAt?: string;              // when the user confirmed this handle
}
```

## Operations

```ts
class ContactMap {
  static empty(ownerKey: string): ContactMap;
  static fromJson(json: object): ContactMap;
  toJson(): object;

  add(contact: Contact): void;
  addHandle(contactId: string, handle: Handle): void;
  removeHandle(contactId: string, channel: string, handle: string): void;
  merge(other: ContactMap): void;

  list(group?: string): Contact[];
  find(displayName: string): Contact[];

  // Reverse lookup: who is this?
  resolve(query: { channel: string; handle: string }): Contact | null;

  // Forward lookup: what's their handle?
  handle(contactId: string, channel: string, label?: string): string | null;
  allHandles(contactId: string, channel: string): Handle[];
}
```

## Normalisation

Handles are normalised per channel before lookup so that `+1 (234) 567-890` and `+1234567890` match:

| Channel | Rule |
|---|---|
| `whatsapp`, `signal` | E.164 (`+` + digits) |
| `slack` | `<team>:<user>` (lower-cased) |
| `discord` | strip `#<discriminator>` if present (post-2024 model) |
| `imessage`, `email` | lower-case, strip whitespace |
| `telegram` | strip leading `@` |
| `matrix` | lower-case |

## Storage

Two file formats:

- **Plaintext** `contacts.fmi.json` — for development and one-machine use.
- **Encrypted** `contacts.fmi.json.age` — encrypted with one or more age recipients (planned v0.2). Multi-recipient lets the user have the file on phone, laptop, and desktop with three separate keys.

The encrypted format is just an age-encrypted version of the plaintext JSON; v0.2 will rely on the `age` binary or `age-encryption` npm package.

## MCP server

Three tools (planned v0.3):

- `fmi.resolve({ channel, handle }) → { id, displayName }`
- `fmi.handle({ contactId, channel, label? }) → { handle }`
- `fmi.search({ q }) → [{ id, displayName }]`

Manifest declares:
- `network.noEgress: true`
- `filesystem.read: ["<configured file>"]`
- `userApprovalRequiredFor: ["fmi.resolve", "fmi.handle"]` (configurable; default on so the user sees lookups)

## Sync (v0.4)

End-to-end-encrypted peer sync between the user's own devices:

- Each device generates an age key.
- The map file lives on whichever device touches it; other devices receive deltas via Matrix / Nostr / Signal / iMessage, encrypted to all recipients.
- No central server. Conflict resolution: last-writer-wins per contact, with a per-contact `updatedAt`.

## Non-goals

- Not a bridge (Matrix/Beeper do bridging).
- Not a CRM.
- Not a social-network identity-graph (no inferring relationships from messages).
