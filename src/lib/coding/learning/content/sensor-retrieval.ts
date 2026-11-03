import { authorModuleActivity, visual, eq } from "../authoring";
import { sensorTools as tools } from "./sensor-robots";
import type { Json } from "../types";

const moduleId = "first-games/robot-missions";
const blank = visual({ variables: {}, handlers: { start: [] } });
const recall = authorModuleActivity({ moduleId, kind: "consolidation", slot: 1,
  title: "Recall a sensor's stopping boundary", objective: "Retrieve a sensor-controller rule at a new safety threshold and verify the actual movement decision.",
  concepts: ["sensor", "threshold", "boundary", "retrieve"], essentialChecks: ["The actual distance is recorded", "Below and equal readings stop", "An above-threshold reading permits one forward step"], faultDescription: "The comparison excludes equality at the new threshold.",
  explanation: "Reconstruct a cautious distance controller with a four-square stopping threshold. Store sensor.distance as reading, Stop when it is at most four, otherwise move Forward one. Predict the decisions for distances three, four and five, then inspect the actual reading, position and stopped state. Do not copy an earlier numeric threshold without reading this new brief. The distance comes from the world's obstacle position, not from a label written in the program.",
  reasoning: ["At most four includes the boundary value four. A strict Less comparison would allow movement when this brief requires stopping.", "The three cases join the measured input to an actual actuator response, rather than only checking a typed answer."],
  starter: blank, reference: tools.sensorProgram(4), faulty: tools.sensorProgram(4, "boundary"), cases: tools.distanceCases("recall-threshold-four", 4),
  transfer: [5, 3].map((threshold, index) => ({ task: `Reconstruct the controller for an at-most-${threshold} stopping rule. Read the real distance, handle below, equal and above cases, and move one forward step only when safe under this brief.`, reference: tools.sensorProgram(threshold), cases: tools.distanceCases(`new-recalled-threshold-${index}`, threshold) })),
  prediction: { prompt: "The new rule says at most four. Should distance four stop?", choices: ["Yes, equality is included", "No, only smaller values count", "It depends on the project name"], correct: 0 },
});

type Point = { x: number; y: number };
const tracks: Point[][] = [
  [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }],
  [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }],
  [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 2, y: 2 }],
];
const headings = [0, 3, 2];
const repair = authorModuleActivity({ moduleId, kind: "consolidation", slot: 2,
  title: "Repair steering on an unfamiliar marked route", objective: "Find a reversed left-turn correction using actual relative line readings and the first wrong visited square.",
  concepts: ["line sensor", "feedback", "debug", "heading"], essentialChecks: ["The first wrong turn is repaired", "All marked points are visited in order", "The robot stops when no continuation remains"], faultDescription: "A positive right turn is wired to the left-line reading.",
  explanation: "The line sensor correctly sees a left continuation, but the controller turns right. Use the unfamiliar marked route to locate the first wrong square and inspect the steering command in that branch. Repair Left to a negative quarter turn, preserve the other sensor decisions and rerun every point. The second case shifts the entire route, so a fixed coordinate sequence is not a substitute for relative sensor feedback. Stop when ahead, left and right all have no continuation.",
  reasoning: ["A left reading describes the marked neighbour relative to the current heading. It is not a request for a positive right turn.", "After fixing the first bend, continue testing later bends and the endpoint; one good correction does not prove the complete route."],
  starter: tools.lineProgram(true), reference: tools.lineProgram(), faulty: tools.lineProgram(true), cases: tools.lineCases("unfamiliar-steering-fault", tracks[0]!, headings[0]!),
  transfer: tracks.slice(1).map((track, index) => ({ task: `Repair the reversed left correction on the new ${index ? "left-facing" : "up-facing"} marked route. Use relative line readings, verify every point on the shifted route as well, and terminate at its end.`, starter: tools.lineProgram(true), reference: tools.lineProgram(), cases: tools.lineCases(`new-steering-fault-${index}`, track, headings[index + 1]!) })),
  prediction: { prompt: "The sensor says lineLeft but the branch turns right. What needs changing?", choices: ["The source route's name", "The branch's actual steering command", "Only the final caption"], correct: 1 },
});

