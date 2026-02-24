import { Router } from "express";
import type { Request, Response } from "express";
import { handleWebhook } from "../services/webhookHandler";

const router = Router();

router.post("/supabase", async (req: Request, res: Response): Promise<void> => {
  const secret = req.headers["x-webhook-secret"];

  //   if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
  //     res.status(401).json({ error: "Invalid webhook secret" });
  //     return;
  //   }

  // Acknowledge immediately — Supabase expects fast response
  res.status(200).json({ received: true });

  // Process asynchronously so we don't block the response
  handleWebhook(req.body).catch((err: any) => {
    console.error("[Webhook] Processing error:", err);
  });
});

export default router;
