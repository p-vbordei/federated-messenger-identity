import { test } from "node:test";
import assert from "node:assert/strict";
import { ContactMap } from "./contact-map.ts";
import { createMcpServer } from "./mcp.ts";

class MockTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;
  sent: any[] = [];

  async start() {}
  async send(message: any) {
    this.sent.push(message);
  }
  async close() {}
}

test("MCP: list tools and call tools via MockTransport", async () => {
  const map = ContactMap.empty("test-owner");
  map.add({
    id: "alice",
    displayName: "Alice Example",
    handles: [{ channel: "whatsapp", handle: "+1234567890" }],
  });

  const server = createMcpServer(map);
  const transport = new MockTransport();
  await server.connect(transport);

  // 1. Test tools/list
  assert.ok(transport.onmessage);
  transport.onmessage!({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });

  // Give promise queue a tick to resolve
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(transport.sent.length, 1);
  const listResponse = transport.sent[0];
  assert.equal(listResponse.id, 1);
  assert.ok(listResponse.result);
  assert.equal(listResponse.result.tools.length, 3);
  
  const toolNames = listResponse.result.tools.map((t: any) => t.name);
  assert.deepEqual(toolNames, ["fmi.resolve", "fmi.handle", "fmi.search"]);

  // Clear sent messages
  transport.sent = [];

  // 2. Test tools/call fmi.resolve
  transport.onmessage!({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "fmi.resolve",
      arguments: {
        channel: "whatsapp",
        handle: "+1234567890",
      },
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(transport.sent.length, 1);
  const callResponse = transport.sent[0];
  assert.equal(callResponse.id, 2);
  assert.ok(callResponse.result);
  
  const textContent = JSON.parse(callResponse.result.content[0].text);
  assert.equal(textContent.found, true);
  assert.equal(textContent.contact.id, "alice");
  assert.equal(textContent.contact.displayName, "Alice Example");

  // Clear sent messages
  transport.sent = [];

  // 3. Test tools/call fmi.search
  transport.onmessage!({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "fmi.search",
      arguments: {
        q: "alice",
      },
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(transport.sent.length, 1);
  const searchResponse = transport.sent[0];
  assert.equal(searchResponse.id, 3);
  
  const searchContent = JSON.parse(searchResponse.result.content[0].text);
  assert.equal(searchContent.contacts.length, 1);
  assert.equal(searchContent.contacts[0].displayName, "Alice Example");
});
