import { createServer } from "node:http";

import { createApp } from "../app.js";
import { createNodeHandler } from "./node-handler.js";

const port = Number(process.env.PORT ?? 8788);
const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
const displayName = "__SPOTKIT_DISPLAY_NAME_JSON__";

createServer(createNodeHandler(createApp(), publicUrl)).listen(port, () => {
  console.log(`${displayName} API listening on ${publicUrl}`);
});
