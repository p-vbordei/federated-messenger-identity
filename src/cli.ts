#!/usr/bin/env node
import process from "node:process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ContactMap } from "./index.ts";
import type { Handle } from "./types.ts";
import { identityToRecipient } from "age-encryption";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function flags(args: string[], name: string): string[] {
  const result: string[] = [];
  let i = args.indexOf(`--${name}`);
  while (i >= 0) {
    const val = args[i + 1];
    if (val && !val.startsWith("-")) {
      result.push(...val.split(",").map((s) => s.trim()));
    }
    i = args.indexOf(`--${name}`, i + 1);
  }
  return result;
}

const FILE_PATH = flag(process.argv, "file") ?? process.env.FMI_FILE ?? "./contacts.fmi.json";

async function getIdentities(args: string[]): Promise<string[]> {
  const ids = flags(args, "identity");
  if (ids.length > 0) return ids;

  if (process.env.FMI_IDENTITY) {
    return process.env.FMI_IDENTITY.split(",").map((s) => s.trim());
  }

  const defaultIdPath = path.join(os.homedir(), ".config", "fmi", "id_age");
  try {
    const content = await fs.readFile(defaultIdPath, "utf8");
    const found = content
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("AGE-SECRET-KEY-"));
    if (found.length > 0) return found;
  } catch (e) {
    // ignore
  }

  return [];
}

async function getRecipients(args: string[]): Promise<string[]> {
  const recs = flags(args, "recipient");
  if (recs.length > 0) return recs;

  if (process.env.FMI_RECIPIENTS) {
    return process.env.FMI_RECIPIENTS.split(",").map((s) => s.trim());
  }

  return [];
}

