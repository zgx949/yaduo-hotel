import { Router } from "express";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";

export const authRoutes = Router();

authRoutes.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "username and password are required" });
  }

  const user = store.getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!store.verifyUserPassword(user, password)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (user.status === "PENDING") {
    return res.status(403).json({ message: "账号待审核，请联系管理员开通后登录" });
  }

  if (user.status !== "ACTIVE") {
    return res.status(403).json({ message: "账号不可用，请联系管理员" });
  }

  const token = store.createSession(user);
  const safeUser = { ...user };
  delete safeUser.password;

  return res.json({
    token,
    user: safeUser
  });
});

authRoutes.post("/register", (req, res) => {
  const { username, name, password } = req.body || {};
  if (!username || !name || !password) {
    return res.status(400).json({ message: "username, name and password are required" });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: "password must be at least 6 characters" });
  }

  const existed = store.getUserByUsername(username);
  if (existed) {
    return res.status(409).json({ message: "username already exists" });
  }

  const user = store.createRegistration({ username, name, password });
  return res.status(201).json({
    user,
    message: "注册成功，等待管理员审核后可登录"
  });
});

authRoutes.post("/logout", requireAuth, (req, res) => {
  store.deleteSession(req.auth.token);
  return res.json({ ok: true });
});

authRoutes.get("/me", requireAuth, (req, res) => {
  const safeUser = { ...req.auth.user };
  delete safeUser.password;
  return res.json({ user: safeUser });
});
