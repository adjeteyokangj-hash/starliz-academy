import type { Step } from "./guide";

const step = (id: string, target: string, title: string, text: string, hint: string, action = "ack"): Step => ({ id, target, title, text, hint, action });

export const homeGuide = [
  step("lesson", "coding-current-lesson", "Find your lesson", "Open your lesson card when you’re ready to build.", "Start with your lesson card."),
  step("journey", "coding-learning-journey", "Find your learning journey", "Open the journey to find your year and modules.", "Your modules are in the learning journey."),
  step("world", "coding-world", "Practise in Game World", "Explore Coding Game World to try out your skills.", "Game World is where you can practise.", "open-world"),
];

export const worldGuide = [
  step("guided", "guided-missions", "Find a guided mission", "Your guided lessons are here. Try one when you want a learning goal.", "Look for a guided mission."),
  step("map", "game-world-map", "Explore the map", "Choose a place on the map to visit it.", "Pick a place to explore.", "travel"),
  step("board", "mission-board", "Choose a mission", "The Mission Board tells you what you can build here.", "Look at the Mission Board."),
  step("program", "my-program", "Make an invention", "Build in My Program. Open Block tools to find controls for your blocks.", "Build in My Program."),
  step("run", "run-program", "Try your invention", "Run your invention to see what it does.", "Try a run.", "world-run"),
  step("simulation", "live-simulation", "Watch the simulation", "See what changed after your invention ran.", "Look at the simulation."),
  step("save", "save-project", "Keep a version", "Save a project version when you want to keep this copy.", "Save a version to keep it.", "world-save"),
  step("clubhouse", "clubhouse-tab", "Visit the Clubhouse", "Open My clubhouse to see your room.", "Your room is in My clubhouse.", "open-clubhouse"),
  step("skills", "skills-tab", "See your inventions", "Open Inventions & Skills to find saved versions and practice achievements.", "Find your saved inventions here.", "open-skills"),
];
export const clubhouseGuide = [step("room", "clubhouse", "Make it your own", "Use the room controls to choose a decoration and place it on a square.", "Choose a decoration for your room.")];
export const skillsGuide = [step("inventions", "inventions", "Find saved inventions", "Open a saved version here when you want to revisit an invention.", "Look through your saved inventions.")];
export const portfolioGuide = [step("evidence", "portfolio-evidence", "Find your saved work", "Open a saved project or choose an assessed creation to see your evidence.", "Choose a saved creation to see its evidence.")];

export const firstProjectGuide = [
  step("task", "lesson-task", "Read the task", "Read the challenge and find out what your program should do.", "Read the challenge before you build."),
  step("instructions", "lesson-instructions", "Find the instructions", "Learn & Explore has the steps, examples, and help for this task.", "Check Learn & Explore when you need the instructions."),
  step("editor", "block-editor", "Find your workspace", "This is where you build. In Blockly, use the toolbox to find blocks.", "Build in your editor."),
  step("tools", "block-tools", "Open Block tools", "Open Block tools to find Undo, Redo, and other controls.", "Look for Block tools.", "block-tools"),
  step("fit", "fit-blocks", "Fit your blocks", "Select Fit blocks to bring your program into view.", "Fit blocks brings your program into view.", "fit-blocks"),
  step("start", "block-editor", "Find the start block", "The start or event block shows when the connected instructions will run.", "Look for what starts your program."),
  step("edit", "block-editor", "Add an action", "Choose an action that matches the task. Connect it under the start block, then check its direction or value.", "Choose the action that will move your program toward the goal.", "edit"),
  { ...step("run", "run-program", "Run your work", "Run your program to see what it does.", "Try your program.", "run"), onFailure: "repair" },
  step("result", "program-result", "Look at the result", "Compare what happened with the goal. You can replay the result.", "Compare the result with the task."),
  step("check", "check-program", "Check your work", "Use the lesson’s check or continue control when you’re ready.", "Use the lesson check when you’re ready.", "check"),
  step("save", "save-project", "Save your work", "Save a version so you can return to this copy.", "Keep a copy when you’re ready.", "save"),
  step("saved", "saved-versions", "Find your saved work", "Use Saved versions in the lesson. Assessed work can also appear in your Coding portfolio.", "Find saved versions in the lesson."),
  { ...step("repair", "block-editor", "Try one change", "Read the result, change one instruction, and run again.", "Use the result to decide what to change.", "edit") },
];

