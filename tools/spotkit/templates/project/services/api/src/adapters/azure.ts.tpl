import { app as azure } from "@azure/functions";
import { createAzureFunctionsHandler } from "@hubspotlab/spotkit-runtime";

import { createApp } from "../app.js";

const handler = createAzureFunctionsHandler(createApp());

azure.http("__SPOTKIT_UID__-api", {
  authLevel: "anonymous",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  route: "{*path}",
  handler,
});
