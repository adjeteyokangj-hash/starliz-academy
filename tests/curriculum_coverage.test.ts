import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCurriculumCoverageReport,
  aiGeneratorSubjectsForYearGroup,
  isValidCurriculumPath,
  skillsForSubjectAndYear,
  topicSuggestionsForSelection,
  subjectsForYearGroup,
} from "@/lib/curriculum";

test("year 4 punctuation skills are fully mapped", () => {
  const yearGroup = "Year 4";
  const subject = "punctuation" as const;
  const requiredSkills = [
    "Commas in lists",
    "Apostrophes for possession",
    "Direct speech punctuation",
    "Question marks and exclamation marks",
    "Full stops and capital letters",
    "Fronted adverbials with commas",
  ];

  const skills = skillsForSubjectAndYear(subject, yearGroup);
  for (const skill of requiredSkills) {
    assert.ok(skills.includes(skill), `Missing required Year 4 punctuation skill: ${skill}`);
    const topics = topicSuggestionsForSelection({ yearGroup, subject, skillFocus: skill });
    assert.ok(topics.length > 0, `Missing topics for Year 4 punctuation skill: ${skill}`);
  }
});

test("AI Generator exposes parent English for KS1/KS2 while keeping strands internal", () => {
  const year1Subjects = aiGeneratorSubjectsForYearGroup("Year 1");
  assert.ok(year1Subjects.includes("english-language"));
  assert.ok(!year1Subjects.includes("grammar"));
  assert.ok(!year1Subjects.includes("punctuation"));
  assert.ok(!year1Subjects.includes("vocabulary"));

  const year4Subjects = aiGeneratorSubjectsForYearGroup("Year 4");
  assert.ok(year4Subjects.includes("english-language"));
  assert.ok(!year4Subjects.includes("grammar"));
  assert.ok(!year4Subjects.includes("punctuation"));
  assert.ok(!year4Subjects.includes("vocabulary"));
});

test("KS1 English internal strand skills are mapped for generation", () => {
  const expected = {
    "Year 1": {
      grammar: ["Simple sentences", "Nouns and verbs", "Adjectives", "Joining words"],
      punctuation: ["Capital letters", "Full stops", "Question marks", "Exclamation marks"],
      vocabulary: ["Word meanings", "Describing words", "Synonyms", "Topic words"],
    },
    "Year 2": {
      grammar: ["Expanded noun phrases", "Past and present tense", "Adverbs", "Sentence types"],
      punctuation: ["Commas in lists", "Apostrophes for contractions", "Question marks", "Exclamation marks"],
      vocabulary: ["Context clues", "Synonyms and antonyms", "Word families", "Precise word choice"],
    },
  } as const;

  for (const [yearGroup, subjects] of Object.entries(expected)) {
    for (const [subject, requiredSkills] of Object.entries(subjects)) {
      const skills = skillsForSubjectAndYear(subject as "grammar" | "punctuation" | "vocabulary", yearGroup);
      assert.deepEqual(skills, requiredSkills);
      const result = isValidCurriculumPath({
        yearGroup,
        subject: subject as "grammar" | "punctuation" | "vocabulary",
        skillFocus: requiredSkills[0],
        topic: topicSuggestionsForSelection({
          yearGroup,
          subject: subject as "grammar" | "punctuation" | "vocabulary",
          skillFocus: requiredSkills[0],
        })[0],
      });
      assert.equal(result.ok, true, `Expected ${yearGroup} ${subject} path to validate: ${result.reason}`);
    }
  }
});

test("year 4 punctuation examples are generatable paths", () => {
  const examples = [
    { skillFocus: "Commas in lists", topic: "shopping lists" },
    { skillFocus: "Direct speech punctuation", topic: "dialogue in stories" },
    { skillFocus: "Apostrophes for possession", topic: "singular possession" },
  ];

  for (const example of examples) {
    const result = isValidCurriculumPath({
      yearGroup: "Year 4",
      subject: "punctuation",
      skillFocus: example.skillFocus,
      topic: example.topic,
    });
    assert.equal(result.ok, true, `Expected valid path for ${example.skillFocus} -> ${example.topic}, got: ${result.reason}`);
  }
});

test("all visible curriculum paths have at least one topic", () => {
  for (const yearGroup of ["Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"] as const) {
    for (const subject of subjectsForYearGroup(yearGroup)) {
      const skills = skillsForSubjectAndYear(subject, yearGroup);
      assert.ok(skills.length > 0, `No skills configured for ${yearGroup} / ${subject}`);
      for (const skillFocus of skills) {
        const topics = topicSuggestionsForSelection({ yearGroup, subject, skillFocus });
        assert.ok(topics.length > 0, `No topic mappings for ${yearGroup} / ${subject} / ${skillFocus}`);
      }
    }
  }
});

test("coverage report has no fallback-only or missing paths", () => {
  const report = buildCurriculumCoverageReport();
  assert.equal(report.partiallyWired, 0, "Partially-wired paths detected");
  assert.equal(report.fallbackOnly, 0, "Fallback-only paths detected");
  assert.equal(report.missing, 0, "Missing paths detected");
});
