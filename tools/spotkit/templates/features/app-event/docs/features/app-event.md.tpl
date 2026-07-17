# __SPOTKIT_DISPLAY_NAME__ app event

App events add product-owned activities to CRM timelines. They require HubSpot
approval and an OAuth marketplace app. Customize the definition before upload;
property names become part of its long-lived reporting contract.

`sendAppEvent` uses the installed portal token and HubSpot's `/events/v3/send`
API. After upload, pass the fully qualified event name assigned by HubSpot. Keep
properties aligned with the metadata definition and never send secrets or
unnecessary personal data.
