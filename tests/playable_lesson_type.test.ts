import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isEnglishCurriculumSubject,
  isPlayableSubjectContentTypeCompatible,
  isRecognisedPlayableContentType,
  resolvePlayableLessonType,
} from "../src/lib/schools/playable-lesson-type";
import { mapSubjectToLegacyContentType } from "../src/lib/curriculum";

describe("resolvePlayableLessonType", () => {
  it("maps english-language / english booking subjects to reading by default", () => {
    const a = resolvePlayableLessonType({ subject: "english" });
    assert.equal(a.playableContentType, "reading");
    assert.equal(a.metadataSubject, "reading");
    assert.equal(a.schoolSubject, "english");
    assert.equal(a.curriculumSubject, "english-language");

    const b = resolvePlayableLessonType({ subject: "english-language" });
    assert.equal(b.playableContentType, "reading");
    assert.equal(b.metadataSubject, "reading");
  });

  it("maps english + reading/comprehension skill focus to reading", () => {
    const resolved = resolvePlayableLessonType({
      subject: "english",
      skillFocus: "Reading comprehension · inference",
      lessonKind: "comprehension",
    });
    assert.equal(resolved.playableContentType, "reading");
    assert.equal(
      mapSubjectToLegacyContentType(resolved.metadataSubject),
      mapSubjectToLegacyContentType(resolved.playableContentType),
    );
  });

  it("maps supported non-reading English activity types", () => {
    assert.equal(
      resolvePlayableLessonType({ subject: "english", skillFocus: "Spelling patterns" }).playableContentType,
      "spelling",
    );
    assert.equal(
      resolvePlayableLessonType({ subject: "english", skillFocus: "Grammar — verbs" }).playableContentType,
      "grammar",
    );
    assert.equal(
      resolvePlayableLessonType({ subject: "english", skillFocus: "Vocabulary builders" }).playableContentType,
      "vocabulary",
    );
    assert.equal(
      resolvePlayableLessonType({ subject: "english", skillFocus: "Creative writing" }).playableContentType,
      "writing",
    );
  });

  it("rejects unknown English content types as incompatible when not a recognised playable type", () => {
    assert.equal(isRecognisedPlayableContentType("not-a-real-english-type"), false);
    assert.equal(
      isPlayableSubjectContentTypeCompatible("english-language", "not-a-real-english-type"),
      false,
    );
  });

  it("keeps Maths mapping unchanged", () => {
    const resolved = resolvePlayableLessonType({ subject: "maths", skillFocus: "Fractions" });
    assert.equal(resolved.playableContentType, "math");
    assert.equal(resolved.metadataSubject, "maths");
    assert.equal(mapSubjectToLegacyContentType(resolved.metadataSubject), "math");
    assert.equal(mapSubjectToLegacyContentType(resolved.playableContentType), "math");
  });

  it("treats curriculum english-language + reading contentType as compatible", () => {
    assert.equal(isPlayableSubjectContentTypeCompatible("english-language", "reading"), true);
    assert.equal(isPlayableSubjectContentTypeCompatible("english", "reading"), true);
    // This is the failed booking contract: metadata subject english vs contentType reading
    assert.equal(isPlayableSubjectContentTypeCompatible("english", "reading"), true);
  });

  it("does not redirect Maths into an English activity", () => {
    const resolved = resolvePlayableLessonType({ subject: "maths", contentType: "math" });
    assert.notEqual(resolved.playableContentType, "reading");
    assert.equal(isEnglishCurriculumSubject("maths"), false);
  });
});
