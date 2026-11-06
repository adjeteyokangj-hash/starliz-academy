import { authorLesson, visual, scenario, eq, range, read, calc, branch, set, repeat } from "../authoring";
import type { Json, Predicate } from "../types";

type Point = { x: number; y: number };
const program = (handlers: Record<string, unknown[]>, variables: Record<string, Json> = {}) => visual({ variables, handlers });
const forward = { op: "forward", amount: 1 }, stop = { op: "stop" };
const say = (value: string) => ({ op: "say", value });
const atMost = (value: ReturnType<typeof read>, maximum: number) => calc("not", calc("greater", value, maximum));
const sensorProgram = (threshold: number, fault: "sensor" | "boundary" | null = null) => program({ start: [set("reading", read(fault === "sensor" ? "sensor.error" : "sensor.distance")), branch(fault === "boundary" ? calc("less", read("reading"), threshold) : atMost(read("reading"), threshold), [stop], [forward])] }, { reading: 0 });
function distanceCases(id: string, threshold: number) { return [threshold, Math.max(0.5, threshold - 1), threshold + 1].map((distance, index) => {
  const start = { x: 1 + index % 2, y: 2 }, close = distance <= threshold;
  return scenario(`${id}-${index}`, { start, width: 12, height: 8, obstacles: [{ x: start.x + distance, y: start.y }] }, eq("variables.reading", distance, "The controller reads the actual obstacle distance"), eq("stopped", close, "The control decision includes the stated stopping boundary"), eq("visits", close ? [start] : [start, { x: start.x + 1, y: start.y }], "The actuator responds to the actual sensor decision"), eq("collision", false, "The controller does not drive into the obstacle"));
}); }
const system = authorLesson({ id: "Y3.13", concepts: ["sensor", "controller", "actuator"],
  explanation: "A robot system connects input, control and output. The distance sensor reads how far the next obstacle is in the direction the robot faces. Store that input as reading. The controller checks whether reading is at most one square: if so, Stop; otherwise move Forward one square. The motor or movement mechanism is the actuator. Run different obstacle positions and inspect the measured input and actual movement. These are working virtual sensors and actuators, not access to physical hardware.",
  reasoning: ["An obstacle one square ahead requires stopping before contact. A reading of two allows one forward step.", "The target-error sensor answers a different question from obstacle distance. Wiring the wrong input to a valid decision still gives the wrong behaviour."],
  starter: program({ start: [] }, { reading: 0 }), reference: sensorProgram(1), faulty: sensorProgram(1, "sensor"), cases: distanceCases("sensor-control-output", 1),
  transfer: [{ task: "Build a sensor-controller-actuator system that stops at a distance of at most two squares and otherwise moves Forward once. Read the actual distance, not target error.", reference: sensorProgram(2), cases: distanceCases("new-system-two", 2) }, { task: "Build a more cautious virtual system: read distance, stop at most three squares from an obstacle, otherwise move Forward once. Inspect input and actual output in all cases.", reference: sensorProgram(3), cases: distanceCases("new-system-three", 3) }],
  prediction: { prompt: "Which component supplies the measured obstacle distance?", choices: ["The distance sensor", "The output caption", "The project name"], correct: 0 },
});

const threshold = authorLesson({ id: "Y3.14", concepts: ["distance", "threshold", "boundary"],
  explanation: "A safety threshold needs a clear boundary rule. Stop when the obstacle distance is at most two squares; move Forward one only when it is greater than two. Test below, exactly on and above the threshold. Less than two excludes a reading of exactly two and therefore fails this brief. Read the value before deciding, and inspect the actual position and stopping state rather than typing a success message.",
  reasoning: ["At most two includes distance one and distance two. Greater than two is the only moving case.", "A usual near case cannot expose an excluded boundary. The exact-threshold test is necessary even if the above-threshold movement looks right."],
  starter: sensorProgram(2, "boundary"), reference: sensorProgram(2), faulty: sensorProgram(2, "boundary"), cases: distanceCases("threshold-two", 2),
  transfer: [{ task: "Change the rule to stop at most three squares away. Test distance two, exactly three and four, with the boundary included.", reference: sensorProgram(3), cases: distanceCases("threshold-three", 3) }, { task: "Use a one-square stopping threshold. Stop at exactly one and move once only when the actual distance is larger.", reference: sensorProgram(1), cases: distanceCases("threshold-one", 1) }],
  prediction: { prompt: "The rule is Stop when distance is at most two. What happens at exactly two?", choices: ["Move twice", "Stop", "Ignore the sensor"], correct: 1 },
});

