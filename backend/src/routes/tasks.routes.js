import { Router } from "express";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";

export const tasksRoutes = Router();

tasksRoutes.get("/:taskId", requireAuth, (req, res) => {
  const task = store.getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: "Task not found" });
  }
  return res.json(task);
});
