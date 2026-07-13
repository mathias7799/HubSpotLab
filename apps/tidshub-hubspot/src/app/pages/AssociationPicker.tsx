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

const objectTypeOptions = [
  { label: "Deal", value: "deals" },
  { label: "Virksomhed", value: "companies" },
  { label: "Kontakt", value: "contacts" },
  { label: "Ticket", value: "tickets" },
];

export function AssociationPicker({
  portalId,
  selected,
  disabled,
  onSelectedChange,
}: {
  portalId: number;
  selected: CrmAssociationResult | null;
  disabled: boolean;
  onSelectedChange: (result: CrmAssociationResult | null) => void;
}): React.ReactElement {
  const [objectType, setObjectType] = useState<SearchableObjectType>("deals");
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
      <Text format={{ fontWeight: "demibold" }}>Tilknyt CRM-post</Text>
      <Text>Valgfrit. Skriv mindst to tegn, så søger TidsHub automatisk.</Text>
      <Flex direction="row" gap="small" align="end">
        <Select
          name="associationType"
          label="Type"
          value={objectType}
          options={objectTypeOptions}
          readOnly={disabled}
          onChange={(value) => {
            setObjectType(String(value) as SearchableObjectType);
            setResults([]);
            setSearched(false);
            setError(null);
            onSelectedChange(null);
          }}
        />
        <Input
          name="associationQuery"
          label="Søg i HubSpot"
          value={query}
          placeholder="Navn, e-mail, domæne eller titel"
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
          <StatusTag variant="success">Tilknyttes: {selected.label}</StatusTag>
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
