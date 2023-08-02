// Purpose: Winston logger for environments.

// TODO: Add loggers for other environments as they go live.

// import winston from "winston/lib/winston/config/index.js";
import { Logger } from "winston";
import { developmentLogger } from "./developmentLogger";

let logger: Logger;

if (process.env.NODE_ENV === "development") {
  logger = developmentLogger();
}

// if (process.env.NODE_ENV === "staging") {
//     logger = youtubeLogger()
// }

// if (process.env.NODE_ENV === "production") {
//     logger = productionLogger()
// }

export { logger };
