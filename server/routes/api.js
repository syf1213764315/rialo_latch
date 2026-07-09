import { Router } from "express";
import { requireBearer } from "../auth.js";
import { addCheckin, listCheckins, publicUser } from "../store.js";

const router = Router();

/**
 * POST /api/v1/checkin
 * Auth: Bearer <api_key>
 * Body JSON: { note?: string, meta?: object }
 */
router.post("/checkin", requireBearer, (req, res) => {
  const note =
    typeof req.body?.note === "string" ? req.body.note.slice(0, 200) : null;
  const meta =
    req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)
      ? req.body.meta
      : null;

  const record = addCheckin({
    userId: req.user.id,
    method: "POST",
    endpoint: "/api/v1/checkin",
    note,
    payload: { note, meta },
  });

  res.status(201).json({
    ok: true,
    message: "打卡成功",
    user: publicUser(req.user),
    checkin: record,
  });
});

/** Public feed — no auth */
router.get("/checkins", (_req, res) => {
  res.json({ checkins: listCheckins(100) });
});

export default router;
