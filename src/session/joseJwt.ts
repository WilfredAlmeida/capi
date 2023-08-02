// Purpose: JWT generation using JOSE.

import * as jose from "jose";
import { logger } from "../logger/index";

const generateTokens = async (
  userId: string,
  status?: string,
  duration?: string,
) => {
  const jwtSecret = process.env.JWT_SECRET || null;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET not set");
  }

  const jwtPayload = status ? { sub: userId, status: status } : { sub: userId };

  const secret = new TextEncoder().encode(jwtSecret);
  const alg = "HS256";

  const jwt = await new jose.SignJWT(jwtPayload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer("https://wilfredalmeida.com")
    .setAudience("ANYONE")
    .setExpirationTime(duration ? duration : "10m") // default value or passed custom duration
    .sign(secret);

  const refreshToken = await new jose.SignJWT({
    sub: userId,
    type: "refresh",
  })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer("https://wilfredalmeida.com")
    .setAudience("ANYONE")
    .setExpirationTime("7d")
    .sign(secret);

  return { jwt, refreshToken };
};

const verifyRefreshToken = async (token: string) => {
  const jwtSecret = process.env.JWT_SECRET || null;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET not set");
  }

  const secret = new TextEncoder().encode(jwtSecret);
  const alg = "HS256";

  try {
    const result = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    return [true, result];
  } catch (err) {
    logger.error(err);
    return [false, null];
  }
};

export { generateTokens, verifyRefreshToken };
