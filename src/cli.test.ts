import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "cli.ts");

let TMP_FILE: string;

function fmi(args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", CLI, ...args],
    {
      env: { ...process.env, FMI_FILE: TMP_FILE },
      encoding: "utf8",
    },
  );
  return { code: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

describe("cli smoke", () => {
  before(async () => {
    TMP_FILE = join(tmpdir(), `fmi-cli-${process.pid}-${Date.now()}.json`);
    // Ensure clean slate.
    await fs.rm(TMP_FILE, { force: true });
  });

  after(async () => {
    await fs.rm(TMP_FILE, { force: true });
  });

  it("init creates the file", () => {
    const r = fmi(["init", "--owner", "user:vlad"]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /Initialised empty map/);
  });

  it("add stores a contact with multiple handles", () => {
    const r = fmi([
      "add", "alice", "Alice Example",
      "--whatsapp", "+1 (234) 567-890",
      "--email", "Alice@Example.COM",
      "--telegram", "@alice_t",
      "--slack", "T0XYZ:U0ABC",
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /Added alice with 4 handle\(s\)/);
  });

  it("resolve finds the contact by a non-normalised handle", () => {
    const r = fmi(["resolve", "--channel", "whatsapp", "--handle", "1234567890"]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /alice — Alice Example/);
  });

  it("resolve returns exit code 1 when not found", () => {
    const r = fmi(["resolve", "--channel", "telegram", "--handle", "ghost"]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /not found/);
  });

  it("who lists handles on a contact", () => {
    const r = fmi(["who", "alice"]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /alice — Alice Example/);
    assert.match(r.stdout, /whatsapp: \+1234567890/);
    assert.match(r.stdout, /email: alice@example\.com/);
    assert.match(r.stdout, /slack: t0xyz:u0abc/);
  });

  it("list shows all contacts", () => {
    const r = fmi(["list"]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /alice\s+Alice Example\s+4 handle/);
  });

  it("find performs case-insensitive substring match", () => {
    const r = fmi(["find", "EXAMPLE"]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /alice — Alice Example/);
  });

  it("init refuses to overwrite an existing file", () => {
    const r = fmi(["init", "--owner", "user:other"]);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /refusing to overwrite/);
  });
});
