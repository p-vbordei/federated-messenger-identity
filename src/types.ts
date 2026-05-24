export interface Handle {
  channel: string;
  handle: string;
  label?: string;
  verifiedAt?: string;
}

export interface Contact {
  id: string;
  displayName: string;
  notes?: string;
  primaryChannel?: string;
  handles: Handle[];
  groups?: string[];
}

export interface ContactMapJson {
  spec: "federated-messenger-identity/0.1";
  ownerKey: string;
  createdAt: string;
  updatedAt: string;
  contacts: Contact[];
}
