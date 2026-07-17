import { hubspot } from "@hubspot/ui-extensions";
import { createPageRouter, PageRoutes } from "@hubspot/ui-extensions/pages";

import { HomePage } from "./HomePage.tsx";

const PageRouter = createPageRouter(
  <PageRoutes>
    <PageRoutes.IndexRoute component={HomePage} id="overview" />
  </PageRoutes>,
);

hubspot.extend<"pages">(() => <PageRouter />);
