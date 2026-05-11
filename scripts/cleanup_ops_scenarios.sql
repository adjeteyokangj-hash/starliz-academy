PRAGMA foreign_keys = ON;

DELETE FROM SafeguardingEvidenceAttachment
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SafeguardingWorkflowEvent
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SafeguardingIncident
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolSafeguardingAlert
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolCommunicationLog
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolCommunicationPreference
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM ParentSchoolLink
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolAccessLog
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolLoginHistory
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolAuditLog
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM LicenceEvent
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM TeacherInviteToken
WHERE schoolTeacherId IN (
  SELECT id FROM SchoolTeacher
  WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding')
);

DELETE FROM SchoolInviteToken
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM Classroom
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolStudent
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolTeacher
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM SchoolLicence
WHERE schoolId IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding');

DELETE FROM School
WHERE id IN ('ops-school-active', 'ops-school-suspended', 'ops-school-no-teacher', 'ops-school-capacity', 'ops-school-safeguarding')
   OR slug LIKE 'ops-%';

DELETE FROM Attempt
WHERE studentId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM Assignment
WHERE studentId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM ProgressRecord
WHERE childId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM WalletTransaction
WHERE childId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM WeakArea
WHERE studentId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM StudentSkill
WHERE studentId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM QuestionHistory
WHERE childId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM ChildReward
WHERE childId IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM ChildProfile
WHERE id IN ('ops-capacity-child-1', 'ops-capacity-child-2', 'ops-capacity-child-3');

DELETE FROM AuthSession
WHERE userId IN (
  'ops-owner-user',
  'ops-active-teacher-user',
  'ops-invited-teacher-user',
  'ops-capacity-teacher-user',
  'ops-safeguarding-teacher-user',
  'ops-parent-1-user',
  'ops-parent-2-user',
  'ops-parent-3-user'
);

DELETE FROM User
WHERE email IN (
  'ops-owner@starliz.dev',
  'active.teacher@starliz.dev',
  'invite.only@starliz.dev',
  'capacity.teacher@starliz.dev',
  'safeguarding.teacher@starliz.dev',
  'capacity-parent-1@starliz.dev',
  'capacity-parent-2@starliz.dev',
  'capacity-parent-3@starliz.dev'
);
