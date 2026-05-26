import type { DictionaryWordInput } from "@/lib/dictionary";
import { dictionarySeedWords } from "@/lib/dictionarySeed";

export type DictionaryBootstrapBuckets = {
  spellingWords: DictionaryWordInput[];
  readingVocabulary: DictionaryWordInput[];
  englishVocabulary: DictionaryWordInput[];
  mathsKeywords: DictionaryWordInput[];
  scienceKeywords: DictionaryWordInput[];
  gcseVocabulary: DictionaryWordInput[];
  phonicsCvcStarterWords: DictionaryWordInput[];
};

const gcseVocabulary: DictionaryWordInput[] = [
  { word: "analyze", subject: "english", keyStage: "ks4", yearGroup: "Year 10", difficulty: "medium", definitionChild: "Analyze means to look closely at details and explain what they mean.", exampleSentence: "Analyze the writer's word choices.", curriculumTags: ["gcse-english"], active: true },
  { word: "hypothesis", subject: "science", keyStage: "ks4", yearGroup: "Year 10", difficulty: "hard", definitionChild: "A hypothesis is a testable idea about what might happen.", exampleSentence: "Our hypothesis was that light helps the plant grow.", curriculumTags: ["gcse-science"], active: true },
  { word: "coefficient", subject: "maths", keyStage: "ks4", yearGroup: "Year 10", difficulty: "hard", definitionChild: "A coefficient is the number in front of a letter in algebra.", exampleSentence: "In 3x, the coefficient is 3.", isMathsKeyword: true, curriculumTags: ["gcse-maths"], active: true },
  { word: "inference", subject: "reading", keyStage: "ks4", yearGroup: "Year 11", difficulty: "hard", definitionChild: "Inference means using clues to work out an idea that is not directly stated.", exampleSentence: "Use inference to explain the character's feelings.", curriculumTags: ["gcse-english"], active: true },
  { word: "photosynthesis", subject: "science", keyStage: "ks4", yearGroup: "Year 10", difficulty: "hard", definitionChild: "Photosynthesis is how plants make food using light, water and carbon dioxide.", exampleSentence: "Photosynthesis happens in leaves.", isScienceKeyword: true, curriculumTags: ["gcse-science"], active: true },
];

const phonicsCvcStarterWords: DictionaryWordInput[] = [
  { word: "cat", subject: "spelling", keyStage: "early-years", yearGroup: "Reception", difficulty: "easy", definitionChild: "A cat is a small pet animal.", phonicsPattern: "c-a-t", syllables: "cat", isSpellingKeyword: true, interventionTags: ["phonics-cvc"], active: true },
  { word: "dog", subject: "spelling", keyStage: "early-years", yearGroup: "Reception", difficulty: "easy", definitionChild: "A dog is a common pet animal.", phonicsPattern: "d-o-g", syllables: "dog", isSpellingKeyword: true, interventionTags: ["phonics-cvc"], active: true },
  { word: "sun", subject: "spelling", keyStage: "early-years", yearGroup: "Reception", difficulty: "easy", definitionChild: "The sun is the bright star in the sky.", phonicsPattern: "s-u-n", syllables: "sun", isSpellingKeyword: true, interventionTags: ["phonics-cvc"], active: true },
  { word: "pin", subject: "spelling", keyStage: "early-years", yearGroup: "Reception", difficulty: "easy", definitionChild: "A pin is a small sharp object used to hold things.", phonicsPattern: "p-i-n", syllables: "pin", isSpellingKeyword: true, interventionTags: ["phonics-cvc"], active: true },
  { word: "map", subject: "spelling", keyStage: "early-years", yearGroup: "Reception", difficulty: "easy", definitionChild: "A map is a drawing that shows places.", phonicsPattern: "m-a-p", syllables: "map", isSpellingKeyword: true, interventionTags: ["phonics-cvc"], active: true },
];

function dedupeWords(items: DictionaryWordInput[]): DictionaryWordInput[] {
  const map = new Map<string, DictionaryWordInput>();
  for (const item of items) {
    const key = `${String(item.word ?? "").trim().toLowerCase()}|${String(item.subject ?? "").trim().toLowerCase()}|${String(item.keyStage ?? "").trim().toLowerCase()}|${String(item.yearGroup ?? "").trim().toLowerCase()}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

export function getDictionarySeedBootstrapBuckets(): DictionaryBootstrapBuckets {
  return {
    spellingWords: dictionarySeedWords.filter((item) => item.subject === "spelling"),
    readingVocabulary: dictionarySeedWords.filter((item) => item.subject === "reading"),
    englishVocabulary: dictionarySeedWords.filter((item) => item.subject === "english"),
    mathsKeywords: dictionarySeedWords.filter((item) => item.subject === "maths"),
    scienceKeywords: dictionarySeedWords.filter((item) => item.subject === "science"),
    gcseVocabulary,
    phonicsCvcStarterWords,
  };
}

export function getAllDictionaryBootstrapWords(): DictionaryWordInput[] {
  const buckets = getDictionarySeedBootstrapBuckets();
  return dedupeWords([
    ...buckets.spellingWords,
    ...buckets.readingVocabulary,
    ...buckets.englishVocabulary,
    ...buckets.mathsKeywords,
    ...buckets.scienceKeywords,
    ...buckets.gcseVocabulary,
    ...buckets.phonicsCvcStarterWords,
  ]);
}
