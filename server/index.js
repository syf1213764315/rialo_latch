import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT || 8787);
const app = createApp({ serveStatic: true });

app.listen(port, () => {
  console.log(`rialo-latch listening on http://localhost:${port}`);
  console.log(`Discord callback: ${process.env.DISCORD_REDIRECT_URI}`);
  if (process.env.DISCORD_PROXY) {
    console.log(`Discord proxy: ${process.env.DISCORD_PROXY}`);
  } else {
    console.log("Discord proxy: (none)");
  }
});
