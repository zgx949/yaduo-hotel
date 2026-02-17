import { Router } from "express";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";

export const authRoutes = Router();

authRoutes.post("/login", (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ message: "username is required" });
  }

  const user = store.users.find((it) => it.username === username && it.status === "ACTIVE");
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = store.createSession(user);
  return res.json({
    token,
    user
  });
});

authRoutes.post("/logout", requireAuth, (req, res) => {
  store.deleteSession(req.auth.token);
  return res.json({ ok: true });
});

authRoutes.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.auth.user });
});
