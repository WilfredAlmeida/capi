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

    const dbRes = await supabase.from("users").insert({ email: email }).select("user_id");

    return res.status(200).json({ 
      userId: dbRes.data![0].user_id,
    });

  },
);

export default router;
