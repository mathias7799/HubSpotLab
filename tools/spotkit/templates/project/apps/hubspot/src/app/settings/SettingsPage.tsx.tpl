import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  Heading,
  LoadingSpinner,
  Text,
  TextArea,
  hubspot,
  useExtensionContext,
} from "@hubspot/ui-extensions";

import { API_ORIGIN } from "./backend.ts";

interface AppSettings {
  enabled: boolean;
  message: string;
}

type LoadState = "loading" | "ready" | "saving" | "error";

hubspot.extend<"settings">(() => <SettingsPage />);

function SettingsPage(): React.ReactElement {
  const context = useExtensionContext<"settings">();
  const portalId = context.portal.id;
  const [state, setState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<AppSettings>({
    enabled: true,
    message: "Ready to get started.",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    setSaved(false);
    try {
      setSettings(await request<AppSettings>(portalId));
      setState("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setState("error");
    }
  }, [portalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    setState("saving");
    setError(null);
    setSaved(false);
    try {
      setSettings(
        await request<AppSettings>(portalId, {
          method: "PUT",
          body: settings,
        }),
      );
      setSaved(true);
      setState("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setState("error");
    }
  }

  return (
    <Flex direction="column" gap="medium">
      <Heading>{"__SPOTKIT_DISPLAY_NAME_JSON__ settings"}</Heading>
      <Text>
        This working example stores encrypted, portal-specific application
        configuration through the signed API.
      </Text>
      {state === "loading" ? (
        <LoadingSpinner label="Loading settings" />
      ) : (
        <Flex direction="column" gap="small">
          {error ? (
            <Alert title="Settings could not be saved" variant="danger">
              {error}
            </Alert>
          ) : null}
          {saved ? (
            <Alert title="Settings saved" variant="success">
              The encrypted portal configuration is up to date.
            </Alert>
          ) : null}
          <Checkbox
            name="enabled"
            checked={settings.enabled}
            readOnly={state === "saving"}
            onChange={(enabled) => setSettings({ ...settings, enabled })}
          >
            Enable this application
          </Checkbox>
          <TextArea
            name="message"
            label="Workspace message"
            description="A short example value stored for this HubSpot account."
            value={settings.message}
            rows={3}
            resize="vertical"
            readOnly={state === "saving"}
            onInput={(message) =>
              setSettings({ ...settings, message: String(message) })
            }
            onChange={(message) =>
              setSettings({ ...settings, message: String(message) })
            }
          />
          <Button
            variant="primary"
            disabled={state === "saving" || settings.message.trim().length === 0}
            onClick={() => void save()}
          >
            {state === "saving" ? "Saving..." : "Save settings"}
          </Button>
          {state === "error" ? (
            <Button onClick={() => void load()}>Try again</Button>
          ) : null}
        </Flex>
      )}
    </Flex>
  );
}

async function request<Value>(
  portalId: number,
  options?: { method: "PUT"; body: AppSettings },
): Promise<Value> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/settings?portalId=${portalId}`,
    options
      ? {
          method: options.method,
          body: { ...options.body },
        }
      : undefined,
  );
  const body = (await response.json()) as Value & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with status ${response.status}.`);
  }
  return body;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : "An unexpected error occurred.";
}
