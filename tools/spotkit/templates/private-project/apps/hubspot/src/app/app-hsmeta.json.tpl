{
  "uid": "__SPOTKIT_UID___private_app",
  "type": "app",
  "config": {
    "description": "__SPOTKIT_DESCRIPTION_JSON__",
    "name": "__SPOTKIT_DISPLAY_NAME_JSON__",
    "distribution": "private",
    "auth": {
      "type": "static",
      "requiredScopes": ["oauth", "crm.objects.contacts.read"],
      "optionalScopes": [],
      "conditionallyRequiredScopes": []
    },
    "permittedUrls": {
      "fetch": ["https://api.hubapi.com"],
      "iframe": [],
      "img": []
    },
    "support": {
      "supportEmail": "__SPOTKIT_SUPPORT_EMAIL_JSON__",
      "documentationUrl": "https://github.com/mathias7799/HubSpotLab/tree/main/tools/spotkit",
      "supportUrl": "https://github.com/mathias7799/HubSpotLab/issues"
    }
  }
}