type Motor = { power: number; duration: number; count: number };
const motors: Motor[] = [{ power: 2, duration: 0.5, count: 3 }, { power: 4, duration: 0.25, count: 2 }, { power: 1, duration: 1, count: 4 }];
const motorProgram = (spec: Motor, fault = false) => program({ start: [repeat(spec.count, [{ op: "motor", amount: spec.power }]), ...(fault ? [] : [stop])] });
function motorCases(id: string, spec: Motor) { return [0, 3].map((heading) => {
  const start = { x: 2, y: 2 }, step = spec.power * spec.duration;
  const visits = [start, ...Array.from({ length: spec.count }, (_, index) => ({ x: start.x + (heading === 0 ? step * (index + 1) : 0), y: start.y + (heading === 3 ? step * (index + 1) : 0) }))];
  return scenario(`${id}-${heading}`, { start, heading, width: 12, height: 12, dt: spec.duration }, eq("visits", visits, "Each bounded motor command advances according to power, duration and heading"), eq("powers", [...Array<number>(spec.count).fill(spec.power), 0], "The requested bounded power sequence ends with no applied power"), eq("stopped", true, "The mission explicitly stops its actuator"), eq("collision", false, "The motor mission remains unobstructed"));
}); }
const motor = authorLesson({ id: "Y3.15", concepts: ["motor", "power", "duration", "stop"],
  explanation: "A motor command combines power with a bounded duration. In this model each command lasts the supplied dt: power two for half a time unit moves one square in the current heading. Repeat that command three times, then Stop. Inspect every actual position and the applied-power sequence ending at zero. The runner refuses power outside minus ten to ten, and the virtual world rejects movement beyond its boundary. A mission is not safely finished merely because no further commands are written; explicitly stop the actuator.",
  reasoning: ["Two times one half is one square, so three bounded commands travel three squares. Starting facing up changes the axis, not that distance.", "A final Stop records zero applied power and stopped true. Omitting it leaves the mission's stopping criterion unsatisfied."],
  starter: program({ start: [] }), reference: motorProgram(motors[0]!), faulty: motorProgram(motors[0]!, true), cases: motorCases("bounded-motor", motors[0]!),
  transfer: motors.slice(1).map((spec, index) => ({ task: `Use power ${spec.power} for the supplied duration ${spec.duration}, repeat ${spec.count} times, then Stop. Verify the actual displacement and power sequence from right-facing and up-facing starts.`, reference: motorProgram(spec), cases: motorCases(`new-bounded-motor-${index}`, spec) })),
  prediction: { prompt: "Power two is applied for half a time unit. How far does one unobstructed command move?", choices: ["Four squares", "Two squares", "One square"], correct: 2 },
});

