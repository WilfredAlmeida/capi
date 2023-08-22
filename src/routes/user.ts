import { Router, Request, Response } from "express";
import verifyApiKey from "../middleware/apiKeyVerification";
import { body } from "express-validator";
import supabase from "../db/supabase";
import { handleInvalidInput } from "../middleware/invalidInputHandler";
import { ulid } from "ulid";

const router = Router();

router.post(
  "/create",
  verifyApiKey,
  [
    body("email")
      .trim()
      .escape()
      .notEmpty()
      .isEmail()
      .withMessage("Invalid email"),
  ],
  handleInvalidInput,
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const id = ulid();

    await supabase.from("users").insert({ user_id: id, email: email });
  },
);

export default router;
