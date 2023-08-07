// Purpose: Index file for the server.

import dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";

// import { API_URLS, API_BASE_URL } from "./utils/constants";
import { logger } from "./logger/index";
import nft from "./routes/nft"
import { API_BASE_URL, API_URLS } from "./utils/constants";

dotenv.config();

// IMP: Do not change the order of the bellow app.use() calls
// It has middleware & routes config that needs to be in a specific order

const app = express();
const port = process.env.PORT || 6565;

app.use(cors());
app.use(express.json({limit: '200mb'}));

// The CORS middleware
app.use(function (req, res, next) {
  // Website you wish to allow to connect
  // TODO: Change this to the actual client URL in production
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Request methods you wish to allow
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE",
  );
  // Request headers you wish to allow
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type",
  );
  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader("Access-Control-Allow-Credentials", "true");
  // Pass to next layer of middleware
  next();
});

app.use(`${API_BASE_URL}/${API_URLS.NFT}`,nft)

app.get(`/`, (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
  <html>
  <head>
    <title>cNFT API as a Service</title>
  </head>
  <body>
    <h1>Server is up and running.</h1>
  </body>
  </html>`);
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
