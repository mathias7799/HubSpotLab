import { createServer } from "node:http";

import { createRuntime } from "../runtime.js";
import { createNodeHandler } from "./node-handler.js";

const { app, config } = createRuntime();

createServer(createNodeHandler(app, config.publicUrl)).listen(
  config.port,
  () => {
    console.log(`TidsHub API listening on ${config.publicUrl}`);
  },
);
