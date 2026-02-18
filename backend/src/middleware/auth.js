import { prismaStore } from "../data/prisma-store.js";

const parseBearer = (headerValue) => {
  if (!headerValue) {
    return null;
  }
  const [prefix, token] = headerValue.split(" ");
  if (prefix !== "Bearer" || !token) {
    return null;
  }
  return token;
};

export const requireAuth = async (req, res, next) => {
  const token = parseBearer(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: "Missing bearer token" });
  }

  const session = await prismaStore.getSession(token);
  if (!session) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const user = await prismaStore.getUserById(session.userId);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  req.auth = { token, session, user };
  return next();
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.auth?.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!roles.includes(req.auth.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
};
