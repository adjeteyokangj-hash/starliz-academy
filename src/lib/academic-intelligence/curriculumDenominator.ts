import { keyStageForYearGroup, normalizeKeyStage, normalizeYearGroup } from "@/lib/curriculum";
import type {
  AcademicSourceData,
  CoverageEntry,
  CurriculumDenominatorCoverage,
  CurriculumDenominatorSubjectCoverage,
  CurriculumLevel,
  MasteryMapEntry,
} from "@/lib/academic-intelligence/types";

type ExpectedTopic = {
  key: string;
  label: string;
  aliases: string[];
};

type SubjectExpectation = {
  subject: string;
  curriculumLevel: CurriculumLevel;
  topics: ExpectedTopic[];
};

const DEFAULT_EXPECTATIONS: SubjectExpectation[] = [
  {
    subject: "english",
    curriculumLevel: "core",
    topics: [
      { key: "reading_fluency", label: "Reading fluency", aliases: ["reading", "fluency", "decode"] },
      { key: "comprehension", label: "Comprehension", aliases: ["comprehension", "inference", "retrieval"] },
      { key: "vocabulary", label: "Vocabulary", aliases: ["vocabulary", "word", "definition"] },
      { key: "spelling", label: "Spelling", aliases: ["spelling", "spell", "phonics"] },
      { key: "grammar", label: "Grammar", aliases: ["grammar", "sentence"] },
      { key: "punctuation", label: "Punctuation", aliases: ["punctuation", "capital", "comma", "apostrophe"] },
      { key: "writing", label: "Writing composition", aliases: ["writing", "composition", "paragraph"] },
      { key: "speaking_listening", label: "Speaking and listening", aliases: ["speaking", "listening", "discussion"] },
    ],
  },
  {
    subject: "math",
    curriculumLevel: "core",
    topics: [
      { key: "place_value", label: "Place value", aliases: ["place value", "number", "value"] },
      { key: "addition_subtraction", label: "Addition and subtraction", aliases: ["addition", "subtraction", "add", "subtract"] },
      { key: "multiplication_division", label: "Multiplication and division", aliases: ["multiplication", "division", "times", "table"] },
      { key: "fractions", label: "Fractions", aliases: ["fraction", "fractions"] },
      { key: "decimals_percentages", label: "Decimals and percentages", aliases: ["decimal", "percentage", "percent"] },
      { key: "measurement", label: "Measurement", aliases: ["measure", "measurement", "length", "mass", "capacity"] },
      { key: "geometry", label: "Geometry", aliases: ["geometry", "shape", "angle", "perimeter", "area"] },
      { key: "statistics", label: "Statistics", aliases: ["statistics", "data", "table", "chart", "mean"] },
    ],
  },
  {
    subject: "science",
    curriculumLevel: "core",
    topics: [
      { key: "working_scientifically", label: "Working scientifically", aliases: ["investigation", "experiment", "fair test"] },
      { key: "biology", label: "Biology systems", aliases: ["cells", "human", "animal", "plant"] },
      { key: "chemistry", label: "Chemistry and materials", aliases: ["material", "particle", "reaction", "state"] },
      { key: "physics", label: "Physics and forces", aliases: ["force", "energy", "electricity", "light", "sound"] },
      { key: "earth_space", label: "Earth and space", aliases: ["earth", "space", "planet", "solar"] },
    ],
  },
];

