import { hubspot } from "@hubspot/ui-extensions";
import { createPageRouter, PageRoutes } from "@hubspot/ui-extensions/pages";

import { HomePage } from "./HomePage.tsx";
import { SettingsPage } from "./SettingsPage.tsx";

const PageRouter = createPageRouter(
  <PageRoutes>
    <PageRoutes.IndexRoute component={HomePage} id="overview" />
    <PageRoutes.Route path="/settings" component={SettingsPage} id="settings" />
  </PageRoutes>,
);

hubspot.extend<"pages">(() => <PageRouter />);
