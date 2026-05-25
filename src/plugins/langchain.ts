import { z } from "zod";
import type { ContactMap } from "../contact-map.ts";

/**
 * Creates tools compatible with LangChain.
 * If you have `@langchain/core/tools` or another LangChain tools package,
 * you can pass the `StructuredTool` class to automatically instantiate them.
 */
export function createLangChainTools(map: ContactMap, StructuredToolClass?: any) {
  const tools = {
    resolveContact: {
      name: "fmi_resolve_contact",
      description: "Resolve a messenger channel name and handle to a unified contact identity.",
      schema: z.object({
        channel: z.string().describe("The messenger channel, e.g., 'whatsapp', 'slack', 'discord', 'telegram', 'imessage', 'email', 'signal', 'matrix'"),
        handle: z.string().describe("The channel-specific handle or identifier"),
      }),
      async _call({ channel, handle }: { channel: string; handle: string }) {
        const contact = map.resolve({ channel, handle });
        return JSON.stringify(contact ? { found: true, contact } : { found: false });
      },
    },
    getContactHandle: {
      name: "fmi_get_contact_handle",
      description: "Retrieve a contact's handle for a specific messenger channel.",
      schema: z.object({
        contactId: z.string().describe("The short ID of the contact, e.g. 'alice'"),
        channel: z.string().describe("The messenger channel, e.g., 'whatsapp', 'slack', 'discord', 'telegram'"),
        label: z.string().optional().describe("Optional label to filter the handle"),
      }),
      async _call({ contactId, channel, label }: { contactId: string; channel: string; label?: string }) {
        try {
          const handle = map.handle(contactId, channel, label);
          return JSON.stringify(handle ? { found: true, handle } : { found: false });
        } catch (e) {
          return JSON.stringify({ found: false, error: (e as Error).message });
        }
      },
    },
    searchContacts: {
      name: "fmi_search_contacts",
      description: "Search for unified contacts by display name (case-insensitive substring match).",
      schema: z.object({
        q: z.string().describe("The search query for the contact's name"),
      }),
      async _call({ q }: { q: string }) {
        const contacts = map.find(q);
        return JSON.stringify({
          contacts: contacts.map((c) => ({
            id: c.id,
            displayName: c.displayName,
            groups: c.groups,
          })),
        });
      },
    },
  };

  if (StructuredToolClass) {
    return [
      new StructuredToolClass(tools.resolveContact),
      new StructuredToolClass(tools.getContactHandle),
      new StructuredToolClass(tools.searchContacts),
    ];
  }

  return tools;
}
