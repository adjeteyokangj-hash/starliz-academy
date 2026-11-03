import { z } from "zod";

export const stateDiagramSchema = z.object({
  title: z.string().min(3).max(100), states: z.array(z.string().min(1).max(30)).min(2).max(8), initial: z.string().min(1).max(30),
  transitions: z.array(z.object({ from: z.string().min(1).max(30), event: z.string().min(1).max(30), to: z.string().min(1).max(30) }).strict()).min(1).max(24),
  unlisted: z.literal("stay"),
}).strict().superRefine((diagram, context) => {
  const states = new Set(diagram.states);
  if (states.size !== diagram.states.length || !states.has(diagram.initial)) context.addIssue({ code: "custom", message: "Use unique states and an initial state in this diagram." });
  const pairs = new Set<string>();
  for (const transition of diagram.transitions) {
    const pair = JSON.stringify([transition.from, transition.event]);
    if (!states.has(transition.from) || !states.has(transition.to) || pairs.has(pair)) context.addIssue({ code: "custom", message: "Each state/event pair needs one transition between declared states." });
    pairs.add(pair);
  }
});
export type StateDiagram = z.infer<typeof stateDiagramSchema>;
