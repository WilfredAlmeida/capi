// Purpose: Winston logger for development environment.

import { createLogger, format, transports } from "winston";

const developmentLogger = () => {
  const myFormat = format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  });

  return createLogger({
    level: "debug",
    // format: winston.format.simple(),
    format: format.combine(
      format.colorize(),
      format.label({ label: "cnft-api" }),
      format.timestamp({ format: "HH:mm:ss" }),
      myFormat,
    ),

    //defaultMeta: { service: 'user-service' },
    transports: [
      new transports.Console(),
      // new transports.File({
      //     filename: 'errors.log',

      //   })
    ],
  });
};

export { developmentLogger };
