import React from "react";
import {
  Button,
  EmptyState,
  Flex,
  Heading,
  Select,
  StatusTag,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@hubspot/ui-extensions";

import type { ApprovalSettings, HubSpotUser, WeekApproval } from "./api.ts";
import { formatMinutes } from "./week.ts";

export function WeekSubmissionBar({
  week,
  settings,
  hasEntries,
  busy,
  onSubmit,
}: {
  week: WeekApproval | null;
  settings: ApprovalSettings | null;
  hasEntries: boolean;
  busy: boolean;
  onSubmit: () => void;
}): React.ReactElement {
  if (week?.status === "approved") {
    return (
      <Flex direction="row" gap="small" align="center">
        <StatusTag variant="success">Ugen er godkendt</StatusTag>
        <Text>Godkendt af {week.approvedByEmail ?? week.approverEmail}.</Text>
      </Flex>
    );
  }
  if (week?.status === "submitted") {
    return (
      <Flex direction="row" gap="small" align="center">
        <StatusTag variant="warning">Afventer godkendelse</StatusTag>
        <Text>Sendt til {week.approverEmail}.</Text>
      </Flex>
    );
  }
  return (
    <Flex direction="row" gap="small" align="center">
      <StatusTag variant="default">Kladde</StatusTag>
      {settings?.approverEmail ? (
        <Text>Godkendes af {settings.approverEmail}.</Text>
      ) : (
        <Text>Vælg en godkendelsesansvarlig under Godkendelser.</Text>
      )}
      <Button
        variant="primary"
        onClick={onSubmit}
        disabled={busy || !hasEntries || !settings?.approverId}
      >
        Indsend uge
      </Button>
    </Flex>
  );
}

export function ApprovalPanel({
  users,
  currentUserId,
  settings,
  selectedApproverId,
  pending,
  busy,
  onApproverChange,
  onSaveApprover,
  onApprove,
}: {
  users: HubSpotUser[];
  currentUserId: string;
  settings: ApprovalSettings | null;
  selectedApproverId: string;
  pending: WeekApproval[];
  busy: boolean;
  onApproverChange: (id: string) => void;
  onSaveApprover: () => void;
  onApprove: (week: WeekApproval) => void;
}): React.ReactElement {
  const approvers = users.filter((user) => user.id !== currentUserId);
  return (
    <Flex direction="column" gap="large">
      <Flex direction="column" gap="small">
        <Heading>Min godkendelsesansvarlige</Heading>
        <Text>
          Vælg den leder eller kollega, der må godkende dine indsendte uger.
        </Text>
        <Select
          name="approvalOfficer"
          label="Godkendelsesansvarlig"
          value={selectedApproverId}
          options={[
            { label: "Vælg en bruger", value: "" },
            ...approvers.map((user) => ({
              label: `${user.label} (${user.email})`,
              value: user.id,
            })),
          ]}
          readOnly={busy}
          onChange={(value) => onApproverChange(String(value))}
        />
        <Button
          variant="primary"
          onClick={onSaveApprover}
          disabled={busy || !selectedApproverId}
        >
          Gem godkendelsesansvarlig
        </Button>
        {settings?.approverEmail ? (
          <StatusTag variant="success">
            Aktiv: {settings.approverEmail}
          </StatusTag>
        ) : null}
      </Flex>

      <Flex direction="column" gap="small">
        <Heading>Uger til min godkendelse</Heading>
        {pending.length === 0 ? (
          <EmptyState title="Ingen uger afventer" layout="vertical">
            <Text>
              Indsendte uger vises her, når du er valgt som godkender.
            </Text>
          </EmptyState>
        ) : (
          <Table bordered density="compact">
            <TableHead>
              <TableRow>
                <TableHeader>Medarbejder</TableHeader>
                <TableHeader>Uge</TableHeader>
                <TableHeader>Registreret</TableHeader>
                <TableHeader>Handling</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((week) => (
                <TableRow key={week.id}>
                  <TableCell>{week.ownerEmail}</TableCell>
                  <TableCell>{week.weekKey}</TableCell>
                  <TableCell>{formatMinutes(week.totalMinutes)}</TableCell>
                  <TableCell>
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => onApprove(week)}
                      disabled={busy}
                    >
                      Godkend
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Flex>
    </Flex>
  );
}
