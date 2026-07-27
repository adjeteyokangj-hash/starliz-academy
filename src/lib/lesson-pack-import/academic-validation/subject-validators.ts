import type { LinkedQaItem } from "@/lib/lesson-pack-import/types";
import { activityText, autoAnswerIssue, dependency, guidedReviewIssue, hasContext, missingDependencyIssue } from "./helpers";
import { readinessFromIssues, type ActivityValidationResult, type DependencyType, type SubjectAcademicValidator } from "./types";

type Rule = { type: DependencyType; pattern: RegExp; present: (a: LinkedQaItem) => boolean; message: string };

function validator(name: string, supported: RegExp, activityType: (text: string) => string, rules: Rule[], mutate?: (a: LinkedQaItem, type: string) => void, extraIssues?: (a: LinkedQaItem, type: string) => ActivityValidationResult["issues"]): SubjectAcademicValidator {
  return {
    subject: name,
    supports: (subject) => supported.test(subject),
    validateLesson: () => [],
    validateActivity(activity, context): ActivityValidationResult {
      const text = activityText(activity);
      const type = activityType(text);
      mutate?.(activity, type);
      const dependencies = rules.filter((rule) => rule.pattern.test(text)).map((rule) => dependency(activity, rule.type, true, rule.present(activity)));
      const issues = dependencies.flatMap((dep) => {
        const rule = rules.find((candidate) => candidate.type === dep.type && candidate.pattern.test(text));
        const issue = missingDependencyIssue(activity, dep, rule?.message ?? `Required ${dep.type} is missing.`);
        return issue ? [issue] : [];
      });
      const guided = guidedReviewIssue(activity);
      const answer = autoAnswerIssue(activity);
      if (guided) issues.push(guided);
      if (answer) issues.push(answer);
      issues.push(...(extraIssues?.(activity, type) ?? []));
      if (context.sessionType !== "general_library" && text.length < 8) issues.push({ code: "activity_too_short", message: "Activity instructions are incomplete.", scope: "activity", severity: "blocked", activityId: activity.id });
      return { activityId: activity.id, activityType: type, readiness: readinessFromIssues(issues), dependencies, issues, markingMode: activity.markingMode ?? "auto" };
    },
  };
}

