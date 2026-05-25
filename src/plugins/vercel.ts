import { z } from "zod";
import type { ContactMap } from "../contact-map.ts";

/**
 * Creates tools compatible with the Vercel AI SDK.
 */
export function createVercelAITools(map: ContactMap) {
  return {
    resolveContact: {
      description: "Resolve a messenger channel name and handle to a unified contact identity.",
      parameters: z.object({
        channel: z.string().describe("The messenger channel, e.g., 'whatsapp', 'slack', 'discord', 'telegram', 'imessage', 'email', 'signal', 'matrix'"),
        handle: z.string().describe("The channel-specific handle or identifier (e.g. +1234567890, username)"),
      }),
      execute: async ({ channel, handle }: { channel: string; handle: string }) => {
        const contact = map.resolve({ channel, handle });
        if (!contact) return { found: false };
        return {
          found: true,
          contact: {
            id: contact.id,
            displayName: contact.displayName,
            notes: contact.notes,
            primaryChannel: contact.primaryChannel,
            groups: contact.groups,
          },
        };
      },
    },
    getContactHandle: {
      description: "Retrieve a contact's handle for a specific messenger channel.",
      parameters: z.object({
        contactId: z.string().describe("The short ID of the contact, e.g. 'alice'"),
        channel: z.string().describe("The messenger channel, e.g., 'whatsapp', 'slack', 'discord', 'telegram'"),
        label: z.string().optional().describe("Optional label to filter the handle, e.g., 'personal', 'work'"),
      }),
      execute: async ({ contactId, channel, label }: { contactId: string; channel: string; label?: string }) => {
        try {
          const handle = map.handle(contactId, channel, label);
          if (!handle) return { found: false };
          return { found: true, handle };
        } catch (e) {
          return { found: false, error: (e as Error).message };
        }
      },
    },
    searchContacts: {
      description: "Search for unified contacts by display name (case-insensitive substring match).",
      parameters: z.object({
        q: z.string().describe("The search query for the contact's name"),
      }),
      execute: async ({ q }: { q: string }) => {
        const contacts = map.find(q);
        return {
          contacts: contacts.map((c) => ({
            id: c.id,
            displayName: c.displayName,
            groups: c.groups,
          })),
        };
      },
    },
  };
}