const KS3_OVERRIDES: Record<string, SubjectExpectation> = {
  math: {
    subject: "math",
    curriculumLevel: "core",
    topics: [
      { key: "number", label: "Number", aliases: ["number", "integer", "ratio", "proportion"] },
      { key: "algebra", label: "Algebra", aliases: ["algebra", "equation", "expression"] },
      { key: "geometry", label: "Geometry and measures", aliases: ["geometry", "angle", "measure", "trigonometry"] },
      { key: "probability", label: "Probability", aliases: ["probability", "chance"] },
      { key: "statistics", label: "Statistics", aliases: ["statistics", "data", "distribution"] },
    ],
  },
  english: {
    subject: "english",
    curriculumLevel: "core",
    topics: [
      { key: "literary_analysis", label: "Literary analysis", aliases: ["analysis", "theme", "character"] },
      { key: "critical_reading", label: "Critical reading", aliases: ["inference", "evidence", "comprehension"] },
      { key: "writing_forms", label: "Writing forms", aliases: ["essay", "article", "speech", "writing"] },
      { key: "grammar_accuracy", label: "Grammar accuracy", aliases: ["grammar", "sentence", "tense"] },
      { key: "vocabulary", label: "Vocabulary", aliases: ["vocabulary", "word choice"] },
      { key: "spoken_language", label: "Spoken language", aliases: ["speaking", "listening", "presentation"] },
    ],
  },
  science: {
    subject: "science",
    curriculumLevel: "core",
    topics: [
      { key: "biology", label: "Biology", aliases: ["cell", "organ", "ecosystem", "biology"] },
      { key: "chemistry", label: "Chemistry", aliases: ["atom", "element", "reaction", "chemistry"] },
      { key: "physics", label: "Physics", aliases: ["force", "energy", "motion", "physics"] },
      { key: "scientific_method", label: "Scientific method", aliases: ["method", "investigation", "variable"] },
    ],
  },
};