const contextPresent = (a: LinkedQaItem) => hasContext(a);
const visualPresent = (a: LinkedQaItem) => Boolean(a.visualModel || a.visualSourceFile);
const codePresent = (a: LinkedQaItem) => Boolean(a.supportingContext && (/```/.test(a.supportingContext) || /\n\s{2,}\S/.test(a.supportingContext)));

export const englishValidator = validator("english", /english|reading|writing|grammar|spelling|phonics|punctuation|vocabulary/, (t) =>
  /poem|poetry/i.test(t) ? "poetry" : /persuad|argument/i.test(t) ? "persuasive_writing" : /infer|retrieve|paragraph|author|writer|extract|passage/i.test(t) ? "reading_comprehension" : /spell/i.test(t) ? "spelling" : /write|compose/i.test(t) ? "writing" : "english_activity", [
  { type: "passage", pattern: /\b(?:author|writer|passage|paragraph|line \d+|find .* from the text|extract|poem|source text)\b/i, present: contextPresent, message: "English passage or extract required by the question is missing." },
], (a, type) => {
  if (/writing|analysis|comparison|summary|inference|poetry/.test(type) || /\bexplain|analyse|compare|evaluate|how does\b/i.test(a.prompt)) a.markingMode = "guided_review";
});

// Maths already has the importer’s richer structural/playability validator. The registry
// deliberately delegates to it rather than introducing a second set of Maths heuristics.
export const mathsValidator = validator("maths", /maths|times-tables/, () => "maths", []);

export const scienceValidator = validator("science", /^(?:science|gcse-(?:science|combined-science|biology|chemistry|physics))$/, (t) =>
  /experiment|apparatus|method|variable|practical/i.test(t) ? "experiment" : /calculate|formula|equation/i.test(t) ? "calculation" : /graph/i.test(t) ? "graph" : /diagram|label|arrow/i.test(t) ? "diagram" : "scientific_explanation", [
  { type: "graph", pattern: /\b(?:graph|figure \d+)\b/i, present: visualPresent, message: "Science graph is missing." },
  { type: "table", pattern: /\b(?:results table|data table|examine the results)\b/i, present: contextPresent, message: "Science results table is missing." },
  { type: "diagram", pattern: /\b(?:label the diagram|arrow [a-z]|diagram)\b/i, present: visualPresent, message: "Science diagram is missing." },
  { type: "practical_setup", pattern: /\b(?:experiment|practical|apparatus|method)\b/i, present: (a) => /\b(?:safety|hazard|goggles?|control variable|independent variable|dependent variable)\b/i.test(activityText(a)), message: "Science practical requires variables, apparatus/method and safety controls." },
], (a, type) => {
  if (type === "calculation" && !/\b(?:unit|cm|mm|m\/s|kg|g|N|J|W|V|A|°C|mol)\b/i.test(activityText(a))) a.playableBlockReasons = [...(a.playableBlockReasons ?? []), "calculation_units_missing"];
}, (a, type) => type === "calculation" && !/\b(?:unit|cm|mm|m\/s|kg|g|N|J|W|V|A|°C|mol)\b/i.test(activityText(a))
  ? [{ code: "science_units_missing", message: "Science calculation requires values, formula and answer units.", scope: "activity", severity: "blocked", activityId: a.id }]
  : []);

export const historyValidator = validator("history", /history/, (t) => /source [a-z]|speech|photograph|extract/i.test(t) ? "source_analysis" : /timeline|chronolog/i.test(t) ? "chronology" : "history", [
  { type: "source_extract", pattern: /\b(?:source [a-z]|the photograph|the speech|the extract)\b/i, present: contextPresent, message: "Referenced historical source material is missing." },
  { type: "timeline", pattern: /\b(?:timeline|chronology)\b/i, present: visualPresent, message: "Referenced timeline is missing." },
], (a) => { if (/\b(?:explain|evaluate|significance|judgement|interpretation)\b/i.test(a.prompt)) a.markingMode = "guided_review"; });

export const geographyValidator = validator("geography", /geography/, (t) => /map|os map/i.test(t) ? "map_work" : /fieldwork/i.test(t) ? "fieldwork" : /case study/i.test(t) ? "case_study" : "geography", [
  { type: "map", pattern: /\b(?:use|study|refer to|using) (?:the )?(?:map|figure)|\bos map\b/i, present: (a) => visualPresent(a) && /\b(?:key|legend|scale)\b/i.test(activityText(a)), message: "Geography map, key/legend or required scale is missing." },
  { type: "graph", pattern: /\b(?:climate graph|population graph|figure \d+)\b/i, present: visualPresent, message: "Geography graph is missing." },
  { type: "table", pattern: /\b(?:dataset|data table)\b/i, present: contextPresent, message: "Geography dataset is missing." },
]);

export const computingValidator = validator("computing", /computer|computing/, (t) => /debug/i.test(t) ? "debugging" : /pseudocode|algorithm|flowchart/i.test(t) ? "algorithm" : /code|program/i.test(t) ? "programming" : "computing", [
  { type: "code", pattern: /\b(?:code|program|debug|pseudocode|expected output|line \d+)\b/i, present: codePresent, message: "Computing activity requires a complete, indentation-preserving code block." },
]);

export const languagesValidator = validator("languages", /french|spanish|german|italian|mandarin|arabic|urdu|polish|latin|ga-language/, (t) => /listen|hear|audio/i.test(t) ? "listening" : /translate/i.test(t) ? "translation" : /conjugat/i.test(t) ? "conjugation" : "language", [
  { type: "audio", pattern: /\b(?:listen|what do you hear|repeat the phrase|recording|audio)\b/i, present: (a) => Boolean(a.visualSourceFile && /\.(?:mp3|wav|m4a|ogg)$/i.test(a.visualSourceFile)), message: "Listening activity requires an audio source and cannot be silently converted to reading." },
]);

export const socialValidator = validator("social-subjects", /religious|citizenship|sociology|psychology|business|economics|media/, (t) => /evaluate|discuss|viewpoint|opinion/i.test(t) ? "evaluation" : /case study|scenario/i.test(t) ? "case_study" : "social_subject", [
  { type: "source_extract", pattern: /\b(?:source|scenario|case study|data table|graph)\b/i, present: contextPresent, message: "Required source, scenario or case-study context is missing." },
], (a, type) => { if (type === "evaluation") a.markingMode = "guided_review"; });

export const creativeValidator = validator("creative-subjects", /art-and-design|design-and-technology|food-preparation|drama|music/, (t) => /listen|rhythm|score|notation/i.test(t) ? "music_listening" : /painting|artwork|image/i.test(t) ? "art_analysis" : /design brief|template/i.test(t) ? "design_task" : "creative_practical", [
  { type: "image", pattern: /\b(?:painting|artwork|image|analyse this)\b/i, present: visualPresent, message: "Referenced artwork or image is missing." },
  { type: "audio", pattern: /\b(?:listen|audio|copy the rhythm|musical extract)\b/i, present: (a) => Boolean(a.visualSourceFile && /\.(?:mp3|wav|m4a|ogg)$/i.test(a.visualSourceFile)), message: "Music listening activity requires audio." },
  { type: "source_extract", pattern: /\b(?:score|notation|design brief|template)\b/i, present: contextPresent, message: "Required score, notation, brief or template is missing." },
]);

export const peValidator = validator("physical-education", /physical-education/, () => "pe_practical", [
  { type: "equipment", pattern: /\b(?:equipment|ball|cone|racket|mat|goal)\b/i, present: (a) => /\b(?:equipment|required|need|use)\b/i.test(activityText(a)), message: "PE equipment requirements are incomplete." },
  { type: "practical_setup", pattern: /\b(?:practise|perform|drill|exercise|activity|warm-up)\b/i, present: (a) => /\b(?:safety|space|supervis|warm-up|cool-down|adaptation)\b/i.test(activityText(a)), message: "PE practical requires safety, space/supervision and adaptation controls." },
]);

export const generalValidator = validator("general", /.*/, () => "general", []);