const paths: Point[][] = [
  [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }],
  [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 }],
  [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }],
];
const headings = [0, 3, 2];
const followStep = (fault = false) => branch(read("sensor.lineAhead"), [forward], [branch(read("sensor.lineLeft"), [{ op: "turn", amount: fault ? 1 : -1 }, forward], [branch(read("sensor.lineRight"), [{ op: "turn", amount: 1 }, forward], [stop])])]);
const lineProgram = (fault = false) => program({ start: [{ op: "until", test: read("stopped"), body: [followStep(fault)] }] });
function lineCases(id: string, points: Point[], heading: number, delivery = false) { return [0, 1].map((shift) => {
  const track = points.map((point) => ({ x: point.x + shift, y: point.y + shift })), destination = track.at(-1)!;
  const assertions: Predicate[] = [eq("visits", track, "The robot follows every marked path point without hard-coded world coordinates"), eq("stopped", true, "The path-following mission terminates with a stopped actuator"), eq("collision", false, "The marked path avoids obstacle contact"), range("loopMoves", track.length - 1, track.length - 1, "Every path step executes inside the feedback loop")];
  if (delivery) assertions.push(eq("sensors.destination", true, "The destination sensor, rather than an obstacle, identifies completion"), eq("x", destination.x, "The parcel reaches its actual destination column"), eq("y", destination.y, "The parcel reaches its actual destination row"), eq("speech", ["Parcel delivered"], "Delivery feedback is produced only at the destination"));
  else assertions.push(eq("sensors.lineAhead", false, "The forward sensor finds no remaining path at the endpoint"), eq("sensors.lineLeft", false, "The left sensor finds no continuation"), eq("sensors.lineRight", false, "The right sensor finds no continuation"));
  const obstacles = delivery ? [{ x: track[1]!.x + (heading === 0 ? 1 : heading === 2 ? -1 : 0), y: track[1]!.y + (heading === 3 ? 1 : heading === 1 ? -1 : 0) }] : [];
  return scenario(`${id}-${shift}`, { start: track[0]!, heading, track, width: 10, height: 10, obstacles, ...(delivery ? { destination } : {}) }, ...assertions);
}); }
const line = authorLesson({ id: "Y3.16", concepts: ["line sensor", "feedback", "turn", "path"],
  explanation: "Use the marked path as sensor input rather than writing one fixed route. Repeat until stopped: if sensor.lineAhead is true, move Forward once; otherwise check sensor.lineLeft, turn left and move if it is marked; otherwise check sensor.lineRight and turn right if needed. If none has a continuation, Stop. The sensors inspect actual neighbouring path points relative to the robot's heading. Run the shifted path as well and inspect every visited square and the final sensor readings.",
  reasoning: ["At a corner, Forward may leave the marked path even though it stays on the board. A left or right line reading tells the controller which turn is useful.", "The final point has no ahead, left or right continuation. Stop there so the bounded feedback loop can terminate."],
  starter: program({ start: [] }), reference: lineProgram(), faulty: lineProgram(true), cases: lineCases("follow-marked-path", paths[0]!, headings[0]!),
  transfer: paths.slice(1).map((points, index) => ({ task: `Follow the new marked path from its supplied ${index ? "left-facing" : "up-facing"} start. Use relative line sensors to correct direction and stop only when no continuation remains; the second case shifts the entire path.`, reference: lineProgram(), cases: lineCases(`new-marked-path-${index}`, points, headings[index + 1]!) })),
  prediction: { prompt: "No line is ahead, but sensor.lineLeft is true. Which correction follows the mark?", choices: ["Turn left then move Forward", "Turn right without checking", "Continue straight regardless"], correct: 0 },
});

