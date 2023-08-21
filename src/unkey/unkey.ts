import { Unkey } from "@unkey/api";
import dotenv from "dotenv";
dotenv.config();

const unkey = new Unkey({ token: process.env.UNKEY_KEY! });

export default unkey;