const KS4_OVERRIDES: Record<string, SubjectExpectation> = {
  math: {
    subject: "math",
    curriculumLevel: "advanced",
    topics: [
      { key: "number", label: "Number", aliases: ["number", "ratio", "proportion", "percentage"] },
      { key: "algebra", label: "Algebra", aliases: ["algebra", "equation", "simultaneous", "quadratic"] },
      { key: "geometry", label: "Geometry and measures", aliases: ["geometry", "trigonometry", "circle", "measure"] },
      { key: "probability", label: "Probability", aliases: ["probability", "tree diagram"] },
      { key: "statistics", label: "Statistics", aliases: ["statistics", "histogram", "box plot", "scatter"] },
    ],
  },
  english: {
    subject: "english",
    curriculumLevel: "advanced",
    topics: [
      { key: "literature", label: "Literature interpretation", aliases: ["literature", "theme", "context", "analysis"] },
      { key: "language_analysis", label: "Language analysis", aliases: ["language", "structure", "writer"] },
      { key: "transactional_writing", label: "Transactional writing", aliases: ["article", "letter", "speech", "writing"] },
      { key: "technical_accuracy", label: "Technical accuracy", aliases: ["grammar", "punctuation", "spelling"] },
      { key: "spoken_language", label: "Spoken language", aliases: ["presentation", "spoken", "listening"] },
    ],
  },
  science: {
    subject: "science",
    curriculumLevel: "advanced",
    topics: [
      { key: "biology", label: "Biology", aliases: ["biology", "cell", "homeostasis", "genetics"] },
      { key: "chemistry", label: "Chemistry", aliases: ["chemistry", "bond", "reaction", "equilibrium"] },
      { key: "physics", label: "Physics", aliases: ["physics", "energy", "electricity", "motion"] },
      { key: "required_practicals", label: "Required practicals", aliases: ["practical", "investigation", "method"] },
    ],
  },
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSubjectGroup(subject: string | null | undefined): string {
  const value = normalize(subject);
  if (!value) return "general";
  if (value.includes("math")) return "math";
  if (
    value.includes("english")
    || value.includes("reading")
    || value.includes("spelling")
    || value.includes("grammar")
    || value.includes("punctuation")
    || value.includes("writing")
    || value.includes("vocabulary")
    || value.includes("comprehension")
    || value.includes("phonics")
  ) {
    return "english";
  }
  if (value.includes("science")) return "science";
  if (value.includes("history")) return "history";
  if (value.includes("geograph")) return "geography";
  if (
    value.includes("french")
    || value.includes("spanish")
    || value.includes("german")
    || value.includes("mandarin")
    || value.includes("language")
  ) {
    return "languages";
  }
  if (value.includes("comput")) return "computing";
  if (value.includes("citizenship") || value.includes("pshe") || value.includes("health") || value === "pe") {
    return "pshe";
  }
  return value;
}

function labelForSubjectGroup(subjectGroup: string): string {
  if (subjectGroup === "math") return "math";
  if (subjectGroup === "english") return "english";
  if (subjectGroup === "science") return "science";
  return subjectGroup || "general";
}

function expectedForSubject(input: {
  subjectGroup: string;
  keyStage: string | null;
}): SubjectExpectation {
  const stage = normalizeKeyStage(input.keyStage);
  if (stage === "KS4" && KS4_OVERRIDES[input.subjectGroup]) {
    return KS4_OVERRIDES[input.subjectGroup];
  }
  if (stage === "KS3" && KS3_OVERRIDES[input.subjectGroup]) {
    return KS3_OVERRIDES[input.subjectGroup];
  }

  const defaultExpectation = DEFAULT_EXPECTATIONS.find((item) => item.subject === input.subjectGroup);
  if (defaultExpectation) return defaultExpectation;

  return {
    subject: labelForSubjectGroup(input.subjectGroup),
    curriculumLevel: stage === "KS4" ? "advanced" : "core",
    topics: [
      { key: "core_knowledge", label: "Core knowledge", aliases: ["core", "knowledge", "topic"] },
      { key: "application", label: "Application", aliases: ["apply", "application", "problem"] },
      { key: "revision", label: "Revision", aliases: ["revision", "review", "recap"] },
    ],
  };
}

function rowSearchText(row: CoverageEntry | MasteryMapEntry): string {
  return [row.topic, row.subtopic, row.skill, row.learningObjective]
    .map((value) => normalize(value))
    .filter(Boolean)
    .join(" ");
}

function isCoveredRow(row: CoverageEntry): boolean {
  return row.coverageStatus === "covered" || row.coverageStatus === "partially_covered" || row.coverageStatus === "overdue_revision";
}

function isUnderCoveredRow(row: CoverageEntry): boolean {
  return row.coverageStatus === "gap_detected" || row.coverageStatus === "not_covered" || row.coverageStatus === "overdue_revision";
}

function activityWeight(entry: MasteryMapEntry): number {
  let weight = entry.attemptsCount;
  if (entry.assignmentCompletionPct > 0) weight += 2;
  if (entry.lessonCompletionPct > 0) weight += 1;
  if (entry.masteryStatus === "mastered" || entry.masteryStatus === "nearly_secure") weight += 1;
  return weight;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function subjectListFromSource(data: AcademicSourceData): string[] {
  const observed = new Set<string>();
  for (const row of data.assignments) observed.add(normalizeSubjectGroup(row.subject));
  for (const row of data.attempts) observed.add(normalizeSubjectGroup(row.subject));
  for (const row of data.weakAreas) observed.add(normalizeSubjectGroup(row.subject));
  for (const row of data.progressRecords) observed.add(normalizeSubjectGroup(row.subject));

  const year = normalizeYearGroup(data.yearGroup);
  const stage = normalizeKeyStage(data.keyStage ?? keyStageForYearGroup(year));
  const defaults = stage === "KS1" || stage === "EYFS"
    ? ["english", "math"]
    : ["english", "math", "science"];
  for (const core of defaults) observed.add(core);

  return Array.from(observed).filter((subject) => subject && subject !== "general");
}

export function buildCurriculumDenominatorCoverage(input: {
  data: AcademicSourceData;
  masteryMap: MasteryMapEntry[];
  curriculumCoverage: CoverageEntry[];
}): CurriculumDenominatorCoverage {
  const keyStage = normalizeKeyStage(input.data.keyStage ?? keyStageForYearGroup(input.data.yearGroup));
  const yearGroup = normalizeYearGroup(input.data.yearGroup);
  const subjects = subjectListFromSource(input.data);

  const bySubject: CurriculumDenominatorSubjectCoverage[] = subjects.map((subjectGroup) => {
    const expected = expectedForSubject({ subjectGroup, keyStage });
    const expectedTopics = expected.topics.map((topic) => topic.label);

    const coverageRows = input.curriculumCoverage.filter((row) => normalizeSubjectGroup(row.subject) === subjectGroup);
    const masteryRows = input.masteryMap.filter((row) => normalizeSubjectGroup(row.subject) === subjectGroup);

    const coveredTopics: string[] = [];
    const missingTopics: string[] = [];
    const underCoveredTopics: string[] = [];
    const activityByTopic = new Map<string, number>();

    for (const topic of expected.topics) {
      const coverageMatches = coverageRows.filter((row) => {
        const text = rowSearchText(row);
        return topic.aliases.some((alias) => text.includes(alias));
      });
      const masteryMatches = masteryRows.filter((row) => {
        const text = rowSearchText(row);
        return topic.aliases.some((alias) => text.includes(alias));
      });

      const matchedCovered = coverageMatches.some((row) => isCoveredRow(row));
      if (matchedCovered) {
        coveredTopics.push(topic.label);
      } else {
        missingTopics.push(topic.label);
      }

      const underCovered = coverageMatches.length === 0 || coverageMatches.some((row) => isUnderCoveredRow(row));
      if (underCovered) {
        underCoveredTopics.push(topic.label);
      }

      const weight = masteryMatches.reduce((sum, row) => sum + activityWeight(row), 0);
      activityByTopic.set(topic.label, weight);
    }

    const totalWeight = Array.from(activityByTopic.values()).reduce((sum, value) => sum + value, 0);
    const avgWeight = expected.topics.length > 0 ? totalWeight / expected.topics.length : 0;
    const overIndexedTopics = expected.topics
      .map((topic) => ({ label: topic.label, weight: activityByTopic.get(topic.label) ?? 0 }))
      .filter((topic) => topic.weight >= 3 && topic.weight >= avgWeight * 1.75 && missingTopics.length > 0)
      .sort((left, right) => right.weight - left.weight)
      .map((topic) => topic.label)
      .slice(0, 5);

    const coveragePercent = expectedTopics.length > 0
      ? clampPercent((coveredTopics.length / expectedTopics.length) * 100)
      : 0;

    return {
      subject: expected.subject,
      keyStage,
      yearGroup,
      curriculumLevel: expected.curriculumLevel,
      expectedTopics,
      coveredTopics: dedupe(coveredTopics),
      missingTopics: dedupe(missingTopics),
      coveragePercent,
      overIndexedTopics: dedupe(overIndexedTopics),
      underCoveredTopics: dedupe(underCoveredTopics),
    };
  });

  const expectedTopics = bySubject.reduce((sum, row) => sum + row.expectedTopics.length, 0);
  const coveredTopics = bySubject.reduce((sum, row) => sum + row.coveredTopics.length, 0);
  const missingTopics = bySubject.reduce((sum, row) => sum + row.missingTopics.length, 0);

  const globalOverIndexed = dedupe(
    bySubject.flatMap((row) => row.overIndexedTopics.map((topic) => `${row.subject}: ${topic}`)),
  ).slice(0, 10);
  const globalUnderCovered = dedupe(
    bySubject.flatMap((row) => row.underCoveredTopics.map((topic) => `${row.subject}: ${topic}`)),
  ).slice(0, 12);

  return {
    expectedTopics,
    coveredTopics,
    missingTopics,
    coveragePercent: expectedTopics > 0 ? clampPercent((coveredTopics / expectedTopics) * 100) : 0,
    overIndexedTopics: globalOverIndexed,
    underCoveredTopics: globalUnderCovered,
    bySubject,
  };
}
