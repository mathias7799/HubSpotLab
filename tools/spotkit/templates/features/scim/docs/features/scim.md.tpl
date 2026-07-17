# __SPOTKIT_DISPLAY_NAME__ SCIM

SCIM automates HubSpot user provisioning from an identity provider. It requires
a private static app, HubSpot Professional or Enterprise, enabled SSO, a
verified domain, and is limited to one SCIM app per HubSpot account.

Role synchronization starts disabled. Before enabling it, create matching
HubSpot permission-set names in the identity provider and test provisioning,
updates, suspension, and deprovisioning in a non-production account.

After installation, configure the identity provider with HubSpot's tenant URL
`https://api.hubspot.com/scim/v2` and the private-app token shown by HubSpot.
