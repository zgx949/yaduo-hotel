import { Router } from "express";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const usersRoutes = Router();

usersRoutes.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await prismaStore.listUsers();
  return res.json({ items });
});

usersRoutes.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { username, name, role, status, password, permissions } = req.body || {};
  if (!username || !name) {
    return res.status(400).json({ message: "username and name are required" });
  }
  const existed = await prismaStore.getUserByUsername(username);
  if (existed) {
    return res.status(409).json({ message: "username already exists" });
  }
  const item = await prismaStore.createUser({ username, name, role, status, password, permissions });
  return res.status(201).json(item);
});

usersRoutes.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const item = await prismaStore.updateUser(req.params.id, req.body || {});
  if (!item) {
    return res.status(404).json({ message: "User not found" });
  }
  return res.json(item);
});
