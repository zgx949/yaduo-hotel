import { Router } from "express";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth } from "../middleware/auth.js";

export const tasksRoutes = Router();

tasksRoutes.get("/:taskId", requireAuth, async (req, res) => {
  const task = await prismaStore.getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: "Task not found" });
  }
  return res.json(task);
});
