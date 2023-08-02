// Purpose: middleware to handle invalid input errors.

import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { HttpResponseCode, CapiErrorCode } from "../utils/constants";

const handleInvalidInput = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HttpResponseCode.BAD_REQUEST).json({
      status: CapiErrorCode.CAPI_INVALID_INPUT,
      data: null,
      errors: errors.array().map((err) => {
        // Doing this because the 'path' property is present in the object but compiler says it doesn't exist. Print the object if you want to see it.
        const mErr = JSON.parse(JSON.stringify(err));

        return {
          field: mErr.path,
          message: mErr.msg,
        };
      }),
    });
  }
  next();
};

export { handleInvalidInput };
