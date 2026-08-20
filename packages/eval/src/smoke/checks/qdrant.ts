import { config } from "@albay/shared";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { Check } from "../types.ts";

export const qdrantCheck: Check = {
  name: "Qdrant",
  async run() {
    const client = new QdrantClient({ url: config.QDRANT_URL });
    const cols = await client.getCollections();
    return `ayakta — ${cols.collections.length} collection`;
  },
};