const partsProgram = (count: number, faulty = false) => program({ start: [], travel: faulty ? [{ op: "position", x: 0, y: 0 }] : [{ op: "forward", amount: count }], detect: [branch(read("sensor.destination"), [set("detected", true), say("Destination detected")], [set("detected", false), say("Still travelling")])], halt: [stop] }, { detected: false });
function partsCases(id: string, count: number, heading: number) {
  const start = { x: 2, y: 2 }, destination = { x: start.x + (heading === 0 ? count : 0), y: start.y + (heading === 3 ? count : 0) }, travelled = [start, ...Array.from({ length: count }, (_, index) => ({ x: start.x + (heading === 0 ? index + 1 : 0), y: start.y + (heading === 3 ? index + 1 : 0) }))];
  return [
    scenario(`${id}-travel`, { start, heading, destination, width: 10, height: 10, events: [{ name: "travel", value: 0 }] }, eq("visits", travelled, "Travel has its own independently testable movement contract"), eq("stopped", false, "Travel does not prematurely stop the later parts")),
    scenario(`${id}-detect`, { start: destination, heading, destination, width: 10, height: 10, events: [{ name: "detect", value: 0 }] }, eq("variables.detected", true, "Detect independently recognises the supplied destination"), eq("speech", ["Destination detected"], "The sensor decision has specific feedback")),
    scenario(`${id}-halt`, { start, heading, destination, events: [{ name: "halt", value: 0 }] }, eq("stopped", true, "Halt independently stops the actuator")),
    scenario(`${id}-whole`, { start, heading, destination, width: 10, height: 10, events: ["travel", "detect", "halt"].map((name) => ({ name, value: 0 })) }, eq("visits", travelled, "The composed mission preserves the travel contract"), eq("variables.detected", true, "Travel leaves the position needed by Detect"), eq("stopped", true, "The composed mission ends with Halt")),
  ];
}
const parts = authorLesson({ id: "Y3.17", concepts: ["decompose", "contract", "detect", "stop"],
  explanation: "Decompose a delivery into travel, detect and halt. Travel moves Forward one square without stopping. Detect reads sensor.destination and says Destination detected with detected true only at the supplied target; otherwise it says Still travelling. Halt stops the actuator. Test each part independently, then select travel, detect and halt in order. A part's contract describes the state it needs and the state it leaves for the next part. Moving to an unrelated coordinate inside Travel breaks Detect's input even if every part has a suitable name.",
  reasoning: ["Detect can be tested while already at the destination, without running Travel. That isolates its sensor decision.", "In the combined run, Travel must leave the actual destination position intact and must not stop movement before its own work is finished."],
  starter: program({ start: [], travel: [], detect: [], halt: [] }, { detected: false }), reference: partsProgram(1), faulty: partsProgram(1, true), cases: partsCases("delivery-parts", 1, 0),
  transfer: [{ task: "Use a two-square Forward travel contract from the right-facing start. Test Travel, Detect and Halt separately, then prove the composed mission reaches its supplied destination and stops.", reference: partsProgram(2), cases: partsCases("longer-delivery-parts", 2, 0) }, { task: "Use a one-square Forward contract from an up-facing start. Keep Detect driven by the actual destination sensor and verify every part and their composition.", reference: partsProgram(1), cases: partsCases("upward-delivery-parts", 1, 3) }],
  prediction: { prompt: "Travel resets the robot to an unrelated position. Which next part is directly affected?", choices: ["Only the project title", "Detect, because it needs the destination position", "No part, because the names are correct"], correct: 1 },
});

const deliveryProgram = (faulty = false) => program({ start: [{ op: "until", test: faulty ? atMost(read("sensor.distance"), 1) : calc("or", read("sensor.destination"), read("stopped")), body: [followStep()] }, stop, branch(read("sensor.destination"), [say("Parcel delivered")], [say("Mission incomplete")])] });
const delivery = authorLesson({ id: "Y3.18", concepts: ["sensor", "destination", "obstacle", "feedback"], workflow: { saveAndReplay: true, restoreVersion: true },
  explanation: "Build a parcel mission that follows the marked path and stops at its actual destination sensor. A wall beside the first bend is not the destination: the controller must use the line sensors to turn around it. Repeat the feedback step until sensor.destination is true or the robot has stopped at a dead end. Stop the actuator, then say Parcel delivered only if the destination sensor is true; otherwise say Mission incomplete. Inspect the full path, obstacle avoidance and final sensor reading. Save, restore and replay the mission.",
  reasoning: ["Stopping when the first obstacle is one square away abandons the parcel before the marked bend. Line feedback supplies a safe direction around it.", "A delivery message must follow actual destination detection. The separate incomplete response prevents a stopped or failed mission from claiming success."],
  starter: program({ start: [] }), reference: deliveryProgram(), faulty: deliveryProgram(true), cases: lineCases("sensor-parcel-mission", paths[0]!, headings[0]!, true),
  transfer: paths.slice(1).map((points, index) => ({ task: `Deliver a parcel on the new ${index ? "left-facing" : "up-facing"} marked route. Turn around the obstacle at its first bend, use the actual destination sensor rather than proximity to a wall, stop reliably and save, restore and replay.`, reference: deliveryProgram(), cases: lineCases(`new-sensor-parcel-mission-${index}`, points, headings[index + 1]!, true) })),
  prediction: { prompt: "An obstacle is detected before a marked bend. Does that prove the parcel has arrived?", choices: ["Yes, every obstacle is a destination", "Yes, stopping always means success", "No, the destination sensor must confirm arrival"], correct: 2 },
});

export const sensorRobotActivities = [system, threshold, motor, line, parts, delivery];
export const sensorTools = { sensorProgram, distanceCases, motorProgram, motorCases, lineProgram, lineCases, deliveryProgram };
