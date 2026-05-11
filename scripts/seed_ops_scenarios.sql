PRAGMA foreign_keys = ON;

-- Users
INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-owner-user', 'ops-owner@starliz.dev', '$2b$12$tsDvr0Ru1qae/MKuDx41luefo9aTDRPAq3afOHWnWtsA2VvtemJNS', 'Ops Owner', 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET
  name = excluded.name,
  role = excluded.role,
  passwordHash = excluded.passwordHash,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-active-teacher-user', 'active.teacher@starliz.dev', 'dev-seed-hash', 'Active Teacher', 'teacher', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updatedAt = CURRENT_TIMESTAMP;

INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-invited-teacher-user', 'invite.only@starliz.dev', 'dev-seed-hash', 'Invite Pending Teacher', 'teacher', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updatedAt = CURRENT_TIMESTAMP;

INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-capacity-teacher-user', 'capacity.teacher@starliz.dev', 'dev-seed-hash', 'Capacity Teacher', 'teacher', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updatedAt = CURRENT_TIMESTAMP;

INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-safeguarding-teacher-user', 'safeguarding.teacher@starliz.dev', 'dev-seed-hash', 'Safeguarding Teacher', 'teacher', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updatedAt = CURRENT_TIMESTAMP;

INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-parent-1-user', 'capacity-parent-1@starliz.dev', 'dev-seed-hash', 'Capacity Child One Parent', 'parent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updatedAt = CURRENT_TIMESTAMP;

INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-parent-2-user', 'capacity-parent-2@starliz.dev', 'dev-seed-hash', 'Capacity Child Two Parent', 'parent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updatedAt = CURRENT_TIMESTAMP;

