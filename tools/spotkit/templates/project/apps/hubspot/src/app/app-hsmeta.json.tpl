{
  "uid": "__SPOTKIT_UID___app",
  "type": "app",
  "config": {
    "description": "__SPOTKIT_DESCRIPTION_JSON__",
    "name": "__SPOTKIT_DISPLAY_NAME_JSON__",
    "distribution": "marketplace",
    "auth": {
      "type": "oauth",
      "redirectUrls": ["__SPOTKIT_API_ORIGIN_JSON__/oauth/callback"],
      "requiredScopes": ["oauth", "crm.objects.deals.read"],
      "optionalScopes": [],
      "conditionallyRequiredScopes": []
    },
    "permittedUrls": {
      "fetch": ["__SPOTKIT_API_ORIGIN_JSON__"],
      "iframe": [],
      "img": []
    },
    "support": {
      "supportEmail": "__SPOTKIT_SUPPORT_EMAIL_JSON__",
      "documentationUrl": "https://example.com/docs",
      "supportUrl": "https://example.com/support"
    }
  }
}
