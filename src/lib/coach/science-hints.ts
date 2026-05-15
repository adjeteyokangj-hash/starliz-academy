// ─────────────────────────────────────────────────────────────────────────────
// Science coach — deterministic hint builder
// Topics: forces, energy, electricity, photosynthesis, cells, chemistry, space
// ─────────────────────────────────────────────────────────────────────────────

import { AgeBand, CoachContext, CoachFollowUp, CoachResponse, CoachStep } from "./types";

// ── Topic detection ───────────────────────────────────────────────────────────

type ScienceTopic =
  | "forces"
  | "energy"
  | "electricity"
  | "photosynthesis"
  | "cells"
  | "chemistry"
  | "states_of_matter"
  | "genetics"
  | "ecology"
  | "waves"
  | "space"
  | "respiration"
  | "general";

function detectTopic(skillFocus?: string, question?: string): ScienceTopic {
  const combined = `${skillFocus ?? ""} ${question ?? ""}`.toLowerCase();
  if (/force|friction|gravity|newton|motion|velocity|acceleration|mass|weight/.test(combined)) return "forces";
  if (/energy|heat|thermal|kinetic|potential|transfer|conservation|joule/.test(combined)) return "energy";
  if (/electric|circuit|current|voltage|resistance|ohm|battery|charge|conductor/.test(combined)) return "electricity";
  if (/photosynthesis|chlorophyll|glucose|carbon dioxide|light|stomata|chloroplast/.test(combined)) return "photosynthesis";
  if (/cell|nucleus|membrane|organelle|mitosis|mitochondria|tissue|organ/.test(combined)) return "cells";
  if (/react|acid|alkali|pH|neutralis|oxide|compound|element|mixture|bond/.test(combined)) return "chemistry";
  if (/solid|liquid|gas|particle|melt|evaporate|condense|state|matter/.test(combined)) return "states_of_matter";
  if (/gene|dna|chromosome|inherit|trait|allele|dominant|recessive/.test(combined)) return "genetics";
  if (/ecosystem|habitat|food chain|predator|prey|biodiversity|population|adapt/.test(combined)) return "ecology";
  if (/wave|sound|light|frequency|amplitude|transverse|longitudinal|reflect|refract/.test(combined)) return "waves";
  if (/planet|orbit|solar system|moon|star|galaxy|gravity|asteroid|satellite/.test(combined)) return "space";
  if (/respir|oxygen|carbon dioxide|glucose|aerobic|anaerobic|breathing|lungs/.test(combined)) return "respiration";
  return "general";
}

// ── Real-life context connectors ──────────────────────────────────────────────

