import { Router } from "express";
import { healthRoutes } from "./health.routes.js";
import { authRoutes } from "./auth.routes.js";
import { usersRoutes } from "./users.routes.js";
import { poolRoutes } from "./pool.routes.js";
import { ordersRoutes } from "./orders.routes.js";
import { tasksRoutes } from "./tasks.routes.js";
import { blacklistRoutes } from "./blacklist.routes.js";
import { hotelsRoutes } from "./hotels.routes.js";
import { systemRoutes } from "./system.routes.js";

export const apiRoutes = Router();

apiRoutes.use(healthRoutes);
apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/users", usersRoutes);
apiRoutes.use("/pool", poolRoutes);
apiRoutes.use("/orders", ordersRoutes);
apiRoutes.use("/tasks", tasksRoutes);
apiRoutes.use("/blacklist", blacklistRoutes);
apiRoutes.use("/hotels", hotelsRoutes);
apiRoutes.use("/system", systemRoutes);
