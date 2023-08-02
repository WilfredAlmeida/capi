// Purpose: Verify the access token sent in the request header.

import { NextFunction, Request, Response } from "express";
import * as jose from "jose";
import { logger } from "../logger/index";

const verifyAccessToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const jwtSecret = process.env.JWT_SECRET || null;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET not set");
  }
  const secret = new TextEncoder().encode(jwtSecret);

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1].trim();

    try {
      const decodedJwt = await jose.jwtVerify(token, secret, {
        algorithms: ["HS256"],
        issuer: "https://wilfredalmeida.com",
        audience: "ANYONE",
      });

      req.user = { userId: decodedJwt.payload.sub };
    } catch (err) {
      logger.info("ERROR: ", err);
      return res.status(401).json({ message: "Unauthorized" });
    }

    next();
  } else {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export default verifyAccessToken;
