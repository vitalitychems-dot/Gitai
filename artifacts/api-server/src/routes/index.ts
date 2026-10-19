import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gitaiRouter from "./gitai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gitaiRouter);

export default router;
