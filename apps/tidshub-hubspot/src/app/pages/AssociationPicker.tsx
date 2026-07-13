import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  LoadingSpinner,
  Select,
  StatusTag,
  Text,
} from "@hubspot/ui-extensions";

import {
  humanizeApiError,
  searchCrmAssociations,
  type CrmAssociationResult,
} from "./api.ts";

type SearchableObjectType = CrmAssociationResult["objectType"];

const primaryObjectTypeOptions = [
  { label: "Projekt", value: "projects" },
  { label: "Deal", value: "deals" },
  { label: "Virksomhed", value: "companies" },
  { label: "Kontakt", value: "contacts" },
  { label: "Ticket", value: "tickets" },
];

export function AssociationPicker({
  portalId,
  selected,
  disabled,
  kind = "primary",
  onSelectedChange,
}: {
  portalId: number;
  selected: CrmAssociationResult | null;
  disabled: boolean;
  kind?: "primary" | "task";
  onSelectedChange: (result: CrmAssociationResult | null) => void;
}): React.ReactElement {
  const [objectType, setObjectType] = useState<SearchableObjectType>(
    kind === "task" ? "tasks" : "projects",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CrmAssociationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQuery(value: string): void {
    setQuery(value);
    setResults([]);
    setSearched(false);
    setError(null);
    onSelectedChange(null);
  }

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (disabled || selected || normalizedQuery.length < 2) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      void searchCrmAssociations({
        portalId,
        objectType,
        query: normalizedQuery,
      })
        .then((nextResults) => {
          if (!cancelled) {
            setResults(nextResults);
            setSearched(true);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(humanizeApiError(cause));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [disabled, objectType, portalId, query, selected]);

  return (
    <Flex direction="column" gap="small">
      <Text format={{ fontWeight: "demibold" }}>
        {kind === "task" ? "Tilknyt opgave" : "Tilknyt projekt / CRM-post"}
      </Text>
      <Text>
        {kind === "task"
          ? "Valgfrit. Tilføj en HubSpot-opgave oven på projektet eller CRM-posten."
          : "Valgfrit. Vælg det projekt eller den CRM-post, tiden vedrører."}
      </Text>
      <Flex direction="row" gap="small" align="end">
        {kind === "primary" ? (
          <Select
            name="associationType"
            label="Type"
            value={objectType}
            options={primaryObjectTypeOptions}
            readOnly={disabled}
            onChange={(value) => {
              setObjectType(String(value) as SearchableObjectType);
              setResults([]);
              setSearched(false);
              setError(null);
              onSelectedChange(null);
            }}
          />
        ) : null}
        <Input
          name={kind === "task" ? "taskAssociationQuery" : "associationQuery"}
          label={kind === "task" ? "Søg efter opgave" : "Søg i HubSpot"}
          value={query}
          placeholder={
            kind === "task"
              ? "Opgavens titel"
              : "Navn, e-mail, domæne eller titel"
          }
          readOnly={disabled}
          onInput={(value) => updateQuery(String(value))}
          onChange={(value) => updateQuery(String(value))}
        />
      </Flex>

      {searching ? <LoadingSpinner label="Søger i HubSpot" /> : null}
      {error ? (
        <Alert title="CRM-søgning" variant="danger">
          {error}
        </Alert>
      ) : null}
      {!searching && searched && results.length === 0 ? (
        <Text>Ingen resultater matcher søgningen.</Text>
      ) : null}
      {!selected && results.length > 0 ? (
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: "demibold" }}>Vælg et resultat</Text>
          {results.slice(0, 5).map((result) => (
            <Button
              key={`${result.objectType}:${result.id}`}
              type="button"
              variant="secondary"
              size="sm"
              truncate
              onClick={() => {
                onSelectedChange(result);
                setResults([]);
                setSearched(false);
              }}
            >
              {result.secondary
                ? `${result.label} - ${result.secondary}`
                : result.label}
            </Button>
          ))}
        </Flex>
      ) : null}
      {selected ? (
        <Flex direction="row" gap="small" align="center">
          <StatusTag variant="success">
            {kind === "task" ? "Opgave" : "CRM"}: {selected.label}
          </StatusTag>
          <Button
            type="button"
            size="xs"
            variant="transparent"
            disabled={disabled}
            onClick={() => onSelectedChange(null)}
          >
            Fjern
          </Button>
        </Flex>
      ) : null}
    </Flex>
  );
}
