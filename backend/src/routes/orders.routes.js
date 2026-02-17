import { Router } from "express";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";
import { processOrderTask } from "../services/task-processor.js";

export const ordersRoutes = Router();

ordersRoutes.get("/", requireAuth, (req, res) => {
  const items = store.listOrders();
  if (req.auth.user.role === "ADMIN") {
    return res.json({ items });
  }
  return res.json({ items: items.filter((it) => it.creatorId === req.auth.user.id) });
});

ordersRoutes.post("/", requireAuth, async (req, res) => {
  const { hotelName, customerName, price } = req.body || {};
  if (!hotelName || !customerName || !price) {
    return res.status(400).json({ message: "hotelName, customerName, price are required" });
  }

  const order = store.createOrder({ hotelName, customerName, price }, req.auth.user);
  const task = store.createTask(order.id);

  processOrderTask(task.id).catch((err) => {
    store.updateTask(task.id, {
      state: "failed",
      error: err.message || "Task failed"
    });
    store.updateOrder(order.id, { status: "FAILED" });
  });

  return res.status(201).json({ order, task });
});
