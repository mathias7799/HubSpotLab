{
  "uid": "__SPOTKIT_UID___example_event",
  "type": "app-event",
  "config": {
    "name": "__SPOTKIT_DISPLAY_NAME_JSON__ activity",
    "objectType": "CONTACT",
    "headerTemplate": "Completed [{{activityName}}]({{activityUrl}})",
    "detailTemplate": "Activity occurred at {{#formatDate timestamp}}{{/formatDate}}",
    "properties": [
      {
        "name": "activityName",
        "label": "Activity name",
        "type": "string"
      },
      {
        "name": "activityUrl",
        "label": "Activity URL",
        "type": "string"
      },
      {
        "name": "category",
        "label": "Category",
        "type": "enumeration",
        "options": [
          { "value": "standard", "label": "Standard" },
          { "value": "important", "label": "Important" }
        ]
      }
    ]
  }
}