export const secondProjectGuide = [
  step("task", "lesson-instructions", "Plan your next project", "Read the task and decide which actions will reach the goal.", "Make a plan from the task."),
  step("edit", "block-editor", "Build your idea", "Choose the blocks or code you think will work.", "Try your own approach.", "edit"),
  { ...step("run", "run-program", "Test and compare", "Run your work and compare the result with your plan.", "Test against your plan.", "run"), onFailure: "repair" },
  step("save", "save-project", "Keep a version", "Save a version you want to return to.", "Save when ready.", "save"),
  { ...step("repair", "block-editor", "Refine your idea", "Use the result to decide what to change.", "Try one change.", "edit") },
];

type LessonGuideContext = {
  stage: import("@/lib/coding/types").CodingStage;
  objective: string;
  editor: "blocks" | "python" | "javascript" | "sql" | "tools";
  completed: boolean;
};

export function lessonGuide({ stage, objective, editor, completed }: LessonGuideContext, second = false): readonly Step[] {
  const next = step("check", "check-program", "Continue the lesson", "Use the lesson’s continue control when it is available.", "Continue when you’re ready.", "check");
  switch (stage) {
    case "discover": return [
      step("task", "coding-task-description", "Discover the goal", `First, read the task under Instructions. Then open the Lesson Example to see how the program works. ${objective}`, "Read the task, then open the Lesson Example."),
      step("example", "coding-lesson-example", "Watch the example", "Open Lesson Example to see how the idea works.", "Look at the example."),
      next,
    ];
    case "predict": return [step("predict", "coding-prediction", "Make your prediction", "Choose what you think will happen, then record your prediction before trying the program.", "Make and record your prediction.", "check")];
    case "create": return [step("task", "coding-task-description", "Create independently", "Read your independent task. Plan your own approach and use the lesson controls to save and check your work.", "Use your own approach.")];
    case "review": return [step("review", "coding-review", "Explain your reasoning", "Compare the saved result with the task. Use the review controls to submit your own reasoning.", "Explain what your work did and why.")];
  }
  if (completed) return [next];
  const task = step("task", "coding-task-description", stage === "debug" ? "Find what needs fixing" : stage === "practise" ? "Try it yourself" : "Read the task", objective, objective);
  const plan = !second && stage === "build" ? [step("plan", "coding-task-description", "Plan your project", `Your goal: ${objective} Before you build, decide what your program should do first and what result you expect.`, "Decide what you want your program to do first.")] : [];
  const source = second ? secondProjectGuide : firstProjectGuide;
  const tools = source.filter(item => !["task", "instructions", "check"].includes(item.id) && (editor === "blocks" || !["tools", "fit", "start"].includes(item.id))).map(item => {
    if (stage === "debug" && item.id === "edit") return { ...item, title: "Repair one problem", text: "Use the feedback to choose one change, then test it.", hint: "Change one thing and test it." };
    if (item.id === "editor") return { ...item, target: "coding-workspace", text: editor === "blocks" ? "Now build your program. Find My Workspace, open Block tools, and choose the blocks you need for this task." : editor === "tools" ? "Use the tools in My Workspace to build your work." : `Write your ${editor === "python" ? "Python" : editor === "sql" ? "SQL" : "JavaScript"} program in the editor.` };
    if (item.id === "start") return { ...item, target: "coding-start-block" };
    if (item.id === "edit") return { ...item, target: editor === "blocks" ? "coding-start-block" : "coding-workspace", text: editor === "blocks" ? item.text : "Make a change in My Workspace that moves your work toward the goal.", hint: "Choose a change that fits the task." };
    return item;
  });
  const repair = tools.find(item => item.id === "repair");
  const normal = tools.filter(item => item.id !== "repair" && item.id !== "saved");
  const planned = plan.length ? normal.flatMap(item => item.id === "result" ? [
    { ...item, title: "Check the result against your plan" },
    step("improve", "coding-workspace", "Improve one thing", "If the result differs from your plan, make one change. If it already matches, skip this tip and save.", "Change one thing if needed.", "edit"),
  ] : [item]) : normal;
  return [task, ...plan, ...planned, next, ...(repair ? [repair] : [])];
}
