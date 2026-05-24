#!/usr/bin/env node
import process from "node:process";
import { promises as fs } from "node:fs";
import { ContactMap } from "./index.ts";
import type { Handle } from "./types.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const DEFAULT_PATH = process.env.FMI_FILE ?? "./contacts.fmi.json";

async function load(): Promise<ContactMap> {
  try {
    return await ContactMap.open(DEFAULT_PATH);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No contact map at ${DEFAULT_PATH}. Run: fmi init --owner <you>`);
    }
    throw err;
  }
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(`fmi — federated-messenger-identity CLI

Usage:
  fmi init --owner <key>
  fmi add <id> "<displayName>" [--whatsapp +123 --slack T0:U0 --imessage a@b --discord name ...]
  fmi resolve --channel <ch> --handle <h>
  fmi who <id>
  fmi list [--group <name>]
  fmi find <displayName>

File: FMI_FILE env var, defaults to ./contacts.fmi.json
`);
    return;
  }

  switch (cmd) {
    case "init": {
      const owner = flag(rest, "owner");
      if (!owner) throw new Error("--owner required");
      try {
        await fs.access(DEFAULT_PATH);
        throw new Error(`File exists at ${DEFAULT_PATH}; refusing to overwrite`);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      const map = ContactMap.empty(owner);
      await map.save(DEFAULT_PATH);
      console.log(`Initialised empty map at ${DEFAULT_PATH}`);
      return;
    }
    case "add": {
      const id = rest[0];
      const name = rest[1];
      if (!id || !name) throw new Error('usage: add <id> "<displayName>" [handle flags]');
      const map = await load();
      const handles: Handle[] = [];
      const known = ["whatsapp", "signal", "imessage", "slack", "discord", "telegram", "matrix", "email"];
      for (const k of known) {
        const v = flag(rest, k);
        if (v) handles.push({ channel: k, handle: v });
      }
      map.add({ id, displayName: name, handles });
      await map.save(DEFAULT_PATH);
      console.log(`Added ${id} with ${handles.length} handle(s).`);
      return;
    }
    case "resolve": {
      const ch = flag(rest, "channel");
      const h = flag(rest, "handle");
      if (!ch || !h) throw new Error("--channel and --handle required");
      const map = await load();
      const c = map.resolve({ channel: ch, handle: h });
      if (!c) { process.exitCode = 1; console.log("(not found)"); return; }
      console.log(`${c.id} — ${c.displayName}`);
      return;
    }
    case "who": {
      const id = rest[0];
      if (!id) throw new Error("usage: who <id>");
      const map = await load();
      const c = map.list().find((x) => x.id === id);
      if (!c) { process.exitCode = 1; console.log("(not found)"); return; }
      console.log(`${c.id} — ${c.displayName}`);
      for (const h of c.handles) {
        const label = h.label ? ` [${h.label}]` : "";
        console.log(`  ${h.channel}: ${h.handle}${label}`);
      }
      return;
    }
    case "list": {
      const map = await load();
      const group = flag(rest, "group");
      for (const c of map.list(group)) {
        console.log(`${c.id.padEnd(16)} ${c.displayName.padEnd(30)} ${c.handles.length} handle(s)`);
      }
      return;
    }
    case "find": {
      const q = rest[0];
      if (!q) throw new Error("usage: find <displayName>");
      const map = await load();
      for (const c of map.find(q)) console.log(`${c.id} — ${c.displayName}`);
      return;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(2);
  }
}

main().catch((e) => { console.error(e.message ?? String(e)); process.exit(1); });
