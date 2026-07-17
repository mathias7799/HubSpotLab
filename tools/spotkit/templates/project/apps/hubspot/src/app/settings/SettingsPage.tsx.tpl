import React from "react";
import { Alert, Flex, Heading, Text, hubspot } from "@hubspot/ui-extensions";

hubspot.extend<"settings">(() => <SettingsPage />);

function SettingsPage(): React.ReactElement {
  return (
    <Flex direction="column" gap="medium">
      <Heading>{"__SPOTKIT_DISPLAY_NAME_JSON__ settings"}</Heading>
      <Text>Use this surface for installation health and administrator configuration.</Text>
      <Alert title="Generated with SpotKit" variant="info">
        Connect the settings page to the portable API before production.
      </Alert>
    </Flex>
  );
}
