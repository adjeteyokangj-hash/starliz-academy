import { randomUUID } from "crypto";
import type { AuditEvent, EscalationRecord, SafeguardingIncident, TimelineEvent } from "./contracts";

type SchoolIncidentStore = {
  incidents: Record<string, SafeguardingIncident>;
  timelineByIncident: Record<string, TimelineEvent[]>;
  escalationByIncident: Record<string, EscalationRecord[]>;
  auditByIncident: Record<string, AuditEvent[]>;
};

type SafeguardingStore = {
  schools: Record<string, SchoolIncidentStore>;
};

type GlobalWithSafeguardingStore = typeof globalThis & {
  __starlizSafeguardingStore?: SafeguardingStore;
};

function getStore(): SafeguardingStore {
  const globalState = globalThis as GlobalWithSafeguardingStore;
  if (!globalState.__starlizSafeguardingStore) {
    globalState.__starlizSafeguardingStore = { schools: {} };
  }
  return globalState.__starlizSafeguardingStore;
}

function getSchoolStore(schoolId: string): SchoolIncidentStore {
  const store = getStore();
  if (!store.schools[schoolId]) {
    store.schools[schoolId] = {
      incidents: {},
      timelineByIncident: {},
      escalationByIncident: {},
      auditByIncident: {},
    };
  }
  return store.schools[schoolId];
}

export function createIncident(schoolId: string, incident: Omit<SafeguardingIncident, "id" | "schoolId">): SafeguardingIncident {
  const schoolStore = getSchoolStore(schoolId);
  const id = `inc-${randomUUID().slice(0, 8)}`;
  const record: SafeguardingIncident = {
    ...incident,
    id,
    schoolId,
  };
  schoolStore.incidents[id] = record;
  schoolStore.timelineByIncident[id] = schoolStore.timelineByIncident[id] ?? [];
  schoolStore.escalationByIncident[id] = schoolStore.escalationByIncident[id] ?? [];
  schoolStore.auditByIncident[id] = schoolStore.auditByIncident[id] ?? [];
  return record;
}

export function listIncidents(schoolId: string): SafeguardingIncident[] {
  const schoolStore = getSchoolStore(schoolId);
  return Object.values(schoolStore.incidents).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getIncident(schoolId: string, incidentId: string): SafeguardingIncident | null {
  const schoolStore = getSchoolStore(schoolId);
  return schoolStore.incidents[incidentId] ?? null;
}

export function updateIncident(schoolId: string, incidentId: string, patch: Partial<SafeguardingIncident>): SafeguardingIncident | null {
  const schoolStore = getSchoolStore(schoolId);
  const existing = schoolStore.incidents[incidentId];
  if (!existing) return null;
  const updated: SafeguardingIncident = {
    ...existing,
    ...patch,
  };
  schoolStore.incidents[incidentId] = updated;
  return updated;
}

export function appendTimelineEvent(schoolId: string, incidentId: string, event: TimelineEvent): TimelineEvent {
  const schoolStore = getSchoolStore(schoolId);
  schoolStore.timelineByIncident[incidentId] = schoolStore.timelineByIncident[incidentId] ?? [];
  schoolStore.timelineByIncident[incidentId].push(event);
  return event;
}

export function listTimelineEvents(schoolId: string, incidentId: string): TimelineEvent[] {
  const schoolStore = getSchoolStore(schoolId);
  return [...(schoolStore.timelineByIncident[incidentId] ?? [])].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function appendEscalationRecord(schoolId: string, incidentId: string, escalation: EscalationRecord): EscalationRecord {
  const schoolStore = getSchoolStore(schoolId);
  schoolStore.escalationByIncident[incidentId] = schoolStore.escalationByIncident[incidentId] ?? [];
  schoolStore.escalationByIncident[incidentId].push(escalation);
  return escalation;
}

export function listEscalations(schoolId: string, incidentId: string): EscalationRecord[] {
  const schoolStore = getSchoolStore(schoolId);
  return [...(schoolStore.escalationByIncident[incidentId] ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function appendAuditEvent(schoolId: string, incidentId: string, event: AuditEvent): AuditEvent {
  const schoolStore = getSchoolStore(schoolId);
  schoolStore.auditByIncident[incidentId] = schoolStore.auditByIncident[incidentId] ?? [];
  schoolStore.auditByIncident[incidentId].push(event);
  return event;
}

export function listAuditEvents(schoolId: string, incidentId: string): AuditEvent[] {
  const schoolStore = getSchoolStore(schoolId);
  return [...(schoolStore.auditByIncident[incidentId] ?? [])].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}
