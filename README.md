# federated-messenger-identity (FMI)

> A user-owned, portable contact-mapping layer across messengers — so an agent treats "Alice" as one person, not 23.

## Problem

A modern human reaches the same contact through many channels:

- WhatsApp `+1234567890`
- iMessage `alice@apple.com`
- Slack `U0ABC123` in `T0XYZ789`
- Discord `alice#1234`
- Telegram `@alice_t`
- Signal `+1234567890`
- Matrix `@alice:example.com`
- Email `alice@work.example`

To every messenger, every CRM, and every agent, this is **eight different people**. Multi-channel agent frameworks typically either collapse all DMs into a single per-agent "main session" (a deliberate flattening) or expose an optional, per-install identity-mapping config. Neither approach is portable across products. There is **no portable, user-owned identity layer**.

A2A solves agent-to-agent identity. OAuth solves app-to-service identity. Neither solves **human-to-channel** identity unification.

## Why doesn't this already exist

- Each messenger benefits from siloing identity (lock-in).
- Cross-messenger products historically meant *bridging* (Matrix, Beeper), not *mapping*.
- Privacy-conscious users don't want a third party holding their address book.

## What this is

1. A **portable schema** (`fmi-contact-map.json`) listing your contacts and their per-channel handles.
2. A **TypeScript library** to query, merge, and update.
3. A **CLI** to add / show / find contacts.
4. **Encrypted local storage** via age recipients (so the file is safe at rest).
5. An **MCP server** form so any agent can ask "who is `+1234567890`?" or "what's Alice's Slack handle in T0XYZ?".

The user owns the file. They can export, import, fork, encrypt with multiple recipients (e.g., themselves on phone + laptop), revoke a recipient. No third-party server is involved by default.

## Quick start

```bash
pnpm install
pnpm build

# Initialise an empty map (you become the only recipient)
pnpm cli init --owner you@example.com

# Add a contact
pnpm cli add alice "Alice Example" \
  --whatsapp +1234567890 \
  --slack T0XYZ789:U0ABC123 \
  --imessage alice@apple.com \
  --discord "alice#1234"

# Resolve a channel handle → contact
pnpm cli resolve --channel whatsapp --handle +1234567890
# → alice (Alice Example)

# List Alice's handles
pnpm cli who alice
```

In code:

```ts
import { ContactMap } from "federated-messenger-identity";

const map = await ContactMap.openEncrypted("./contacts.fmi.json.age", recipients);

const contact = map.resolve({ channel: "whatsapp", handle: "+1234567890" });
console.log(contact?.id, contact?.displayName);

const slack = map.handle("alice", "slack");        // "T0XYZ789:U0ABC123"
```

## MVP scope

- [x] Contact + handle schema
- [x] In-memory + JSON-file map
- [x] `resolve(channel, handle) → contact`
- [x] `handle(contactId, channel) → string | null`
- [x] `add`, `addHandle`, `removeHandle`, `merge`, `list`, `find`
- [x] CLI for the above
- [x] Plaintext file format (encryption helper in v0.2)
- [x] Unit tests
- [ ] Encrypted at rest via `age` recipients (multi-device, revocable)
- [ ] MCP server (`fmi.resolve`, `fmi.handle`, `fmi.search`)
- [ ] Resolver plugins for popular agent frameworks
- [ ] Sync protocol over E2EE channels (no server)

## Why per-channel handle, not "canonical phone number"

People deliberately use different identities in different channels: a work email on Slack, a personal email on iMessage, a phone on Signal. Treating one handle as canonical fails the privacy model. FMI preserves *all* handles and lets the user decide which is "primary."

## Handle format

| Channel | Handle |
|---|---|
| `whatsapp` | E.164 phone, e.g. `+1234567890` |
| `signal` | E.164 phone |
| `imessage` | Apple ID email or phone |
| `slack` | `<team_id>:<user_id>` |
| `discord` | `<username>` (numbers stripped if newer model) or `<user_id>` |
| `telegram` | `@username` or numeric user id |
| `matrix` | `@user:server` |
| `email` | RFC 5321 address |

## Privacy posture

- File never leaves the device without explicit export.
- Encryption recipients are user-controlled (their own age public keys).
- No third-party server, no telemetry.
- The MCP server returns *only* the handle requested, not the whole map (least privilege).

## Roadmap

| Milestone | What |
|---|---|
| v0.1 | Schema + lib + CLI + tests (plaintext file) |
| v0.2 | age-encrypted file format + multi-recipient |
| v0.3 | MCP server + resolver plugins for agent frameworks |
| v0.4 | E2EE peer sync (no server) |
| v0.5 | Browser extension that auto-resolves "who is this?" on social platforms |

## References

- Research paper §6.5, §10.1 #6
- age encryption — <https://age-encryption.org>

## License

Apache-2.0 © Vlad Bordei
