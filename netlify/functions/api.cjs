const serverless = require("serverless-http");

let cachedHandler;

module.exports.handler = async (event, context) => {
  if (!cachedHandler) {
    const { createApp } = await import("../../server/app.js");
    const app = createApp({ serveStatic: false });
    cachedHandler = serverless(app, {
      binary: ["image/*", "application/octet-stream"],
    });
  }
  return cachedHandler(event, context);
};
