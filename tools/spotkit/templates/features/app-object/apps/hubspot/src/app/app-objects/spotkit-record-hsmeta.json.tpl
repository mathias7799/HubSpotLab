{
  "uid": "__SPOTKIT_UID___record_object",
  "type": "app-object",
  "config": {
    "name": "__SPOTKIT_OBJECT_NAME__",
    "description": "A starter record managed by __SPOTKIT_DISPLAY_NAME_JSON__.",
    "singularForm": "App record",
    "pluralForm": "App records",
    "appPrefix": "__SPOTKIT_APP_PREFIX__",
    "primaryDisplayLabelPropertyName": "record_name",
    "secondaryDisplayLabelPropertyNames": ["external_id", "status"],
    "properties": [
      {
        "name": "record_name",
        "label": "Record name",
        "type": "string",
        "fieldType": "text"
      },
      {
        "name": "external_id",
        "label": "External ID",
        "type": "string",
        "fieldType": "text",
        "hasUniqueValue": true
      },
      {
        "name": "status",
        "label": "Status",
        "type": "enumeration",
        "fieldType": "select",
        "options": [
          { "label": "Active", "value": "active", "displayOrder": 0 },
          { "label": "Inactive", "value": "inactive", "displayOrder": 1 }
        ]
      },
      {
        "name": "description",
        "label": "Description",
        "type": "string",
        "fieldType": "textarea"
      }
    ],
    "propertyGroups": [],
    "defaultCreateFormFields": [
      {
        "propertyName": "record_name",
        "isRequired": true,
        "isRemovable": false
      },
      {
        "propertyName": "external_id",
        "isRequired": true,
        "isRemovable": false
      },
      {
        "propertyName": "status",
        "isRequired": false,
        "isRemovable": true
      }
    ],
    "settings": {
      "hasRecordPage": true,
      "allowsUserCreatedRecords": true,
      "hasEngagements": false
    }
  }
}