const REAL_LIFE_CONTEXTS: Record<ScienceTopic, Record<AgeBand, string>> = {
  forces: {
    foundation: "When you kick a football, you push it — that push is a force!",
    primary: "Friction is why a book stays on a slope instead of sliding off. It's the grip between surfaces.",
    secondary: "When you brake a bike, friction converts kinetic energy to heat energy in the brakes.",
    gcse: "Newton's Second Law (F = ma) explains why a racing car accelerates faster than a lorry — same force, less mass.",
  },
  energy: {
    foundation: "Batteries store energy. When they run out, a toy stops — the energy has been used up!",
    primary: "Your body converts food energy into movement energy when you run.",
    secondary: "A roller coaster converts potential energy (height) into kinetic energy (speed) as it descends.",
    gcse: "The Law of Conservation of Energy: energy cannot be created or destroyed, only transferred between stores.",
  },
  electricity: {
    foundation: "A torch needs a complete loop for electricity to flow — if the circuit is broken, the light goes out.",
    primary: "The more resistors in series, the dimmer the bulbs — resistance reduces current flow.",
    secondary: "Voltage is the push that drives current through a circuit. More volts = harder push.",
    gcse: "Ohm's Law: V = IR. Doubling the resistance halves the current if voltage stays constant.",
  },
  photosynthesis: {
    foundation: "Plants make their own food from sunlight — like a solar-powered lunch factory!",
    primary: "Leaves are green because of chlorophyll, which absorbs sunlight to make glucose for the plant.",
    secondary: "Photosynthesis stores energy from sunlight in glucose bonds: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂.",
    gcse: "Rate of photosynthesis depends on limiting factors: light intensity, CO₂ concentration, temperature.",
  },
  cells: {
    foundation: "Every living thing is made of tiny cells — like building blocks that are alive!",
    primary: "Plant cells have a cell wall for support — like a hard box. Animal cells don't have one.",
    secondary: "The mitochondria produce ATP (energy) through aerobic respiration.",
    gcse: "Specialised cells have adaptations: red blood cells lack a nucleus to carry more haemoglobin.",
  },
  chemistry: {
    foundation: "Mixing vinegar and bicarbonate soda makes bubbles — that's a chemical reaction!",
    primary: "Acids taste sour (like lemons). Alkalis can feel slippery (like soap). pH measures how acidic or alkaline.",
    secondary: "Exothermic reactions release heat (burning). Endothermic reactions absorb heat (dissolving ammonium chloride).",
    gcse: "In ionic bonding, metals lose electrons and non-metals gain them, forming charged ions attracted to each other.",
  },
  states_of_matter: {
    foundation: "Ice, water, and steam are all the same thing — water! They just have different temperatures.",
    primary: "Particles in a solid vibrate but can't move around. In a liquid they flow. In a gas they zip everywhere!",
    secondary: "Melting and evaporation require energy to break bonds between particles.",
    gcse: "Sublimation (solid → gas directly) occurs when the external pressure is too low for the liquid state to exist.",
  },
  genetics: {
    foundation: "You inherit eye colour from your parents — that's genes at work!",
    primary: "Traits like eye colour are passed from parents to children through genes in your cells.",
    secondary: "Dominant alleles mask recessive ones. If you have one dominant allele, you show that trait.",
    gcse: "Punnett squares model the probability of offspring inheriting specific genotypes.",
  },
  ecology: {
    foundation: "A food chain shows who eats who: grass → rabbit → fox.",
    primary: "If rabbits disappear from a food chain, foxes starve and grass overgrows — everything is connected.",
    secondary: "Biodiversity improves ecosystem stability — more species = more resilience to change.",
    gcse: "Pyramids of biomass show energy loss (approximately 90%) at each trophic level.",
  },
  waves: {
    foundation: "Sound is a wave — it travels through air and makes your eardrums vibrate.",
    primary: "The higher the frequency, the higher the pitch. The bigger the amplitude, the louder the sound.",
    secondary: "Transverse waves (like light) oscillate perpendicular to direction of travel. Longitudinal waves (sound) oscillate parallel.",
    gcse: "Refraction occurs when waves change speed at a boundary, causing a change in direction (e.g. light through glass).",
  },
  space: {
    foundation: "The Earth orbits the Sun, just like a ball on a string swings round — gravity keeps it in orbit!",
    primary: "It takes Earth one year to orbit the Sun. The Moon orbits Earth once a month.",
    secondary: "Gravity decreases with distance² (inverse square law) — double the distance, quarter the gravitational force.",
    gcse: "A planet in a stable orbit has its gravitational force balanced by centripetal acceleration.",
  },
  respiration: {
    foundation: "Every time you breathe in, your body uses oxygen to release energy from food.",
    primary: "Aerobic respiration: glucose + oxygen → carbon dioxide + water + energy (ATP).",
    secondary: "Anaerobic respiration produces lactic acid in muscles when oxygen runs out — that burning feeling in sprinting.",
    gcse: "Aerobic respiration occurs in the mitochondria: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ~38 ATP.",
  },
  general: {
    foundation: "Science explains why things happen around us every day.",
    primary: "Good scientists describe, explain, and predict — remember those three!",
    secondary: "Every answer needs: observation + explanation. 'What happened?' and 'Why did it happen?'",
    gcse: "Use specific terminology and link cause to effect: 'This causes X because…'",
  },
};

