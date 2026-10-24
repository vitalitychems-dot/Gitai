import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch {
    req.log.warn("Health dependency check failed");
    res.status(503).json({ status: "unavailable" });
  }
});

export default router;
