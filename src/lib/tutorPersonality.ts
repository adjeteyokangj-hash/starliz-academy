export type TutorEmotion =
  | "idle"
  | "thinking"
  | "listening"
  | "encouraging"
  | "celebrating"
  | "supporting"
  | "try_again";

export type TutorPersonality =
  | "default"
  | "gentle"
  | "robot"
  | "superhero"
  | "princess";

const PERSONALITY_PREFIX: Record<TutorPersonality, string> = {
  default: "",
  gentle: "Take your time. ",
  robot: "Beep beep. ",
  superhero: "Super learner power! ",
  princess: "Magical learning time! ",
};

export function applyTutorPersonality(
  line: string,
  personality: TutorPersonality = "default",
): string {
  return `${PERSONALITY_PREFIX[personality]}${line}`.trim();
}

export function getTutorEmotionLine({
  emotion,
  personality = "default",
  word,
  letter,
}: {
  emotion: TutorEmotion;
  personality?: TutorPersonality;
  word?: string;
  letter?: string;
}) {
  const base: Record<TutorEmotion, string> = {
    idle: "I am ready when you are.",
    thinking: "Let me think with you.",
    listening: "I am listening. Say it when you are ready.",
    encouraging: "You can do this.",
    celebrating: "Brilliant work!",
    supporting: "Let us try this together.",
    try_again: "Good try. Let us try again.",
  };

  let line = base[emotion];

  if (emotion === "listening" && word) {
    line = `I am listening. Say ${word}.`;
  }

  if (emotion === "listening" && letter) {
    line = `I am listening. Say the sound ${letter}.`;
  }

  return applyTutorPersonality(line, personality);
}