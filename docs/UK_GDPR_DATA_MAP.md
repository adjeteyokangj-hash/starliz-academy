# UK GDPR Data Map (Phase 5 Draft)

Status: Internal draft for engineering and operations alignment.
Legal review: Required before production launch publication.

## Scope
- Product: StarLiz Academy parent and child learning platform.
- Region: United Kingdom launch scope.
- Data subjects: Parent/guardian users, child learner profiles, school staff (where applicable).

## Data Inventory Summary
- Parent identity and account data:
  - Fields: name, email, phone, address, auth credentials, consent metadata.
  - Source: parent signup and account updates.
  - Storage: User and ParentProfile records.
  - Purpose: account access, billing, legal obligations, support.
- Child profile data:
  - Fields: child name, date of birth, year group, key stage, selected subjects, learning preferences.
  - Source: parent-managed profile creation.
  - Storage: ChildProfile and StudentProfile records.
  - Purpose: learning personalisation and curriculum routing.
- Learning and performance data:
  - Fields: attempts, assignment completion, progress records, weak areas, badges/certificates.
  - Source: child learning activity and teacher/admin assignment workflows.
  - Storage: Attempt, Assignment, ProgressRecord, WeakArea and related entities.
  - Purpose: progress reporting and adaptive learning support.
- Consent and governance data:
  - Fields: consent version, accepted/withdrawn timestamps, consent audit logs.
  - Source: parent consent and withdrawal workflows.
  - Storage: User consent fields and AuditLog.
  - Purpose: legal basis evidence and accountability.
- Billing/subscription data:
  - Fields: subscription status, billing provider identifiers, renewal/grace timelines.
  - Source: checkout and webhook events.
  - Storage: Subscription and audit-related tables.
  - Purpose: paid feature entitlement and financial records.
- Support and communications data:
  - Fields: tickets, message thread metadata, notification preferences.
  - Source: parent support/messaging interactions.
  - Storage: support and message entities, notification preference records.
  - Purpose: customer support and operational communication.

## Processing Purposes
- Deliver educational platform features.
- Maintain secure parent-controlled access.
- Provide progress reporting and accountability.
- Process subscriptions and billing lifecycle.
- Meet safeguarding, legal, tax, and audit obligations.

## Lawful Basis (Operational Draft)
- Contract: service delivery and account management.
- Legal obligation: finance/tax records and safeguarding obligations.
- Legitimate interests: service security, abuse prevention, product reliability.
- Consent: parent/guardian consent gate for child data processing and specific communications.

Note: This is an engineering compliance mapping draft, not legal advice.

## Data Sharing
- Payment providers for transaction processing (country and provider dependent).
- Infrastructure processors for hosting, logging, and messaging.
- No sale of child personal data.

## Parent Rights Support
- Consent acceptance and withdrawal endpoints.
- Parent-owned child export request workflow.
- Parent-owned child deletion request workflow.
- Sensitive action audit logging for governance traceability.

## Gaps Requiring Legal/Policy Confirmation
- Final legal wording for lawful-basis references and data retention schedule.
- DPO contact wording and complaint escalation text.
- Final external privacy notice publication format.
