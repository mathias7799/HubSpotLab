{
  "uid": "__SPOTKIT_UID___webhooks",
  "type": "webhooks",
  "config": {
    "settings": {
      "targetUrl": "__SPOTKIT_API_ORIGIN_JSON__/webhooks/hubspot",
      "maxConcurrentRequests": 10
    },
    "subscriptions": {
      "crmObjects": [
        {
          "subscriptionType": "object.creation",
          "objectType": "contact",
          "active": false
        },
        {
          "subscriptionType": "object.propertyChange",
          "objectType": "contact",
          "propertyName": "firstname",
          "active": false
        }
      ],
      "legacyCrmObjects": [],
      "hubEvents": []
    }
  }
}
