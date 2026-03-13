import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Allow export endpoint via query param (browser download link)
  if (req.path.includes("/export") && req.query["api_key"] === config.apiKey) {
    next();
    return;
  }

  const key =
    req.headers["x-api-key"] ??
    req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, "");

  if (key !== config.apiKey) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
}
