import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { apiRoutes } from "./routes/index.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/", (req, res) => {
  return res.json({
    message: "SkyHotel Agent Pro backend is running",
    apiPrefix: env.apiPrefix
  });
});

app.use(env.apiPrefix, apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
