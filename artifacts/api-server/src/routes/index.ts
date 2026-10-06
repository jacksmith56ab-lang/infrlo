import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import catalogRouter from "./catalog";
import dashboardRouter from "./dashboard";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(usersRouter);
router.use(catalogRouter);
router.use(botRouter);

export default router;