// ── Follow-up builders ────────────────────────────────────────────────────────

const TOPIC_FOLLOW_UPS: Record<ScienceTopic, CoachFollowUp> = {
  forces: {
    question: "What is the unit of force?",
    options: ["Newtons (N)", "Joules (J)", "Watts (W)", "Kilograms (kg)"],
    correctIndex: 0,
    onCorrect: "Correct — Newtons, named after Isaac Newton. Force = mass × acceleration.",
    onWrong: "Force is measured in Newtons (N). Joules measure energy, Watts measure power, kg measures mass.",
  },
  energy: {
    question: "Energy can be created from nothing — true or false?",
    options: ["False — energy is only transferred", "True — burning fuel creates energy", "True — the Sun creates energy from nothing", "False — energy always disappears"],
    correctIndex: 0,
    onCorrect: "Correct! Energy is always conserved — it transfers between stores, never created or destroyed.",
    onWrong: "The Law of Conservation of Energy states energy cannot be created or destroyed, only transferred.",
  },
  electricity: {
    question: "In a series circuit, if one bulb breaks, what happens to the others?",
    options: ["All bulbs go out", "Only that bulb goes out", "The other bulbs get brighter", "Nothing changes"],
    correctIndex: 0,
    onCorrect: "Exactly! Series circuits have one path — a break anywhere stops all current flow.",
    onWrong: "In series, the current has only one path. One break = no current anywhere in the circuit.",
  },
  photosynthesis: {
    question: "Which gas does a plant TAKE IN during photosynthesis?",
    options: ["Carbon dioxide (CO₂)", "Oxygen (O₂)", "Nitrogen (N₂)", "Hydrogen (H₂)"],
    correctIndex: 0,
    onCorrect: "Correct — plants absorb CO₂ and release O₂ as a by-product of photosynthesis.",
    onWrong: "Plants take in CO₂ and release O₂. Remember: plants do the opposite of what we do when we breathe.",
  },
  cells: {
    question: "Which part of the cell controls what enters and leaves?",
    options: ["Cell membrane", "Cell wall", "Nucleus", "Cytoplasm"],
    correctIndex: 0,
    onCorrect: "Yes — the cell membrane is selectively permeable, controlling what passes in and out.",
    onWrong: "The cell membrane controls entry/exit. The nucleus controls cell activities. The cell wall gives structural support.",
  },
  chemistry: {
    question: "A reaction that releases heat energy is called?",
    options: ["Exothermic", "Endothermic", "Neutralisation", "Combustion"],
    correctIndex: 0,
    onCorrect: "Correct — exo = exit, so exothermic = heat exits the reaction.",
    onWrong: "EXOthermic = energy exits (released). ENDOthermic = energy enters (absorbed).",
  },
  states_of_matter: {
    question: "When a liquid turns to a gas, what happens to the particles?",
    options: ["They gain energy and move faster", "They slow down and get closer", "They stop moving", "They lose energy"],
    correctIndex: 0,
    onCorrect: "Yes! Heating gives particles energy — they escape the liquid surface and become gas.",
    onWrong: "Heat = more energy = faster particles. At evaporation, surface particles gain enough energy to escape.",
  },
  genetics: {
    question: "If two recessive alleles (bb) meet, what trait is shown?",
    options: ["Recessive trait is shown", "Dominant trait is shown", "A mix of both traits", "Neither trait"],
    correctIndex: 0,
    onCorrect: "Correct — the only way to show a recessive trait is to have two recessive alleles (bb).",
    onWrong: "A recessive trait only shows if there is NO dominant allele present — i.e., both alleles must be recessive.",
  },
  ecology: {
    question: "In a food chain, what do arrows represent?",
    options: ["Direction of energy transfer", "Direction of movement", "Who hunts who", "Reproduction"],
    correctIndex: 0,
    onCorrect: "Correct! Arrows show energy flowing from prey to predator as it is eaten and digested.",
    onWrong: "Arrows show energy transfer — from the thing being eaten to the thing eating it.",
  },
  waves: {
    question: "What does a higher frequency mean for a sound wave?",
    options: ["Higher pitch", "Louder sound", "Faster speed", "Longer wavelength"],
    correctIndex: 0,
    onCorrect: "Yes — more vibrations per second = higher pitch. Bats hear very high-frequency sounds humans cannot.",
    onWrong: "Frequency = vibrations per second. More vibrations = higher pitch. Amplitude = loudness.",
  },
  space: {
    question: "What force keeps planets in orbit around the Sun?",
    options: ["Gravity", "Magnetism", "Friction", "Nuclear force"],
    correctIndex: 0,
    onCorrect: "Exactly — gravity pulls planets toward the Sun, creating a curved (orbital) path.",
    onWrong: "It is gravity. The Sun's massive gravitational pull keeps planets in stable orbits.",
  },
  respiration: {
    question: "Where in the cell does aerobic respiration occur?",
    options: ["Mitochondria", "Nucleus", "Cell membrane", "Ribosomes"],
    correctIndex: 0,
    onCorrect: "Correct — mitochondria are called the 'powerhouse of the cell' for this reason.",
    onWrong: "Aerobic respiration occurs in the mitochondria — they produce ATP (energy) using oxygen and glucose.",
  },
  general: {
    question: "A good scientific explanation does which of the following?",
    options: ["Links cause to effect using evidence", "States a guess", "Describes only what you see", "Uses very long sentences"],
    correctIndex: 0,
    onCorrect: "Exactly — every good explanation links cause → mechanism → effect.",
    onWrong: "Science explanations need: observation + mechanism + effect. Not just 'it happened because…'",
  },
};

