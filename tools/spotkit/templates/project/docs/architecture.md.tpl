# __SPOTKIT_DISPLAY_NAME__ architecture

```mermaid
flowchart LR
  Page[HubSpot app page] --> API[Portable API]
  Card[HubSpot CRM card] --> API
  Settings[HubSpot settings] --> API
  API --> HubSpot[HubSpot CRM APIs]
```

HubSpot renders the product UI. The portable API owns secrets, OAuth tokens,
request verification, and operations unavailable to UI extensions. Keep domain
logic independent from the Node adapter so other HTTP runtimes can wrap it.
