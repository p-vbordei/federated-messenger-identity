import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ContactMap } from "./contact-map.ts";

export function createMcpServer(map: ContactMap): Server {
  const server = new Server(
    {
      name: "federated-messenger-identity",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "fmi.resolve",
          description: "Resolve a messenger channel and handle to a contact identity.",
          inputSchema: {
            type: "object",
            properties: {
              channel: {
                type: "string",
                description: "The messenger channel, e.g., 'whatsapp', 'slack', 'discord', 'telegram', 'imessage', 'email', 'signal', 'matrix'",
              },
              handle: {
                type: "string",
                description: "The channel-specific handle (normalised or raw)",
              },
            },
            required: ["channel", "handle"],
          },
        },
        {
          name: "fmi.handle",
          description: "Retrieve a contact's handle for a specific messenger channel.",
          inputSchema: {
            type: "object",
            properties: {
              contactId: {
                type: "string",
                description: "The contact ID (e.g. 'alice')",
              },
              channel: {
                type: "string",
                description: "The messenger channel, e.g. 'whatsapp', 'slack', etc.",
              },
              label: {
                type: "string",
                description: "Optional label to filter the handle, e.g., 'personal', 'work'",
              },
            },
            required: ["contactId", "channel"],
          },
        },
        {
          name: "fmi.search",
          description: "Search contacts by display name (case-insensitive substring match).",
          inputSchema: {
            type: "object",
            properties: {
              q: {
                type: "string",
                description: "The search query string for the contact's name",
              },
            },
            required: ["q"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "fmi.resolve": {
        const channel = String(args?.channel || "");
        const handle = String(args?.handle || "");
        if (!channel || !handle) {
          throw new Error("Missing channel or handle");
        }
        const contact = map.resolve({ channel, handle });
        if (!contact) {
          return {
            content: [{ type: "text", text: JSON.stringify({ found: false }) }],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                found: true,
                contact: {
                  id: contact.id,
                  displayName: contact.displayName,
                  notes: contact.notes,
                  primaryChannel: contact.primaryChannel,
                  groups: contact.groups,
                },
              }),
            },
          ],
        };
      }

      case "fmi.handle": {
        const contactId = String(args?.contactId || "");
        const channel = String(args?.channel || "");
        const label = args?.label ? String(args.label) : undefined;
        if (!contactId || !channel) {
          throw new Error("Missing contactId or channel");
        }
        try {
          const handle = map.handle(contactId, channel, label);
          if (!handle) {
            return {
              content: [{ type: "text", text: JSON.stringify({ found: false }) }],
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify({ found: true, handle }) }],
          };
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ found: false, error: (e as Error).message }),
              },
            ],
          };
        }
      }

      case "fmi.search": {
        const q = String(args?.q || "");
        const contacts = map.find(q);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                contacts: contacts.map((c) => ({
                  id: c.id,
                  displayName: c.displayName,
                  groups: c.groups,
                })),
              }),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

export function runMcpServer(map: ContactMap) {
  const server = createMcpServer(map);
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
