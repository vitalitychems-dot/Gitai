import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { releaseReadiness } from "../lib/release-readiness";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
  try {
    const readiness = releaseReadiness();
    if (!readiness.ready) {
      req.log.warn({ ownerConfigured: readiness.ownerConfigured, durableGitAvailable: readiness.durableGitAvailable },
        "Production prerequisites are unavailable");
      res.status(503).json({ status: "unavailable" });
      return;
    }
    await pool.query("SELECT 1");
    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch {
    req.log.warn("Health dependency check failed");
    res.status(503).json({ status: "unavailable" });
  }
});

export default router;
