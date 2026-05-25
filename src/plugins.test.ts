import { test } from "node:test";
import assert from "node:assert/strict";
import { ContactMap } from "./contact-map.ts";
import { createVercelAITools, createLangChainTools } from "./plugins/index.ts";

test("Plugins: Vercel AI SDK tools", async () => {
  const map = ContactMap.empty("test-owner");
  map.add({
    id: "alice",
    displayName: "Alice Example",
    handles: [{ channel: "whatsapp", handle: "+1234567890" }],
  });

  const tools = createVercelAITools(map);

  assert.ok(tools.resolveContact);
  assert.ok(tools.getContactHandle);
  assert.ok(tools.searchContacts);

  // Test execute resolveContact
  const resolveRes = await tools.resolveContact.execute({
    channel: "whatsapp",
    handle: "+1234567890",
  });
  assert.deepEqual(resolveRes, {
    found: true,
    contact: {
      id: "alice",
      displayName: "Alice Example",
      notes: undefined,
      primaryChannel: undefined,
      groups: undefined,
    },
  });

  // Test execute getContactHandle
  const handleRes = await tools.getContactHandle.execute({
    contactId: "alice",
    channel: "whatsapp",
  });
  assert.deepEqual(handleRes, {
    found: true,
    handle: "+1234567890",
  });

  // Test execute searchContacts
  const searchRes = await tools.searchContacts.execute({ q: "alice" });
  assert.equal(searchRes.contacts.length, 1);
  assert.equal(searchRes.contacts[0]?.displayName, "Alice Example");
});

test("Plugins: LangChain tools integration", async () => {
  const map = ContactMap.empty("test-owner");
  map.add({
    id: "alice",
    displayName: "Alice Example",
    handles: [{ channel: "whatsapp", handle: "+1234567890" }],
  });

  // Test raw tool config object return
  const toolsObj = createLangChainTools(map) as any;
  assert.ok(toolsObj.resolveContact);
  assert.equal(toolsObj.resolveContact.name, "fmi_resolve_contact");

  const res = await toolsObj.resolveContact._call({
    channel: "whatsapp",
    handle: "+1234567890",
  });
  const parsed = JSON.parse(res);
  assert.equal(parsed.found, true);
  assert.equal(parsed.contact.id, "alice");

  // Test with Mock StructuredToolClass
  class MockStructuredTool {
    constructor(public fields: any) {}
  }

  const instantiatedTools = createLangChainTools(map, MockStructuredTool) as any[];
  assert.equal(instantiatedTools.length, 3);
  assert.ok(instantiatedTools[0] instanceof MockStructuredTool);
  assert.equal(instantiatedTools[0].fields.name, "fmi_resolve_contact");
});
