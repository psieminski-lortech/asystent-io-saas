import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// CORS — allow all origins (snippet runs on client stores)
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "asystent.io-api", version: "1.0.0" });
});

// API routes
app.use("/api/v1", apiRouter);

// Serve the JS snippet as a static file
app.use("/js", express.static(path.join(__dirname, "public/js")));

// Serve dashboard
app.use("/dashboard", express.static(path.join(__dirname, "public/dashboard")));

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Asystent.io API running on http://localhost:${port}`);
  console.log(`  Health: http://localhost:${port}/health`);
  console.log(`  API:    http://localhost:${port}/api/v1/`);
  console.log(`  Snippet: http://localhost:${port}/js/asystent.js`);
});
