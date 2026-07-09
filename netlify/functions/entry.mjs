import serverless from "serverless-http";
import { initDb } from "../../server/db.js";
import { createApp } from "../../server/app.js";

let run;

export const handler = async (event, context) => {
  if (!run) {
    await initDb();
    const app = createApp({ serveStatic: false });
    run = serverless(app, {
      binary: ["image/*", "application/octet-stream"],
    });
  }
  return run(event, context);
};
