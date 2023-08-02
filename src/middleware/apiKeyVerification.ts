// Purpose: API key verification middleware.

import { Request, Response, NextFunction } from "express";

const verifyApiKey = (req: Request, res: Response, next: NextFunction) => {
  // TODO: Implement API key verification
  next();
};

export default verifyApiKey;
