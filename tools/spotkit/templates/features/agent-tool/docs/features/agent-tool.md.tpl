# __SPOTKIT_DISPLAY_NAME__ agent tool

HubSpot agent tools are workflow actions whose `supportedClients` include
`AGENTS`. They require gated account access. The generated tool is unpublished,
signature-verified, input-validated, and callback-idempotent.

Keep tools narrow and explicit. Validate every model-supplied input, enforce
portal authorization, minimize CRM scopes, bound output size, and require human
confirmation before destructive or externally visible actions.
