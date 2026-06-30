// Sample CRUD entity for the Items master–detail screen.
// Rename these fields (and the service seed) to match your real resource.
export type ItemStatus = 'active' | 'inactive';

export interface Item {
  id: string;
  name: string;
  description: string;
  status: ItemStatus;
  updatedAt: string; // ISO timestamp, set by the data source on write
}

// Shape accepted by create/update — everything the user edits, no server fields.
export interface ItemInput {
  name: string;
  description: string;
  status: ItemStatus;
}
