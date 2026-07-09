import serverless from "serverless-http";
import { createApp } from "../../server/app.js";

const app = createApp({ serveStatic: false });

export const handler = serverless(app, {
  binary: ["image/*", "application/octet-stream"],
});
