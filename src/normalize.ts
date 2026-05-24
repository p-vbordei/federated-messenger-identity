/**
 * Normalise a per-channel handle into a stable form for equality lookup.
 */
export function normalizeHandle(channel: string, raw: string): string {
  const c = channel.toLowerCase();
  const s = raw.trim();
  switch (c) {
    case "whatsapp":
    case "signal": {
      // E.164: + followed by digits only
      const digits = s.replace(/[^\d+]/g, "");
      if (!digits.startsWith("+")) return "+" + digits;
      return digits;
    }
    case "slack": {
      // <team>:<user>, both lower-case
      return s.toLowerCase();
    }
    case "discord": {
      // strip "#1234" discriminator if present (post-2024)
      return s.split("#")[0]!.toLowerCase();
    }
    case "imessage":
    case "email": {
      return s.toLowerCase();
    }
    case "telegram": {
      return s.replace(/^@/, "");
    }
    case "matrix": {
      return s.toLowerCase();
    }
    default:
      return s;
  }
}

export function normalizeChannel(channel: string): string {
  return channel.toLowerCase().trim();
}