async function load(args: string[]): Promise<ContactMap> {
  try {
    if (FILE_PATH.endsWith(".age")) {
      const identities = await getIdentities(args);
      if (identities.length === 0) {
        throw new Error(
          `Contact map at ${FILE_PATH} is encrypted. Please specify your identity via --identity, FMI_IDENTITY env var, or local ~/.config/fmi/id_age.`,
        );
      }
      return await ContactMap.openEncrypted(FILE_PATH, identities);
    } else {
      return await ContactMap.open(FILE_PATH);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No contact map at ${FILE_PATH}. Run: fmi init --owner <you>`);
    }
    throw err;
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(`fmi — federated-messenger-identity CLI

Usage:
  fmi init --owner <key> [--identity <key>] [--recipient <key>]
  fmi add <id> "<displayName>" [--whatsapp +123 --slack T0:U0 --imessage a@b --discord name ...]
  fmi resolve --channel <ch> --handle <h>
  fmi who <id>
  fmi list [--group <name>]
  fmi find <displayName>
  fmi mcp [--identity <key>]
  fmi sync-export [--since <ISO>] [--output <file>] [--recipient <key>]
  fmi sync-import [--input <file>] [--identity <key>]

Options:
  --file <path>        Path to the contact map file (defaults to ./contacts.fmi.json or FMI_FILE env var)
  --identity <key>     Secret identity key(s) to decrypt age files (or FMI_IDENTITY env var)
  --recipient <key>    Public recipient key(s) to encrypt age files (or FMI_RECIPIENTS env var)
`);
    return;
  }

  switch (cmd) {
    case "init": {
      const owner = flag(rest, "owner");
      if (!owner) throw new Error("--owner required");
      try {
        await fs.access(FILE_PATH);
        throw new Error(`File exists at ${FILE_PATH}; refusing to overwrite`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      const map = ContactMap.empty(owner);

      if (FILE_PATH.endsWith(".age")) {
        let recipients = await getRecipients(process.argv);
        if (recipients.length === 0) {
          const identities = await getIdentities(process.argv);
          if (identities.length > 0) {
            recipients = await Promise.all(identities.map((id) => identityToRecipient(id)));
          } else {
            const { generateIdentity, identityToRecipient: toRecip } = await import("age-encryption");
            const newIdentity = await generateIdentity();
            const newRecipient = await toRecip(newIdentity);

            const defaultIdDir = path.join(os.homedir(), ".config", "fmi");
            const defaultIdPath = path.join(defaultIdDir, "id_age");
            await fs.mkdir(defaultIdDir, { recursive: true });
            await fs.writeFile(defaultIdPath, newIdentity + "\n", "utf8");

            console.error(`[FMI] Generated new age identity: ${newIdentity}`);
            console.error(`[FMI] Saved identity to ~/.config/fmi/id_age`);
            console.error(`[FMI] Please back up this key. You will need it to read your contacts on other devices.`);

            recipients = [newRecipient];
          }
        }
        await map.saveEncrypted(FILE_PATH, recipients);
      } else {
        await map.save(FILE_PATH);
      }
      console.log(`Initialised empty map at ${FILE_PATH}`);
      return;
    }
    case "add": {
      const id = rest[0];
      const name = rest[1];
      if (!id || !name) throw new Error('usage: add <id> "<displayName>" [handle flags]');
      const map = await load(process.argv);
      const handles: Handle[] = [];
      const known = ["whatsapp", "signal", "imessage", "slack", "discord", "telegram", "matrix", "email"];
      for (const k of known) {
        const v = flag(rest, k);
        if (v) handles.push({ channel: k, handle: v });
      }
      map.add({ id, displayName: name, handles });
      await map.save(FILE_PATH);
      console.log(`Added ${id} with ${handles.length} handle(s).`);
      return;
    }
    case "resolve": {
      const ch = flag(rest, "channel");
      const h = flag(rest, "handle");
      if (!ch || !h) throw new Error("--channel and --handle required");
      const map = await load(process.argv);
      const c = map.resolve({ channel: ch, handle: h });
      if (!c) {
        process.exitCode = 1;
        console.log("(not found)");
        return;
      }
      console.log(`${c.id} — ${c.displayName}`);
      return;
    }
    case "who": {
      const id = rest[0];
      if (!id) throw new Error("usage: who <id>");
      const map = await load(process.argv);
      const c = map.list().find((x) => x.id === id);
      if (!c) {
        process.exitCode = 1;
        console.log("(not found)");
        return;
      }
      console.log(`${c.id} — ${c.displayName}`);
      for (const h of c.handles) {
        const label = h.label ? ` [${h.label}]` : "";
        console.log(`  ${h.channel}: ${h.handle}${label}`);
      }
      return;
    }
    case "list": {
      const map = await load(process.argv);
      const group = flag(rest, "group");
      for (const c of map.list(group)) {
        console.log(`${c.id.padEnd(16)} ${c.displayName.padEnd(30)} ${c.handles.length} handle(s)`);
      }
      return;
    }
    case "find": {
      const q = rest[0];
      if (!q) throw new Error("usage: find <displayName>");
      const map = await load(process.argv);
      for (const c of map.find(q)) console.log(`${c.id} — ${c.displayName}`);
      return;
    }
    case "mcp": {
      const map = await load(process.argv);
      const { runMcpServer } = await import("./mcp.ts");
      runMcpServer(map);
      return;
    }
    case "sync-export": {
      const map = await load(process.argv);
      const since = flag(rest, "since") ?? "1970-01-01T00:00:00Z";
      const outPath = flag(rest, "output");

      let recipients = await getRecipients(process.argv);
      if (recipients.length === 0 && map.toJson().ownerKey) {
        // If not specified, try to use encryptionState recipients or derive them
        if (map["encryptionState"]?.recipients) {
          recipients = map["encryptionState"].recipients;
        } else {
          // If map is plaintext, we can derive the recipient from our own identity
          const identities = await getIdentities(process.argv);
          if (identities.length > 0) {
            recipients = await Promise.all(identities.map((id) => identityToRecipient(id)));
          }
        }
      }

      if (recipients.length === 0) {
        throw new Error("No recipients specified for sync-export. Use --recipient or --identity.");
      }

      const { exportDelta } = await import("./sync.ts");
      const { armor } = await import("age-encryption");

      const delta = await exportDelta(map, since, recipients);

      if (outPath) {
        await fs.writeFile(outPath, delta);
        console.log(`Exported encrypted delta to ${outPath}`);
      } else {
        const armored = armor.encode(delta);
        process.stdout.write(armored);
      }
      return;
    }
    case "sync-import": {
      const map = await load(process.argv);
      const inPath = flag(rest, "input");
      let data: Uint8Array;

      if (inPath) {
        data = await fs.readFile(inPath);
      } else {
        const text = await readStdin();
        if (!text.trim()) {
          throw new Error("No input provided via stdin");
        }
        data = Buffer.from(text, "utf8");
      }

      const textDecoder = new TextDecoder();
      let textContent = "";
      try {
        textContent = textDecoder.decode(data);
      } catch (e) {
        // ignore
      }

      const { armor } = await import("age-encryption");
      let rawDelta = data;
      if (textContent.trim().startsWith("-----BEGIN AGE ENCRYPTED FILE-----")) {
        rawDelta = armor.decode(textContent);
      }

      const identities = await getIdentities(process.argv);
      if (identities.length === 0) {
        throw new Error("No identities specified for sync-import. Use --identity.");
      }

      const { importDelta } = await import("./sync.ts");
      const { mergedCount } = await importDelta(map, rawDelta, identities);

      await map.save(FILE_PATH);
      console.log(`Successfully merged ${mergedCount} contact(s).`);
      return;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e.message ?? String(e));
  process.exit(1);
});
