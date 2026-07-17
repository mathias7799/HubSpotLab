import { createAwsLambdaHandler } from "@hubspotlab/spotkit-runtime";

import { createApp } from "../app.js";

const publicUrl = process.env.PUBLIC_URL;
if (!publicUrl) throw new Error("Missing required environment variable PUBLIC_URL.");

export const handler = createAwsLambdaHandler(createApp(), publicUrl);
