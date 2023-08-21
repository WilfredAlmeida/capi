// Purpose: API key verification middleware.

import { Request, Response, NextFunction } from "express";
import unkey from "../unkey/unkey";

const verifyApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1].trim();

    const verification = await unkey.keys.verify({ key: token });

    if (!verification.valid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    next();
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export default verifyApiKey;