// ── Step builders ─────────────────────────────────────────────────────────────

function buildScienceSteps(topic: ScienceTopic, ageBand: AgeBand, hintLevel: number): CoachStep[] {
  const allSteps: Record<ScienceTopic, CoachStep[]> = {
    forces: [
      { expression: "Identify the forces", explanation: "List all forces acting: gravity, friction, applied force, normal reaction." },
      { expression: "Draw a force diagram", explanation: "Show arrows: direction and relative size matter." },
      { expression: "Apply Newton's Law", explanation: "F = ma. If forces are balanced, acceleration = 0." },
      { expression: "Calculate and check", explanation: "Use correct units: force in N, mass in kg, acceleration in m/s²." },
    ],
    electricity: [
      { expression: "Identify the components", explanation: "Battery (source), wires (conductor), bulb/resistor (load)." },
      { expression: "Check series vs parallel", explanation: "Series: one path. Parallel: multiple paths." },
      { expression: "Apply V = IR", explanation: "Voltage = Current × Resistance. Choose two known values, find the third." },
      { expression: "Verify units", explanation: "V in volts, I in amps, R in ohms." },
    ],
    photosynthesis: [
      { expression: "Reactants", explanation: "Carbon dioxide (CO₂) + Water (H₂O)" },
      { expression: "Energy source", explanation: "Sunlight, captured by chlorophyll in chloroplasts." },
      { expression: "Products", explanation: "Glucose (C₆H₁₂O₆) + Oxygen (O₂)" },
      { expression: "Full equation", explanation: "6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂" },
    ],
    chemistry: [
      { expression: "Identify reactant types", explanation: "Acid, alkali, metal, oxide? This determines the reaction type." },
      { expression: "Predict products", explanation: "Acid + metal → salt + hydrogen gas." },
      { expression: "Balance the equation", explanation: "Atoms on the left must equal atoms on the right." },
      { expression: "State energy change", explanation: "Does it release heat (exothermic) or absorb it (endothermic)?" },
    ],
    states_of_matter: [
      { expression: "Describe particle arrangement", explanation: "Solid: close, ordered, vibrating. Liquid: close, random, moving. Gas: spread out, fast." },
      { expression: "Identify the change", explanation: "Melting, freezing, evaporating, condensing, subliming?" },
      { expression: "Link to energy", explanation: "Increasing temperature increases particle energy and speed." },
      { expression: "State the transition", explanation: "Name the starting state, the energy change, and the final state." },
    ],
    energy: [
      { expression: "Identify energy stores", explanation: "Chemical, kinetic, thermal, gravitational potential, elastic potential." },
      { expression: "Trace the transfer", explanation: "Energy transfers from one store to another — draw an energy pathway." },
      { expression: "Identify wasted energy", explanation: "Usually heat or sound — this is 'dissipated' energy." },
      { expression: "Calculate efficiency", explanation: "Efficiency = (useful energy out ÷ total energy in) × 100%." },
    ],
    cells: [
      { expression: "Name the cell type", explanation: "Animal or plant? Specialised cell? (e.g. red blood, nerve, root hair)" },
      { expression: "List key organelles", explanation: "Nucleus, cytoplasm, mitochondria — all cells have these." },
      { expression: "Plant additions", explanation: "+ Cell wall, chloroplast, large vacuole." },
      { expression: "Link structure to function", explanation: "Each feature exists for a reason — explain WHY it is present." },
    ],
    genetics: [
      { expression: "Identify alleles", explanation: "Capital = dominant, lowercase = recessive. e.g. B = brown, b = blue eyes." },
      { expression: "Set up Punnett square", explanation: "Parent genotypes on each axis. Fill 4 boxes." },
      { expression: "Count genotypes", explanation: "How many boxes show BB, Bb, bb?" },
      { expression: "State probability", explanation: "Probability = number of target outcomes ÷ total boxes (= out of 4)." },
    ],
    ecology: [
      { expression: "Identify producers", explanation: "Plants/algae — they make energy via photosynthesis." },
      { expression: "Build the chain", explanation: "Producer → primary consumer → secondary consumer → tertiary consumer." },
      { expression: "Explain energy loss", explanation: "Only ~10% of energy passes to the next level — the rest is heat, waste, movement." },
      { expression: "Predict population impact", explanation: "If one species is removed, how does this cascade through the chain?" },
    ],
    waves: [
      { expression: "Identify wave type", explanation: "Transverse (light, water) or longitudinal (sound)?" },
      { expression: "Label key features", explanation: "Amplitude (height), wavelength (length of one full cycle), frequency (waves per second)." },
      { expression: "Apply wave equation", explanation: "Wave speed = frequency × wavelength (v = fλ)." },
      { expression: "Describe behaviour", explanation: "Does it reflect, refract, diffract? Where and why?" },
    ],
    space: [
      { expression: "State the scale", explanation: "Moon orbits Earth. Earth + planets orbit the Sun. Sun is in the Milky Way galaxy." },
      { expression: "Identify the force", explanation: "Gravity provides the centripetal force for circular orbits." },
      { expression: "Explain orbital speed", explanation: "Closer to the Sun = stronger gravity = faster orbit." },
      { expression: "Apply if needed", explanation: "Use gravitational field strength g = GM/r². At GCSE: g ≈ 10 N/kg on Earth." },
    ],
    respiration: [
      { expression: "Aerobic equation", explanation: "Glucose + Oxygen → Carbon dioxide + Water + Energy." },
      { expression: "Location", explanation: "Occurs in the mitochondria of cells." },
      { expression: "Anaerobic (animals)", explanation: "Glucose → Lactic acid + small amount of Energy." },
      { expression: "Why aerobic is preferred", explanation: "Aerobic releases far more ATP (energy) than anaerobic." },
    ],
    general: [
      { expression: "Step 1: Identify key concept", explanation: "What scientific idea is being tested?" },
      { expression: "Step 2: State the mechanism", explanation: "What causes what? Link cause → process → effect." },
      { expression: "Step 3: Use evidence", explanation: "Support with data, examples, or named experiments." },
    ],
  };

  return (allSteps[topic] ?? allSteps.general).slice(0, hintLevel + 1);
}