const motors = [{ power: 4, duration: 0.25, count: 3 }, { power: 2, duration: 0.5, count: 4 }, { power: 1, duration: 1, count: 2 }];
const improve = authorModuleActivity({ moduleId, kind: "consolidation", slot: 3,
  title: "Improve a motor mission's finish", objective: "Preserve a bounded motor journey while adding a verifiable final actuator stop.",
  concepts: ["motor", "duration", "stop", "improve"], essentialChecks: ["Each power-duration movement is preserved", "The applied-power sequence ends at zero", "The actuator is explicitly stopped from both headings"], faultDescription: "The mission has no final Stop, despite reaching the intended position.",
  explanation: "Improve a mission that reaches the correct position but leaves its actuator unstopped. Repeat power four for the supplied quarter-time duration three times, then explicitly Stop. Preserve each original movement while adding a final zero to the applied-power sequence. Test right-facing and up-facing starts. Do not replace the mission with Stop alone: a safe finish is required in addition to the intended useful journey.",
  reasoning: ["Four times one quarter gives one square per bounded command. The three original steps should remain unchanged.", "A completed list of commands is not the same as a stopped actuator. Inspect the actual final stopped state and final applied power."],
  starter: tools.motorProgram(motors[0]!, true), reference: tools.motorProgram(motors[0]!), faulty: tools.motorProgram(motors[0]!, true), cases: tools.motorCases("motor-finish-improvement", motors[0]!),
  transfer: motors.slice(1).map((spec, index) => ({ task: `Improve the new mission: preserve ${spec.count} power-${spec.power} commands of supplied duration ${spec.duration}, then add an explicit Stop. Verify displacement and final zero power from both headings.`, starter: tools.motorProgram(spec, true), reference: tools.motorProgram(spec), cases: tools.motorCases(`new-motor-finish-${index}`, spec) })),
  prediction: { prompt: "Does Stop alone satisfy a mission that must first travel three squares?", choices: ["Yes, stopping is the only requirement", "Yes, the title proves the travel", "No, preserve the useful travel and add its safe finish"], correct: 2 },
});

function mission(fault = false) {
  const artifact = tools.deliveryProgram(fault);
  if (artifact.type === "visual") {
    const document = artifact.document as { handlers: Record<string, Array<Record<string, Json>>> };
    const start = document.handlers.start!, loop = start[0]!;
    document.handlers.travel = loop.body as Array<Record<string, Json>>;
    loop.body = [{ op: "emit", name: "travel" }];
    document.handlers.halt = [{ op: "stop" }]; start[1] = { op: "emit", name: "halt" };
  }
  return artifact;
}
function missionCases(id: string, track: Point[], heading: number) { return tools.lineCases(id, track, heading, true).map((fixture) => ({ ...fixture, assertions: [...fixture.assertions, eq("messages", [...Array<string>(track.length - 1).fill("travel"), "halt"], "The named travel contract runs for each step and the named halt contract runs at the end")] })); }
const portfolio = authorModuleActivity({ moduleId, kind: "project",
  title: "Portfolio: sensor delivery mission", objective: "Create a decomposed parcel mission that follows a new marked path around an early obstacle, confirms the actual destination and safely replays from a saved version.",
  concepts: ["sensor", "feedback", "decompose", "destination", "version"], essentialChecks: ["Every marked route point is followed around the obstacle", "Named Travel and Halt parts actually execute", "The destination sensor verifies delivery", "The saved mission restores and replays without false success"], faultDescription: "The mission uses the first close obstacle as its stopping condition and abandons the parcel before its destination.",
  explanation: "Build a new parcel robot for the longer marked route. Put the relative line-following step in a named travel handler, emit travel from the feedback loop and put Stop in a named halt handler selected after the loop. Continue until the destination sensor is true or a dead end stops the robot. Say Parcel delivered only at the actual destination; otherwise say Mission incomplete. The early obstacle at the bend is not the destination. Save, restore and replay the complete decomposed mission, including its shifted map.",
  reasoning: ["The Travel contract is one sensor-guided step, so the main loop can reuse it without erasing the position needed by destination detection.", "Halt is a separate final action. Its message should follow the repeated Travel selections, and delivery feedback must remain grounded in the destination reading."],
  starter: visual({ variables: {}, handlers: { start: [], travel: [], halt: [] } }), reference: mission(), faulty: mission(true), cases: missionCases("decomposed-parcel-portfolio", tracks[0]!, headings[0]!), workflow: { saveAndReplay: true, restoreVersion: true },
  transfer: tracks.slice(1).map((track, index) => ({ task: `Build the new ${index ? "left-facing" : "up-facing"} parcel mission with the supplied longer route and obstacle. Reuse named Travel for each feedback step, select named Halt at the end, verify actual destination delivery and save, restore and replay both map positions.`, starter: visual({ variables: {}, handlers: { start: [], travel: [], halt: [] } }), reference: mission(), cases: missionCases(`new-decomposed-parcel-${index}`, track, headings[index + 1]!) })),
  prediction: { prompt: "What evidence distinguishes delivery from stopping at the first obstacle?", choices: ["The actual destination sensor and complete route", "The project title", "Any zero motor power value"], correct: 0 },
});

export const sensorRetrievalActivities = [recall, repair, improve, portfolio];
