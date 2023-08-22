import { Router, Request, Response } from "express";
import dotenv from "dotenv";
import unkey from "../unkey/unkey";
import { logger } from "../logger";
import supabase from "../db/supabase";
dotenv.config();

const router = Router();

router.post("/key/new", async (req: Request, res: Response) => {
  try {
    const created = await unkey.keys.create({
      apiId: process.env.UNKEY_API_ID!,
      prefix: "capi_dev",
      byteLength: 16,
      ownerId: "Wilfred",
      expires: Date.now() + 2592000000, // 30 days from now
      ratelimit: {
        type: "fast",
        limit: 10,
        refillRate: 1,
        refillInterval: 1000,
      },
      remaining: 1000,
    });

    if (created) {

      /// TODO: Adjust this as per your authnentication logic
      await supabase.from("users").update({"key_id":created.keyId}).eq("email","test@example.com")

      return res.status(200).json({ key: created.key });
    }

    return res.status(500).json({ error: "Internal Server Error" });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
