import { config } from "@albay/shared";
import { Redis } from "ioredis";
import type { Check } from "../types.ts";

export const redisCheck: Check = {
  name: "Redis",
  async run() {
    // lazyConnect + tek deneme: ioredis varsayilan olarak sonsuz yeniden
    // baglanir; smoke testte bir kez deneyip sonucu bildirmek istiyoruz.
    const redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on("error", () => {}); // gurultulu log'u sustur; hata zaten yakalanacak
    await redis.connect();
    const pong = await redis.ping();
    redis.disconnect();
    return `ayakta — ${pong}`;
  },
};