// ── Reinforcement notes ───────────────────────────────────────────────────────

const SCIENCE_TIPS: Record<AgeBand, string> = {
  foundation: "Science is all around you — think about where you see this in real life!",
  primary: "Remember: describe what you observe, then explain WHY it happens.",
  secondary: "Good answers always link cause → mechanism → effect using scientific terms.",
  gcse: "Exam tip: use precise terminology and link every statement to evidence or an equation.",
};

// ── Main export ───────────────────────────────────────────────────────────────

export function buildScienceCoachResponse(ctx: CoachContext): CoachResponse {
  const topic = detectTopic(ctx.skillFocus, ctx.question);
  const hintLevel = Math.min(ctx.hintCount + 1, 4);
  const shouldReveal = hintLevel >= 4;
  const { ageBand } = ctx;

  const realLife = REAL_LIFE_CONTEXTS[topic]?.[ageBand] ?? "";
  const steps = buildScienceSteps(topic, ageBand, shouldReveal ? 4 : hintLevel);
  const followUp = hintLevel >= 2 ? TOPIC_FOLLOW_UPS[topic] ?? null : null;

  const messages: Record<number, string> = {
    1: `${ageBand === "foundation" ? "Let's think about this together. " : ""}${realLife}`,
    2: `Let's break this down step by step. ${ageBand === "gcse" ? "Use specific terminology." : "Think about what causes what."}`,
    3: `Here is the reasoning framework. Work through each step — can you see where the answer comes from?`,
    4: `Here is the complete explanation. Study each step, then try to explain it back without looking.`,
  };

  // Mistake recovery
  if (ctx.studentAnswer && ctx.correctAnswer && ctx.studentAnswer.trim() !== ctx.correctAnswer.trim()) {
    const recoveryMsg =
      ageBand === "foundation"
        ? `Let's look at that again together. ${realLife}`
        : ageBand === "primary"
          ? `Good try! Let's check your reasoning step by step.`
          : `There may be a misconception here. Let's trace through the science carefully.`;

    return {
      mode: "mistake_recovery",
      ageBand,
      message: recoveryMsg,
      steps: shouldReveal ? steps : steps.slice(0, 2),
      followUp,
      hintLevel,
      shouldReveal,
      reinforcementNote: SCIENCE_TIPS[ageBand] ?? "",
      tryAgainPrompt: shouldReveal ? "Can you now explain this in your own words?" : null,
      masterySignal: null,
      emotionalTone: "You're building your science thinking — every attempt helps!",
      waitPrompt: "Think about what you already know about this topic before reading the hint…",
      similarQuestion: shouldReveal ? { prompt: `In your own words, explain: why does this happen?`, answer: ctx.correctAnswer } : undefined,
    };
  }

  return {
    mode: hintLevel === 1 ? "hint" : hintLevel <= 3 ? "guided_steps" : "reveal",
    ageBand,
    message: messages[hintLevel] ?? messages[4]!,
    steps,
    followUp,
    hintLevel,
    shouldReveal,
    reinforcementNote: SCIENCE_TIPS[ageBand] ?? "",
    tryAgainPrompt: shouldReveal ? "Now explain this in your own words — without looking." : null,
    masterySignal: null,
    emotionalTone:
      ctx.hintCount >= 2
        ? "Science is tricky — the fact you're still trying shows real determination."
        : "Good thinking habit — let's reason through this together.",
    waitPrompt: "Before reading the hint, think: what do you already know about this topic?",
    similarQuestion: shouldReveal ? { prompt: `Explain in your own words: ${ctx.question}`, answer: ctx.correctAnswer } : undefined,
  };
}
