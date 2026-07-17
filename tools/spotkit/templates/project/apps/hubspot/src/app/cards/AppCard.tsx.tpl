import React from "react";
import { EmptyState, Text, hubspot } from "@hubspot/ui-extensions";

hubspot.extend<"crm.record.sidebar">(() => <AppCard />);

function AppCard(): React.ReactElement {
  return (
    <EmptyState
      imageName="deals"
      layout="vertical"
      title={"__SPOTKIT_DISPLAY_NAME_JSON__"}
    >
      <Text>Add the first deal-card workflow here.</Text>
    </EmptyState>
  );
}