INSERT INTO User (id, email, passwordHash, name, role, createdAt, updatedAt)
VALUES ('ops-parent-3-user', 'capacity-parent-3@starliz.dev', 'dev-seed-hash', 'Capacity Child Three Parent', 'parent', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, updatedAt = CURRENT_TIMESTAMP;

-- Schools
INSERT INTO School (id, name, slug, status, type, contactEmail, notes, ownerUserId, createdAt, updatedAt)
VALUES ('ops-school-active', 'Ops Active Academy', 'ops-active-academy', 'active', 'school', 'active@starliz.dev', 'Ops scenario fixture', 'ops-owner-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  status = excluded.status,
  contactEmail = excluded.contactEmail,
  ownerUserId = excluded.ownerUserId,
  notes = excluded.notes,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO School (id, name, slug, status, type, contactEmail, notes, ownerUserId, createdAt, updatedAt)
VALUES ('ops-school-suspended', 'Ops Suspended Academy', 'ops-suspended-academy', 'suspended', 'school', 'suspended@starliz.dev', 'Ops scenario fixture', 'ops-owner-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  status = excluded.status,
  contactEmail = excluded.contactEmail,
  ownerUserId = excluded.ownerUserId,
  notes = excluded.notes,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO School (id, name, slug, status, type, contactEmail, notes, ownerUserId, createdAt, updatedAt)
VALUES ('ops-school-no-teacher', 'Ops No Teacher Academy', 'ops-no-teacher-academy', 'active', 'school', 'noteacher@starliz.dev', 'Ops scenario fixture', 'ops-owner-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  status = excluded.status,
  contactEmail = excluded.contactEmail,
  ownerUserId = excluded.ownerUserId,
  notes = excluded.notes,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO School (id, name, slug, status, type, contactEmail, notes, ownerUserId, createdAt, updatedAt)
VALUES ('ops-school-capacity', 'Ops Capacity Risk Academy', 'ops-capacity-risk-academy', 'active', 'school', 'capacity@starliz.dev', 'Ops scenario fixture', 'ops-owner-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  status = excluded.status,
  contactEmail = excluded.contactEmail,
  ownerUserId = excluded.ownerUserId,
  notes = excluded.notes,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO School (id, name, slug, status, type, contactEmail, notes, ownerUserId, createdAt, updatedAt)
VALUES ('ops-school-safeguarding', 'Ops Safeguarding Academy', 'ops-safeguarding-academy', 'active', 'school', 'safeguarding@starliz.dev', 'Ops scenario fixture', 'ops-owner-user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  status = excluded.status,
  contactEmail = excluded.contactEmail,
  ownerUserId = excluded.ownerUserId,
  notes = excluded.notes,
  updatedAt = CURRENT_TIMESTAMP;

-- Licence setup
INSERT INTO SchoolLicence (id, schoolId, provider, status, seatLimit, currency, billingInterval, createdAt, updatedAt)
VALUES ('ops-licence-active', 'ops-school-active', 'manual', 'active', 25, 'GBP', 'month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId) DO UPDATE SET
  status = 'active',
  seatLimit = 25,
  billingInterval = 'month',
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolLicence (id, schoolId, provider, status, seatLimit, currency, billingInterval, createdAt, updatedAt)
VALUES ('ops-licence-suspended', 'ops-school-suspended', 'manual', 'suspended', 20, 'GBP', 'month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId) DO UPDATE SET
  status = 'suspended',
  seatLimit = 20,
  billingInterval = 'month',
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolLicence (id, schoolId, provider, status, seatLimit, currency, billingInterval, createdAt, updatedAt)
VALUES ('ops-licence-no-teacher', 'ops-school-no-teacher', 'manual', 'active', 15, 'GBP', 'month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId) DO UPDATE SET
  status = 'active',
  seatLimit = 15,
  billingInterval = 'month',
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolLicence (id, schoolId, provider, status, seatLimit, currency, billingInterval, createdAt, updatedAt)
VALUES ('ops-licence-capacity', 'ops-school-capacity', 'manual', 'active', 2, 'GBP', 'month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId) DO UPDATE SET
  status = 'active',
  seatLimit = 2,
  billingInterval = 'month',
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolLicence (id, schoolId, provider, status, seatLimit, currency, billingInterval, createdAt, updatedAt)
VALUES ('ops-licence-safeguarding', 'ops-school-safeguarding', 'manual', 'active', 12, 'GBP', 'month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId) DO UPDATE SET
  status = 'active',
  seatLimit = 12,
  billingInterval = 'month',
  updatedAt = CURRENT_TIMESTAMP;

-- Teachers
INSERT INTO SchoolTeacher (id, schoolId, userId, role, status, invitedAt, acceptedAt, lastActiveAt, createdAt, updatedAt)
VALUES ('ops-teacher-active', 'ops-school-active', 'ops-active-teacher-user', 'teacher', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId, userId) DO UPDATE SET
  role = 'teacher',
  status = 'active',
  acceptedAt = CURRENT_TIMESTAMP,
  lastActiveAt = CURRENT_TIMESTAMP,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolTeacher (id, schoolId, userId, role, status, invitedAt, acceptedAt, lastActiveAt, createdAt, updatedAt)
VALUES ('ops-teacher-invited', 'ops-school-no-teacher', 'ops-invited-teacher-user', 'teacher', 'invited', CURRENT_TIMESTAMP, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId, userId) DO UPDATE SET
  role = 'teacher',
  status = 'invited',
  acceptedAt = NULL,
  lastActiveAt = NULL,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolTeacher (id, schoolId, userId, role, status, invitedAt, acceptedAt, lastActiveAt, createdAt, updatedAt)
VALUES ('ops-teacher-capacity', 'ops-school-capacity', 'ops-capacity-teacher-user', 'teacher', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId, userId) DO UPDATE SET
  role = 'teacher',
  status = 'active',
  acceptedAt = CURRENT_TIMESTAMP,
  lastActiveAt = CURRENT_TIMESTAMP,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolTeacher (id, schoolId, userId, role, status, invitedAt, acceptedAt, lastActiveAt, createdAt, updatedAt)
VALUES ('ops-teacher-safeguarding', 'ops-school-safeguarding', 'ops-safeguarding-teacher-user', 'teacher', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId, userId) DO UPDATE SET
  role = 'teacher',
  status = 'active',
  acceptedAt = CURRENT_TIMESTAMP,
  lastActiveAt = CURRENT_TIMESTAMP,
  updatedAt = CURRENT_TIMESTAMP;

-- Capacity risk students and links
INSERT INTO ChildProfile (id, parentId, name, age, yearGroup, selectedVoice, selectedTheme, archived, createdAt, updatedAt)
VALUES ('ops-capacity-child-1', 'ops-parent-1-user', 'Capacity Child One', 8, 'Year 4', 'friendly_coach', 'default', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  parentId = excluded.parentId,
  name = excluded.name,
  archived = 0,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO ChildProfile (id, parentId, name, age, yearGroup, selectedVoice, selectedTheme, archived, createdAt, updatedAt)
VALUES ('ops-capacity-child-2', 'ops-parent-2-user', 'Capacity Child Two', 8, 'Year 4', 'friendly_coach', 'default', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  parentId = excluded.parentId,
  name = excluded.name,
  archived = 0,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO ChildProfile (id, parentId, name, age, yearGroup, selectedVoice, selectedTheme, archived, createdAt, updatedAt)
VALUES ('ops-capacity-child-3', 'ops-parent-3-user', 'Capacity Child Three', 9, 'Year 5', 'friendly_coach', 'default', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  parentId = excluded.parentId,
  name = excluded.name,
  archived = 0,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolStudent (id, schoolId, childId, status, joinedAt, createdAt, updatedAt)
VALUES ('ops-schoolstudent-1', 'ops-school-capacity', 'ops-capacity-child-1', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId, childId) DO UPDATE SET
  status = 'active',
  leftAt = NULL,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolStudent (id, schoolId, childId, status, joinedAt, createdAt, updatedAt)
VALUES ('ops-schoolstudent-2', 'ops-school-capacity', 'ops-capacity-child-2', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId, childId) DO UPDATE SET
  status = 'active',
  leftAt = NULL,
  updatedAt = CURRENT_TIMESTAMP;

INSERT INTO SchoolStudent (id, schoolId, childId, status, joinedAt, createdAt, updatedAt)
VALUES ('ops-schoolstudent-3', 'ops-school-capacity', 'ops-capacity-child-3', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(schoolId, childId) DO UPDATE SET
  status = 'active',
  leftAt = NULL,
  updatedAt = CURRENT_TIMESTAMP;

-- Pending invite (unused and not expired)
INSERT INTO SchoolInviteToken (id, schoolId, inviteType, targetEmail, targetRole, tokenHash, expiresAt, metadataJson, createdAt)
VALUES (
  'ops-pending-invite-1',
  'ops-school-safeguarding',
  'teacher',
  'pending.invite@starliz.dev',
  'teacher',
  'ops-pending-invite-token-hash',
  datetime('now', '+7 day'),
  '{"source":"ops-seed"}',
  CURRENT_TIMESTAMP
)
ON CONFLICT(tokenHash) DO UPDATE SET
  schoolId = 'ops-school-safeguarding',
  inviteType = 'teacher',
  targetEmail = 'pending.invite@starliz.dev',
  targetRole = 'teacher',
  usedAt = NULL,
  expiresAt = datetime('now', '+7 day'),
  metadataJson = '{"source":"ops-seed"}';

-- Open safeguarding incident
INSERT INTO SafeguardingIncident (
  id,
  schoolId,
  reportedByUserId,
  escalationLevel,
  category,
  severity,
  status,
  description,
  actionTaken,
  createdAt,
  updatedAt
)
VALUES (
  'ops-safeguarding-incident-1',
  'ops-school-safeguarding',
  'ops-owner-user',
  'tier_2',
  'behaviour',
  'high',
  'open',
  'Ops seed safeguarding scenario incident',
  'Monitoring in progress',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  schoolId = 'ops-school-safeguarding',
  reportedByUserId = 'ops-owner-user',
  escalationLevel = 'tier_2',
  category = 'behaviour',
  severity = 'high',
  status = 'open',
  description = 'Ops seed safeguarding scenario incident',
  actionTaken = 'Monitoring in progress',
  updatedAt = CURRENT_TIMESTAMP,
  resolvedAt = NULL;
