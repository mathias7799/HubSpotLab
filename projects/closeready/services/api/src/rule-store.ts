import { validateRule, type ReadinessRule } from "@hubspotlab/closeready-core";

import { seal, unseal } from "./crypto.js";

export interface RuleStore {
  readonly durable: boolean;
  list(portalId: number, pipelineId?: string): Promise<ReadinessRule[]>;
  put(portalId: number, rule: ReadinessRule): Promise<ReadinessRule>;
  delete(portalId: number, ruleId: string): Promise<void>;
}

export class MemoryRuleStore implements RuleStore {
  readonly durable = false;
  readonly #portals = new Map<number, Map<string, ReadinessRule>>();

  async list(portalId: number, pipelineId?: string): Promise<ReadinessRule[]> {
    return [...(this.#portals.get(portalId)?.values() ?? [])]
      .filter((rule) => !pipelineId || rule.pipelineId === pipelineId)
      .map(copyRule);
  }

  async put(portalId: number, rule: ReadinessRule): Promise<ReadinessRule> {
    assertValidRule(rule);
    const rules = this.#portals.get(portalId) ?? new Map();
    rules.set(rule.id, copyRule(rule));
    this.#portals.set(portalId, rules);
    return copyRule(rule);
  }

  async delete(portalId: number, ruleId: string): Promise<void> {
    this.#portals.get(portalId)?.delete(ruleId);
  }
}

export class UpstashRuleStore implements RuleStore {
  readonly durable = true;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly encryptionKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async list(portalId: number, pipelineId?: string): Promise<ReadinessRule[]> {
    const body = await this.command(["HGETALL", key(portalId)]);
    if (!Array.isArray(body.result)) {
      if (body.result === null || body.result === undefined) return [];
      throw new Error("Invalid rule-store response.");
    }
    const rules: ReadinessRule[] = [];
    for (let index = 1; index < body.result.length; index += 2) {
      const value = body.result[index];
      if (typeof value !== "string") throw new Error("Invalid stored rule.");
      const rule = JSON.parse(
        unseal(value, this.encryptionKey),
      ) as ReadinessRule;
      assertValidRule(rule);
      if (!pipelineId || rule.pipelineId === pipelineId) rules.push(rule);
    }
    return rules;
  }

  async put(portalId: number, rule: ReadinessRule): Promise<ReadinessRule> {
    assertValidRule(rule);
    await this.command([
      "HSET",
      key(portalId),
      rule.id,
      seal(JSON.stringify(rule), this.encryptionKey),
    ]);
    return copyRule(rule);
  }

  async delete(portalId: number, ruleId: string): Promise<void> {
    await this.command(["HDEL", key(portalId), ruleId]);
  }

  private async command(
    command: string[],
  ): Promise<{ result?: unknown; error?: string }> {
    const response = await this.fetcher(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const body = (await response.json()) as {
      result?: unknown;
      error?: string;
    };
    if (!response.ok || body.error) {
      throw new Error(body.error ?? "Rule store failed.");
    }
    return body;
  }
}

function key(portalId: number): string {
  return `closeready:rules:${portalId}`;
}

function assertValidRule(rule: ReadinessRule): void {
  const issues = validateRule(rule);
  if (issues.length) {
    throw new RuleStoreError(issues.map((issue) => issue.message).join(" "));
  }
}

function copyRule(rule: ReadinessRule): ReadinessRule {
  return JSON.parse(JSON.stringify(rule)) as ReadinessRule;
}

export class RuleStoreError extends Error {
  readonly status = 400;
}
