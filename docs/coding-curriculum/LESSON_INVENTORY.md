# StarLiz Coding lesson inventory — proposal

Date: 2 November 2026. Status: for approval only. No new runtime lesson is implemented or published by this inventory.

264 core lessons, 11 year courses, 44 six-lesson modules and 44 portfolio projects. Add 12 consolidation sessions per year; these are practice/retrieval, repair, extension and review opportunities rather than additional new-concept lessons.

Read with [curriculum design](CURRICULUM_DESIGN.md), [coverage review](COVERAGE_REPORT.md) and [implementation plan](IMPLEMENTATION_PLAN.md). Full per-lesson stage instructions, prerequisite IDs, essential checks and mastery records are in [the planning JSON](curriculum-proposal.json), outside application content.

## Lesson and assessment contract

Each row specifies a measurable objective and an executable or interactive challenge, a seeded fault, an unseen independent variation, minimum essential checks, a saved project milestone and alignment IDs. Every lesson uses Discover → Predict → Build → Practise → Debug → Create → Review. The demonstration and learner task use the actual proposed engine; they cannot be passed by accepting an AI claim.

All listed essential checks must pass; the learner must also repair and explain the named fault and pass the independent variation against at least two assessor-held cases. Essential checks are acceptance criteria to author and verify, not assertions that code already exists. Explanations may be spoken, written or demonstrated. Safety and systems lessons use traceable interactive scenarios, circuits, representations or model states; these are not marked as arbitrary code exercises.

Each lesson creates a saved milestone in its module project; lesson 6 in each module assembles and independently changes the complete project. A whole new standalone product is not demanded in every introductory lesson. Model help and accessibility accommodations are recorded separately. An answer reveal requires a new equivalent assessment; an inaccessible interface must never be scored as low mastery.

IDs Yx.nn are proposal references only. Existing runtime IDs, titles and approved assets are retained. Sequential prerequisites represent the recommended route; placement may establish equivalent skills with practical evidence rather than force repetition. No prerequisite may be waived merely because of a learner's age or a self-report.

## Year 1: First Instructions

Pathway: **Coding Foundations** (`foundations`). Course ID: `first-instructions`. Recommended core session length: 30 minutes; split or extend according to evidence.

### Putting Steps in Order

Project **P-Y1-1: Parcel delivery route**. Workspace: route. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y1.01 — What is an instruction? [retains what-is-an-instruction] | Give a character one precise command and distinguish commands from descriptions. | A vague instruction produces the wrong action. | Choose a precise command for a new picture. | command executes once; description rejected; action matches prediction | Prerequisite: introductory access/tool exploration. Add a saved, reviewable what is an instruction? milestone to P-Y1-1; this is not a separate capstone. | K1A, K1C |
| Y1.02 — Put steps in order | Arrange three commands to reach a marked destination. | Two commands have been swapped. | Solve a route with a different start. | all commands ordered; endpoint correct; start restored | Prerequisite: Y1.01. Add a saved, reviewable put steps in order milestone to P-Y1-1; this is not a separate capstone. | K1A, K1B |
| Y1.03 — Predict before running | Mark the endpoint of a short sequence before playing it. | The prediction ignores the final command. | Predict a new four-command route. | prediction recorded first; endpoint verified; mismatch explained | Prerequisite: Y1.02. Add a saved, reviewable predict before running milestone to P-Y1-1; this is not a separate capstone. | K1C, K1B |
| Y1.04 — Find the wrong step | Repair a wrong direction using the movement trace. | One move points away from the destination. | Repair a different single-step fault. | fault identified; corrected route passes; other steps preserved | Prerequisite: Y1.03. Add a saved, reviewable find the wrong step milestone to P-Y1-1; this is not a separate capstone. | K1B, K1C |
| Y1.05 — Plan a delivery | Draw a route then turn it into executable instructions. | The plan omits a required stop. | Add a new delivery stop to a new map. | plan matches program; stop visited; destination reached | Prerequisite: Y1.04. Add a saved, reviewable plan a delivery milestone to P-Y1-1; this is not a separate capstone. | K1A, K1B |
| Y1.06 — Project: deliver the parcel | Build and explain an independent parcel-delivery route. | A supplied route reaches the wrong house. | Deliver to a changed address without a shown solution. | destination correct; prediction correct; repair explained | Prerequisite: Y1.05. Complete P-Y1-1: Parcel delivery route. | K1A, K1B, K1C, X-PORT |

### Make and Find

Project **P-Y1-2: Illustrated instruction card**. Workspace: media. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y1.07 — Choose a tool | Select a drawing or text tool for an instruction card. | A tool cannot produce the requested mark. | Choose tools for a new card. | tool fits purpose; mark editable; choice explained | Prerequisite: Y1.06. Add a saved, reviewable choose a tool milestone to P-Y1-2; this is not a separate capstone. | K1D |
| Y1.08 — Make a picture | Create an original picture from shapes and colour choices. | A required object is hidden behind another. | Draw a new object with visible parts. | required parts visible; layers editable; original work saved | Prerequisite: Y1.07. Add a saved, reviewable make a picture milestone to P-Y1-2; this is not a separate capstone. | K1D |
| Y1.09 — Add a caption | Attach a readable caption to a picture. | The caption labels the wrong object. | Caption a new picture with read-aloud support. | caption matches picture; text readable; audio alternative works | Prerequisite: Y1.08. Add a saved, reviewable add a caption milestone to P-Y1-2; this is not a separate capstone. | K1D |
| Y1.10 — Save and retrieve | Name, save, close and reopen a card. | A learner selects a similarly named file. | Find a requested card among three saved cards. | name meaningful; correct file reopened; content unchanged | Prerequisite: Y1.09. Add a saved, reviewable save and retrieve milestone to P-Y1-2; this is not a separate capstone. | K1D |
| Y1.11 — Improve a creation | Use feedback to revise a card while retaining the original. | An edit accidentally removes a useful instruction. | Make one justified change to a different card. | original retained; change visible; reason recorded | Prerequisite: Y1.10. Add a saved, reviewable improve a creation milestone to P-Y1-2; this is not a separate capstone. | K1D, X-PORT |
| Y1.12 — Project: my instruction card | Produce a picture-and-caption card for a familiar task. | Steps and pictures disagree. | Create a card for a new familiar task. | steps usable; picture supports meaning; saved card retrieves | Prerequisite: Y1.11. Complete P-Y1-2: Illustrated instruction card. | K1D, K1A, X-PORT |

### Patterns that Run

Project **P-Y1-3: Animated pattern garden**. Workspace: route. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y1.13 — Spot a pattern | Complete and run a repeating movement pattern. | One movement breaks the pattern. | Complete a new two-action pattern. | pattern identified; continuation correct; playback matches | Prerequisite: Y1.12. Add a saved, reviewable spot a pattern milestone to P-Y1-3; this is not a separate capstone. | K1A, K1C |
| Y1.14 — Repeat one action | Replace three identical commands with a repeat block. | The repeat count is too large. | Choose a repeat count for a new target. | endpoint correct; repeat used; count explained | Prerequisite: Y1.13. Add a saved, reviewable repeat one action milestone to P-Y1-3; this is not a separate capstone. | K1B, K1C |
| Y1.15 — Repeat a group | Place two actions inside a repeat and predict their order. | One action is outside the group. | Build a different two-action repeated group. | group order correct; count correct; trace explained | Prerequisite: Y1.14. Add a saved, reviewable repeat a group milestone to P-Y1-3; this is not a separate capstone. | K1A, K1B |
| Y1.16 — Compare two programs | Show that a repeated and expanded program produce the same trace. | One expanded program omits an action. | Compare two new equivalent programs. | traces match; difference spotted; equivalence explained | Prerequisite: Y1.15. Add a saved, reviewable compare two programs milestone to P-Y1-3; this is not a separate capstone. | K1C |
| Y1.17 — Make a pattern garden | Arrange animated flowers using repeated actions. | An animation does not restart at its initial state. | Add a different repeating flower pattern. | pattern visible; restart consistent; repeat count correct | Prerequisite: Y1.16. Add a saved, reviewable make a pattern garden milestone to P-Y1-3; this is not a separate capstone. | K1B, K1D |
| Y1.18 — Project: pattern garden | Save a garden with two independently planned movement patterns. | A repeated group contains a misplaced action. | Create a new pattern from a fresh picture brief. | two patterns run; one fault repaired; work reopens | Prerequisite: Y1.17. Complete P-Y1-3: Animated pattern garden. | K1A, K1B, K1D, X-PORT |

### Safe Digital Creators

Project **P-Y1-4: Private digital storybook**. Workspace: scenario. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y1.19 — Technology around us | Match familiar devices to their useful actions in a device simulator. | A device is matched to an impossible function. | Sort unfamiliar illustrated everyday devices. | three matches justified; impossible claim rejected; action demonstrated | Prerequisite: Y1.18. Add a saved, reviewable technology around us milestone to P-Y1-4; this is not a separate capstone. | K1E |
| Y1.20 — Keep personal details private | Choose safe information for a fictional character's profile. | A sample profile includes a home address. | Repair another fictional profile. | private details excluded; safe alternative selected; reason given | Prerequisite: Y1.19. Add a saved, reviewable keep personal details private milestone to P-Y1-4; this is not a separate capstone. | K1F |
| Y1.21 — Be kind with digital work | Choose a respectful response to a simulated shared picture. | A response mocks another child's work. | Respond to a different fictional disagreement. | respectful action chosen; harmful response rejected; explanation given | Prerequisite: Y1.20. Add a saved, reviewable be kind with digital work milestone to P-Y1-4; this is not a separate capstone. | K1F |
| Y1.22 — Ask a trusted adult | Use a simulated help control when fictional content feels wrong. | A scenario suggests replying to an unknown contact. | Choose help in a different age-appropriate scenario. | contact stopped; trusted help chosen; no private details shared | Prerequisite: Y1.21. Add a saved, reviewable ask a trusted adult milestone to P-Y1-4; this is not a separate capstone. | K1F |
| Y1.23 — Build a private story | Combine a route, picture and caption without personal details. | The story contains an unnecessary identifying detail. | Create a story for a different fictional character. | route runs; media combines; privacy check passes | Prerequisite: Y1.22. Add a saved, reviewable build a private story milestone to P-Y1-4; this is not a separate capstone. | K1B, K1D, K1F |
| Y1.24 — Project: safe storybook | Save and replay a private two-scene story with clear instructions. | A scene is missing or reveals a private detail. | Add a new safe scene from a fresh brief. | scenes replay; privacy choice justified; saved work retrieves | Prerequisite: Y1.23. Complete P-Y1-4: Private digital storybook. | K1D, K1F, K1C, X-PORT |

## Year 2: Stories in Steps

Pathway: **Coding Foundations** (`foundations`). Course ID: `stories-in-steps`. Recommended core session length: 30 minutes; split or extend according to evidence.

### Plans and Routes

Project **P-Y2-1: Robot delivery map**. Workspace: robot. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y2.01 — Plan before running | Represent a picture route as an algorithm and predict the endpoint. | The written plan skips a turning point. | Plan a new route before touching blocks. | plan recorded first; endpoint correct; changes explained | Prerequisite: Y1.24. Add a saved, reviewable plan before running milestone to P-Y2-1; this is not a separate capstone. | K1A, K1C |
| Y2.02 — Turn and move | Control a character using heading and forward movement. | Left and right turns are confused. | Navigate from a new starting heading. | heading tracked; turns correct; route completes | Prerequisite: Y2.01. Add a saved, reviewable turn and move milestone to P-Y2-1; this is not a separate capstone. | K1A, K1B |
| Y2.03 — Test the whole route | Run cases that reveal faults at the beginning, middle and end. | An early fault is hidden by a later movement. | Repair a new route with a different fault. | trace used; fault isolated; corrected sequence passes | Prerequisite: Y2.02. Add a saved, reviewable test the whole route milestone to P-Y2-1; this is not a separate capstone. | K1B, K1C |
| Y2.04 — Repeat a route section | Replace a repeated two-command section without changing the route. | A turn is placed outside its repeat. | Compress a different route pattern. | behaviour preserved; repetition used; trace predicted | Prerequisite: Y2.03. Add a saved, reviewable repeat a route section milestone to P-Y2-1; this is not a separate capstone. | K1A, K1B |
| Y2.05 — Input makes something happen | Use a large button to start a planned robot route. | The route runs before the button is pressed. | Connect a new button to a different route. | waits for input; starts once; resets correctly | Prerequisite: Y2.04. Add a saved, reviewable input makes something happen milestone to P-Y2-1; this is not a separate capstone. | K1B, K1E |
| Y2.06 — Project: robot delivery map | Program two delivery routes and explain how input selects one. | Both buttons start the same route. | Meet a fresh two-destination brief. | correct input selects route; destinations reached; restart works | Prerequisite: Y2.05. Complete P-Y2-1: Robot delivery map. | K1A, K1B, K1C, X-ROBOT, X-PORT |

### Stories that Respond

Project **P-Y2-2: Interactive story**. Workspace: scene. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y2.07 — Start a story with an event | Make a sprite respond to a start event. | The story begins twice. | Add a different start event. | one start per event; predictable order; restart works | Prerequisite: Y2.06. Add a saved, reviewable start a story with an event milestone to P-Y2-2; this is not a separate capstone. | K1B |
| Y2.08 — Sequence speech and movement | Order two speech bubbles and movements in a story. | A speech bubble appears after its speaker leaves. | Stage a new three-action scene. | actions ordered; dialogue readable; trace matches plan | Prerequisite: Y2.07. Add a saved, reviewable sequence speech and movement milestone to P-Y2-2; this is not a separate capstone. | K1A, K1D |
| Y2.09 — Repeat a dance | Use a grouped repeat for a character's dance. | One move lies outside the dance loop. | Compose a different repeated dance. | group repeats; count correct; animation returns safely | Prerequisite: Y2.08. Add a saved, reviewable repeat a dance milestone to P-Y2-2; this is not a separate capstone. | K1B, K1C |
| Y2.10 — Two ways to one goal | Compare programs by behaviour and clarity. | A shorter program changes the outcome. | Compare different routes that meet one brief. | both outcomes checked; change identified; preference justified | Prerequisite: Y2.09. Add a saved, reviewable two ways to one goal milestone to P-Y2-2; this is not a separate capstone. | K1C |
| Y2.11 — Debug a scene | Find a story error using event and action order. | A character speaks on the wrong event. | Repair an unfamiliar scene. | event identified; scene corrected; other event preserved | Prerequisite: Y2.10. Add a saved, reviewable debug a scene milestone to P-Y2-2; this is not a separate capstone. | K1B, K1C |
| Y2.12 — Project: animated journey | Build a two-scene interactive story with a repeat and restart. | Restart leaves the old scene visible. | Add an independent scene from a new storyboard. | events work; sequence coherent; restart clears old state | Prerequisite: Y2.11. Complete P-Y2-2: Interactive story. | K1B, K1D, X-PORT |

### Pictures and Data

Project **P-Y2-3: Classroom survey display**. Workspace: data. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y2.13 — Ask a useful question | Choose a question with countable picture responses. | The question combines two different choices. | Create a new two-option question. | question clear; options distinct; responses recordable | Prerequisite: Y2.12. Add a saved, reviewable ask a useful question milestone to P-Y2-3; this is not a separate capstone. | K1D |
| Y2.14 — Collect picture data | Record a small fictional survey in a pictogram tool. | One response is counted twice. | Record a different supplied survey. | each response counted once; categories correct; total correct | Prerequisite: Y2.13. Add a saved, reviewable collect picture data milestone to P-Y2-3; this is not a separate capstone. | K1D |
| Y2.15 — Sort and find | Organise saved objects by two simple attributes. | One object is in the wrong group. | Find requested objects in a new collection. | groups consistent; requested item found; reason explained | Prerequisite: Y2.14. Add a saved, reviewable sort and find milestone to P-Y2-3; this is not a separate capstone. | K1D |
| Y2.16 — Turn data into a display | Generate a chart from counted responses. | Chart labels are swapped. | Display a new dataset. | labels correct; counts match; display readable | Prerequisite: Y2.15. Add a saved, reviewable turn data into a display milestone to P-Y2-3; this is not a separate capstone. | K1D |
| Y2.17 — Check a digital claim | Compare a statement with a supplied chart. | The statement describes the largest group incorrectly. | Check a new chart statement. | evidence located; correct conclusion selected; uncertainty noted | Prerequisite: Y2.16. Add a saved, reviewable check a digital claim milestone to P-Y2-3; this is not a separate capstone. | K1C, K1D |
| Y2.18 — Project: survey display | Combine a question, pictogram and spoken or written conclusion. | A conclusion does not match the recorded counts. | Present a new small fictional survey. | counts accurate; conclusion supported; saved display retrieves | Prerequisite: Y2.17. Complete P-Y2-3: Classroom survey display. | K1D, X-PORT |

### Connected Creators

Project **P-Y2-4: Digital community guide**. Workspace: scenario. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y2.19 — Computers in the community | Operate simulated inputs and outputs in everyday devices. | A device output is mistaken for input. | Explain a new fictional device. | input identified; output demonstrated; purpose explained | Prerequisite: Y2.18. Add a saved, reviewable computers in the community milestone to P-Y2-4; this is not a separate capstone. | K1E |
| Y2.20 — Organise a shared creation | Save versions and find the intended story or data file. | The wrong version is selected. | Retrieve a new named version. | correct version found; naming usable; original retained | Prerequisite: Y2.19. Add a saved, reviewable organise a shared creation milestone to P-Y2-4; this is not a separate capstone. | K1D |
| Y2.21 — Respect another person's work | Choose when permission or credit is needed in a media scenario. | An image is presented as the learner's own drawing. | Repair a different reuse scenario. | creator acknowledged; permission choice justified; original preserved | Prerequisite: Y2.20. Add a saved, reviewable respect another person's work milestone to P-Y2-4; this is not a separate capstone. | K1F, K1D |
| Y2.22 — Recognise unsafe contact | Reject an inappropriate fictional request for details. | A character is encouraged to continue unknown contact. | Choose safe action in a new scenario. | private details withheld; contact stopped; trusted adult selected | Prerequisite: Y2.21. Add a saved, reviewable recognise unsafe contact milestone to P-Y2-4; this is not a separate capstone. | K1F |
| Y2.23 — Explain a concern | Use a simulated report tool to describe a fictional concern. | The report includes unnecessary personal information. | Report a different fictional concern. | concern clear; appropriate help route chosen; no sensitive data added | Prerequisite: Y2.22. Add a saved, reviewable explain a concern milestone to P-Y2-4; this is not a separate capstone. | K1F |
| Y2.24 — Project: community guide | Create a safe guide combining a device demonstration, picture and help advice. | The guide gives unsafe contact advice. | Build a guide for a different fictional setting. | device purpose correct; media organised; help advice safe | Prerequisite: Y2.23. Complete P-Y2-4: Digital community guide. | K1D, K1E, K1F, X-PORT |

## Year 3: Build Your First Games

Pathway: **Block Coding** (`block-coding`). Course ID: `first-games`. Recommended core session length: 45 minutes; split or extend according to evidence.

### Repeating Actions

Project **P-Y3-1: Loop-powered animation**. Workspace: route. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y3.01 — Start with an event | Connect different events to distinct sprite actions. | Both events trigger the same action. | Configure a new pair of events. | event-action mapping correct; no duplicate trigger; reset works | Prerequisite: Y2.24. Add a saved, reviewable start with an event milestone to P-Y3-1; this is not a separate capstone. | K2B |
| Y3.02 — Understanding Loops [retains understanding-loops] | Predict, build, repair and explain repeat blocks in the existing grid lesson. | A repeated move points left instead of right. | Reach an unseen target without a disclosed answer. | prediction correct; goal reached with loops; independent explanation matches | Prerequisite: Y3.01. Add a saved, reviewable understanding loops milestone to P-Y3-1; this is not a separate capstone. | K2B, K2C |
| Y3.03 — Coordinates and position | Place a sprite at coordinates and trace movement between positions. | An axis is interpreted backwards. | Reach a new coordinate from a different position. | axes correct; endpoint correct; trace explained | Prerequisite: Y3.02. Add a saved, reviewable coordinates and position milestone to P-Y3-1; this is not a separate capstone. | K2B, K2C |
| Y3.04 — Repeat until an event | Use a bounded repeat-until condition to stop an animation. | The stop condition is never checked. | Stop a different animation at a specified event. | repeats as required; stop works; execution limit respected | Prerequisite: Y3.03. Add a saved, reviewable repeat until an event milestone to P-Y3-1; this is not a separate capstone. | K2B, K2C |
| Y3.05 — Plan an animation in parts | Split an animation into start, movement and finish sections. | A finish action runs before movement ends. | Plan a new three-part animation. | parts named; order justified; animation meets plan | Prerequisite: Y3.04. Add a saved, reviewable plan an animation in parts milestone to P-Y3-1; this is not a separate capstone. | K2A |
| Y3.06 — Project: loop-powered animation | Build an animation with events, coordinates and two repeat patterns. | Restart retains an incorrect sprite position. | Implement a fresh animation brief. | events reliable; patterns correct; restart deterministic | Prerequisite: Y3.05. Complete P-Y3-1: Loop-powered animation. | K2A, K2B, K2C, X-PORT |

### Decisions in Games

Project **P-Y3-2: Playable maze**. Workspace: scene. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y3.07 — Make a choice | Use a condition to select between two actions. | The condition is reversed. | Program a new decision with both outcomes. | true case correct; false case correct; decision explained | Prerequisite: Y3.06. Add a saved, reviewable make a choice milestone to P-Y3-2; this is not a separate capstone. | K2B, K2C |
| Y3.08 — Read player input | Move a character in response to directional input. | A key moves the character on the wrong axis. | Create a different control layout. | inputs mapped; release stops movement; reset works | Prerequisite: Y3.07. Add a saved, reviewable read player input milestone to P-Y3-2; this is not a separate capstone. | K2B |
| Y3.09 — Detect a collision | Respond to contact without triggering on near misses. | A near miss is treated as a collision. | Handle a different obstacle arrangement. | contact detected; near miss ignored; response bounded | Prerequisite: Y3.08. Add a saved, reviewable detect a collision milestone to P-Y3-2; this is not a separate capstone. | K2A, K2B |
| Y3.10 — Choose a winning condition | Define a win condition distinct from simply stopping. | A wall collision awards a win. | Implement a new goal and failure condition. | goal wins; obstacle does not; feedback identifies result | Prerequisite: Y3.09. Add a saved, reviewable choose a winning condition milestone to P-Y3-2; this is not a separate capstone. | K2B, K2C |
| Y3.11 — Test every route | Use planned cases for success, failure and restart. | A route can leave the board. | Find and repair a new boundary defect. | success tested; failure tested; boundary safe | Prerequisite: Y3.10. Add a saved, reviewable test every route milestone to P-Y3-2; this is not a separate capstone. | K2A, K2C |
| Y3.12 — Project: playable maze | Create a maze with controls, collision, win condition and reset. | A completed game cannot restart. | Meet a fresh maze layout and control brief. | maze playable; win verified; restart clean | Prerequisite: Y3.11. Complete P-Y3-2: Playable maze. | K2A, K2B, K2C, X-PORT |

### Robot Missions

Project **P-Y3-3: Sensor-controlled delivery robot**. Workspace: robot. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y3.13 — Describe a robot system | Connect simulated sensors, controller and actuators. | A sensor is wired to the wrong action. | Model another robot's input-output chain. | input identified; control decision runs; actuator responds | Prerequisite: Y3.12. Add a saved, reviewable describe a robot system milestone to P-Y3-3; this is not a separate capstone. | K2A, K2B, X-ROBOT |
| Y3.14 — Read a distance sensor | Respond to sensor values at a stated threshold. | The comparison excludes the boundary value. | Choose a new safe stopping distance. | below threshold stops; boundary handled; above continues | Prerequisite: Y3.13. Add a saved, reviewable read a distance sensor milestone to P-Y3-3; this is not a separate capstone. | K2A, K2B, X-ROBOT |
| Y3.15 — Control a motor safely | Combine movement commands with bounded power and duration. | A motor keeps running after the mission. | Control a different motor sequence. | power bounded; duration bounded; stop guaranteed | Prerequisite: Y3.14. Add a saved, reviewable control a motor safely milestone to P-Y3-3; this is not a separate capstone. | K2A, X-ROBOT |
| Y3.16 — Follow a marked path | Use sensor feedback to adjust a robot's direction. | The robot turns away from the line. | Follow a different safe track. | track followed; error corrected; mission terminates | Prerequisite: Y3.15. Add a saved, reviewable follow a marked path milestone to P-Y3-3; this is not a separate capstone. | K2A, K2C, X-ROBOT |
| Y3.17 — Decompose a delivery mission | Build and test separate travel, detect and stop behaviours. | One part changes state needed by the next. | Plan a new mission with an extra stop. | parts independently checked; interfaces agree; mission completes | Prerequisite: Y3.16. Add a saved, reviewable decompose a delivery mission milestone to P-Y3-3; this is not a separate capstone. | K2A, K2C, X-ROBOT |
| Y3.18 — Project: sensor delivery robot | Deliver a virtual parcel and stop when a sensor detects the destination. | The robot stops at the first obstacle instead. | Complete an unseen sensor mission. | destination reached; obstacles handled; stop reliable | Prerequisite: Y3.17. Complete P-Y3-3: Sensor-controlled delivery robot. | K2A, K2B, K2C, X-ROBOT, X-PORT |

### Networks and Search

Project **P-Y3-4: Trusted discovery guide**. Workspace: network. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y3.19 — Connect devices in a network | Build a small message network and trace delivery. | A disconnected device is assumed reachable. | Route a message through a new network. | connected path works; disconnect identified; trace explained | Prerequisite: Y3.18. Add a saved, reviewable connect devices in a network milestone to P-Y3-4; this is not a separate capstone. | K2D |
| Y3.20 — Internet and web are different | Match web pages and other services to a network model. | Every internet service is labelled a website. | Classify new fictional service requests. | service distinguished; network role correct; misconception repaired | Prerequisite: Y3.19. Add a saved, reviewable internet and web are different milestone to P-Y3-4; this is not a separate capstone. | K2D |
| Y3.21 — Search for a purpose | Choose search terms that locate a requested item in a curated index. | The query is too vague. | Find evidence for a new question. | relevant result found; query refined; evidence recorded | Prerequisite: Y3.20. Add a saved, reviewable search for a purpose milestone to P-Y3-4; this is not a separate capstone. | K2E |
| Y3.22 — Why results change | Compare ranked results when relevance and promotion signals change. | The first result is assumed most reliable. | Explain a changed curated results list. | ranking change identified; promotion recognised; reliability checked separately | Prerequisite: Y3.21. Add a saved, reviewable why results change milestone to P-Y3-4; this is not a separate capstone. | K2E |
| Y3.23 — Check before sharing | Evaluate a curated page and use a safe concern-report route. | An unsupported page is copied into a guide. | Assess a different fictional page. | claim checked; source noted; concern routed safely | Prerequisite: Y3.22. Add a saved, reviewable check before sharing milestone to P-Y3-4; this is not a separate capstone. | K2E, K2G |
| Y3.24 — Project: trusted discovery guide | Combine a network diagram, search record and credited answer for a younger learner. | A ranked result lacks supporting evidence. | Create a guide for a different question. | network explanation correct; evidence supported; credit and safety included | Prerequisite: Y3.23. Complete P-Y3-4: Trusted discovery guide. | K2D, K2E, K2F, K2G, X-PORT |

## Year 4: Interactive Worlds

Pathway: **Block Coding** (`block-coding`). Course ID: `interactive-worlds`. Recommended core session length: 45 minutes; split or extend according to evidence.

### State and Events

Project **P-Y4-1: Score-and-lives game**. Workspace: scene. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y4.01 — Remember the score | Update a score variable through play and initialise it on restart. | Restart keeps the old score. | Implement a new scoring rule. | score updates once; reset sets initial value; trace explained | Prerequisite: Y3.24. Add a saved, reviewable remember the score milestone to P-Y4-1; this is not a separate capstone. | K2B |
| Y4.02 — Time and lives | Use counters for time and lives with clear end states. | Lives can become negative. | Change the time and life limits. | limits respected; end state correct; restart restores counters | Prerequisite: Y4.01. Add a saved, reviewable time and lives milestone to P-Y4-1; this is not a separate capstone. | K2B, K2C |
| Y4.03 — Send a message | Coordinate two sprites through named messages. | A receiver responds to the wrong message. | Coordinate a different pair of sprites. | correct receiver acts; unrelated receiver waits; no duplicate action | Prerequisite: Y4.02. Add a saved, reviewable send a message milestone to P-Y4-1; this is not a separate capstone. | K2B |
| Y4.04 — Loops inside loops | Predict and build nested repeats with bounded execution. | An inner count is mistaken for the total count. | Create a different nested pattern. | trace predicted; total actions correct; execution bounded | Prerequisite: Y4.03. Add a saved, reviewable loops inside loops milestone to P-Y4-1; this is not a separate capstone. | K2B, K2C |
| Y4.05 — Repair changing state | Use a state trace to find an incorrect score or life update. | A collision subtracts a life every frame. | Repair a different repeated-update defect. | one event one update; trace identifies fault; game remains playable | Prerequisite: Y4.04. Add a saved, reviewable repair changing state milestone to P-Y4-1; this is not a separate capstone. | K2C |
| Y4.06 — Project: score-and-lives game | Build and test a game with score, time, lives and a clear replay cycle. | Replay fails to clear an event flag. | Meet a fresh win-loss brief. | score correct; win and loss tested; replay clean | Prerequisite: Y4.05. Complete P-Y4-1: Score-and-lives game. | K2A, K2B, K2C, X-PORT |

### Reusable Behaviours

Project **P-Y4-2: Branching story engine**. Workspace: scene. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y4.07 — Split a story into behaviours | Decompose a story into independently testable actions. | A scene depends on an unnamed hidden state. | Plan another story's behaviours. | parts named; inputs stated; each behaviour tested | Prerequisite: Y4.06. Add a saved, reviewable split a story into behaviours milestone to P-Y4-2; this is not a separate capstone. | K2A |
| Y4.08 — Name a reusable action | Replace duplicated block sequences with a named procedure. | One copy differs from the intended procedure. | Reuse a new action in two contexts. | procedure matches intention; two calls work; duplication removed | Prerequisite: Y4.07. Add a saved, reviewable name a reusable action milestone to P-Y4-2; this is not a separate capstone. | K2A, K2B |
| Y4.09 — Give an action a parameter | Pass a count or direction into a reusable action. | A procedure ignores its parameter. | Create a different parameterised action. | two parameter values work; limits checked; call explained | Prerequisite: Y4.08. Add a saved, reviewable give an action a parameter milestone to P-Y4-2; this is not a separate capstone. | K2B |
| Y4.10 — Combine conditions | Use two conditions to control a story branch. | Either condition is accepted when both are needed. | Build a new combined decision. | both-needed case passes; single condition fails; explanation correct | Prerequisite: Y4.09. Add a saved, reviewable combine conditions milestone to P-Y4-2; this is not a separate capstone. | K2B, K2C |
| Y4.11 — Trace a branching story | Predict path choices and repair an unreachable scene. | A branch condition prevents a required scene. | Repair another branching storyboard. | paths traced; unreachable scene fixed; other paths preserved | Prerequisite: Y4.10. Add a saved, reviewable trace a branching story milestone to P-Y4-2; this is not a separate capstone. | K2A, K2C |
| Y4.12 — Project: branching story engine | Create a story with reusable actions, parameters and tested branches. | A reused action behaves differently in one scene. | Implement a fresh story branch independently. | procedures reused; both branches work; user can restart | Prerequisite: Y4.11. Complete P-Y4-2: Branching story engine. | K2A, K2B, K2C, X-PORT |

### Data and Media

Project **P-Y4-3: Interactive evidence poster**. Workspace: data. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y4.13 — Collect fair data | Design categories and record a supplied non-personal dataset. | Categories overlap and double-count entries. | Categorise a new fictional dataset. | categories clear; total correct; ambiguity explained | Prerequisite: Y4.12. Add a saved, reviewable collect fair data milestone to P-Y4-3; this is not a separate capstone. | K2F |
| Y4.14 — Calculate and check | Use a spreadsheet-style tool to calculate totals and simple comparisons. | A formula excludes the last row. | Calculate a different supplied table. | formula range correct; total verified; edit recalculates | Prerequisite: Y4.13. Add a saved, reviewable calculate and check milestone to P-Y4-3; this is not a separate capstone. | K2F |
| Y4.15 — Choose a useful chart | Select and label a chart that answers a stated question. | A misleading scale exaggerates a difference. | Present a different dataset fairly. | chart fits question; labels correct; scale justified | Prerequisite: Y4.14. Add a saved, reviewable choose a useful chart milestone to P-Y4-3; this is not a separate capstone. | K2F, K2E |
| Y4.16 — Combine media with credit | Create original media and credit permitted reused assets. | An image has no usable permission record. | Replace an asset under a new reuse brief. | permission checked; credit present; original editable | Prerequisite: Y4.15. Add a saved, reviewable combine media with credit milestone to P-Y4-3; this is not a separate capstone. | K2F, K2G |
| Y4.17 — Make content usable | Revise a poster for readability, keyboard access and meaningful alternatives. | Meaning is communicated through colour alone. | Improve a different poster for a stated audience. | text readable; alternatives meaningful; colour not sole cue | Prerequisite: Y4.16. Add a saved, reviewable make content usable milestone to P-Y4-3; this is not a separate capstone. | K2F |
| Y4.18 — Project: interactive evidence poster | Combine data, chart, credited media and a small interactive explanation. | A claim contradicts the displayed data. | Create a poster for a new audience and dataset. | claim supported; media credited; interaction usable | Prerequisite: Y4.17. Complete P-Y4-3: Interactive evidence poster. | K2F, K2E, K2G, X-PORT |

### Responsible Collaboration

Project **P-Y4-4: Accessible learning game**. Workspace: scene. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y4.19 — Collaborate with roles | Use a simulated shared workspace with explicit editing roles. | A viewer can overwrite the main project. | Assign roles for another fictional team. | permissions correct; change attributed; history retained | Prerequisite: Y4.18. Add a saved, reviewable collaborate with roles milestone to P-Y4-4; this is not a separate capstone. | K2D, K2G |
| Y4.20 — Give useful feedback | Comment on a creation using specific evidence and respectful wording. | Feedback targets the author instead of the work. | Review a new fictional creation. | feedback specific; respectful; actionable change named | Prerequisite: Y4.19. Add a saved, reviewable give useful feedback milestone to P-Y4-4; this is not a separate capstone. | K2G |
| Y4.21 — Protect accounts and files | Choose safe sign-in and sharing actions in a fixture-based scenario. | A password is placed in a shared note. | Repair a different sharing plan. | secret removed; audience limited; help route identified | Prerequisite: Y4.20. Add a saved, reviewable protect accounts and files milestone to P-Y4-4; this is not a separate capstone. | K2G, X-SEC |
| Y4.22 — Respond to online concerns | Route fictional content, contact and conduct concerns appropriately. | The learner is told to investigate unknown contact. | Resolve a new concern scenario. | unsafe contact stopped; suitable report selected; evidence minimal | Prerequisite: Y4.21. Add a saved, reviewable respond to online concerns milestone to P-Y4-4; this is not a separate capstone. | K2G |
| Y4.23 — Test with a known audience | Observe fictional user-test evidence and prioritise a usability repair. | The chosen change ignores the observed problem. | Improve a different user-test finding. | finding evidenced; change relevant; retest shows improvement | Prerequisite: Y4.22. Add a saved, reviewable test with a known audience milestone to P-Y4-4; this is not a separate capstone. | K2A, K2F |
| Y4.24 — Project: accessible learning game | Deliver a learning game with private sharing, usable controls and documented tests. | A control cannot be reached by keyboard. | Add a fresh accessible feature without answer disclosure. | game teaches stated goal; access checks pass; user feedback addressed | Prerequisite: Y4.23. Complete P-Y4-4: Accessible learning game. | K2A, K2B, K2F, K2G, X-PORT |

## Year 5: From Blocks to Text

Pathway: **Blocks to Text** (`blocks-to-text`). Course ID: `first-text`. Recommended core session length: 45 minutes; split or extend according to evidence.

### Remembering a Value

Project **P-Y5-1: Dual-view score program**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y5.01 — What is a variable? [retains what-is-a-variable] | Store and update a value while tracing its state. | An update overwrites instead of increments. | Implement a new score trace. | initial value correct; updates correct; final state predicted | Prerequisite: Y4.24. Add a saved, reviewable what is a variable? milestone to P-Y5-1; this is not a separate capstone. | K2B |
| Y5.02 — Expressions and types | Evaluate numeric and text expressions and explain their results. | Text digits are treated as a numeric sum. | Solve new mixed-type examples. | types identified; values correct; invalid operation explained | Prerequisite: Y5.01. Add a saved, reviewable expressions and types milestone to P-Y5-1; this is not a separate capstone. | K2B, K2C |
| Y5.03 — Read the text version | Match visual blocks to executable Python statements. | The text order differs from the blocks. | Translate a different short sequence. | outputs equivalent; order preserved; mapping explained | Prerequisite: Y5.02. Add a saved, reviewable read the text version milestone to P-Y5-1; this is not a separate capstone. | K2B, K2C |
| Y5.04 — Write and run Python | Edit a small Python program and read actual output. | A syntax error prevents execution. | Write a new two-step program. | code executes; output correct; syntax fault repaired | Prerequisite: Y5.03. Add a saved, reviewable write and run python milestone to P-Y5-1; this is not a separate capstone. | K2B, K2C |
| Y5.05 — Trace variable changes | Record values before and after several assignments. | A trace uses the updated value too early. | Trace an unseen assignment sequence. | each state correct; output predicted; reasoning recorded | Prerequisite: Y5.04. Add a saved, reviewable trace variable changes milestone to P-Y5-1; this is not a separate capstone. | K2C |
| Y5.06 — Project: dual-view score program | Create equivalent visual and Python scoring programs. | One representation applies a bonus twice. | Implement a fresh scoring rule in both views. | outputs equivalent; reset correct; learner explains translation | Prerequisite: Y5.05. Complete P-Y5-1: Dual-view score program. | K2A, K2B, K2C, X-PORT |

### Decisions in Python

Project **P-Y5-2: Number challenge**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y5.07 — Choose with if | Implement selection in Python and test both outcomes. | The comparison operator is wrong. | Build a decision for new thresholds. | true case correct; false case correct; boundary checked | Prerequisite: Y5.06. Add a saved, reviewable choose with if milestone to P-Y5-2; this is not a separate capstone. | K2B |
| Y5.08 — Input and conversion | Read controlled input and convert it to a needed type. | Invalid text crashes a numeric calculation. | Handle a different valid-invalid input pair. | valid input works; invalid handled; clear feedback given | Prerequisite: Y5.07. Add a saved, reviewable input and conversion milestone to P-Y5-2; this is not a separate capstone. | K2B, K2C |
| Y5.09 — Repeat with for | Use a bounded counted loop and predict its output. | An endpoint is excluded unexpectedly. | Generate a new bounded sequence. | iteration count correct; first and last values correct; limit respected | Prerequisite: Y5.08. Add a saved, reviewable repeat with for milestone to P-Y5-2; this is not a separate capstone. | K2B, K2C |
| Y5.10 — Stop with a condition | Use a condition-controlled loop with a guaranteed stopping path. | The loop variable never changes. | Repair a new non-terminating loop safely. | progress changes; stop reached; execution cap respected | Prerequisite: Y5.09. Add a saved, reviewable stop with a condition milestone to P-Y5-2; this is not a separate capstone. | K2B, K2C |
| Y5.11 — Debug with a trace | Locate a logic error using expected and actual variable values. | The wrong variable is updated inside a loop. | Repair a different state-update defect. | fault located; corrected trace passes; unrelated behaviour preserved | Prerequisite: Y5.10. Add a saved, reviewable debug with a trace milestone to P-Y5-2; this is not a separate capstone. | K2C |
| Y5.12 — Project: number challenge | Build a number game with validated input, decisions and bounded repetition. | A solved game asks for another turn. | Implement an unseen winning rule. | input handled; decisions correct; termination and restart tested | Prerequisite: Y5.11. Complete P-Y5-2: Number challenge. | K2A, K2B, K2C, X-PORT |

### Algorithms and Control

Project **P-Y5-3: Robot rescue simulation**. Workspace: robot. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y5.13 — Decompose a physical task | Model a robot mission as smaller input-process-output behaviours. | Two behaviours assume incompatible sensor units. | Decompose a different virtual mission. | interfaces stated; units consistent; parts testable | Prerequisite: Y5.12. Add a saved, reviewable decompose a physical task milestone to P-Y5-3; this is not a separate capstone. | K2A, X-ROBOT |
| Y5.14 — Model a changing system | Represent a simulated rescue area using explicit state. | The model changes hidden facts during a run. | Model a new small environment. | state defined; transitions consistent; prediction checked | Prerequisite: Y5.13. Add a saved, reviewable model a changing system milestone to P-Y5-3; this is not a separate capstone. | K2A, K2C |
| Y5.15 — Write a search algorithm | Find a marked location by a systematic sequence of checks. | A search skips a possible location. | Search a different finite environment. | all candidates considered; found case works; absent case terminates | Prerequisite: Y5.14. Add a saved, reviewable write a search algorithm milestone to P-Y5-3; this is not a separate capstone. | K2A, K2C |
| Y5.16 — Compare rescue plans | Compare two working algorithms by steps and reliability. | The comparison uses different starting conditions. | Compare new plans under identical conditions. | same inputs used; measures accurate; trade-off explained | Prerequisite: Y5.15. Add a saved, reviewable compare rescue plans milestone to P-Y5-3; this is not a separate capstone. | K2C |
| Y5.17 — Test a sensor boundary | Use synthetic readings to test a decision at and around a threshold. | The equality case selects the unsafe action. | Repair a new threshold rule. | below correct; equal correct; above correct | Prerequisite: Y5.16. Add a saved, reviewable test a sensor boundary milestone to P-Y5-3; this is not a separate capstone. | K2A, K2B, X-ROBOT |
| Y5.18 — Project: robot rescue simulation | Build a rescue plan with search, state and verified safe stopping. | A rescued object is collected twice. | Complete a fresh simulated rescue layout. | mission goal met; duplicates prevented; safety conditions tested | Prerequisite: Y5.17. Complete P-Y5-3: Robot rescue simulation. | K2A, K2B, K2C, X-ROBOT, X-PORT |

### Connected Web Makers

Project **P-Y5-4: Evidence-based web guide**. Workspace: web. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y5.19 — Trace a web request | Follow a request across devices and distinguish network from web service. | A disconnected path is treated as a page error. | Trace a different request and fault. | path correct; service identified; fault located | Prerequisite: Y5.18. Add a saved, reviewable trace a web request milestone to P-Y5-4; this is not a separate capstone. | K2D |
| Y5.20 — Search and compare sources | Use a curated index to compare support for a claim. | A promoted result is accepted without evidence. | Investigate a new fictional claim. | query effective; two sources compared; conclusion evidenced | Prerequisite: Y5.19. Add a saved, reviewable search and compare sources milestone to P-Y5-4; this is not a separate capstone. | K2E |
| Y5.21 — Structure with HTML | Create headings, paragraphs, lists and a link in an isolated page. | A heading structure hides the page's main topic. | Build a different content outline. | structure valid; link target safe; outline meaningful | Prerequisite: Y5.20. Add a saved, reviewable structure with html milestone to P-Y5-4; this is not a separate capstone. | K2F |
| Y5.22 — Style with CSS | Use selectors, spacing and colour to improve a page. | A selector changes unintended elements. | Style a fresh page for a stated audience. | selector scope correct; spacing usable; contrast checked | Prerequisite: Y5.21. Add a saved, reviewable style with css milestone to P-Y5-4; this is not a separate capstone. | K2F |
| Y5.23 — Share responsibly | Review permission, privacy and reporting in a private web-guide scenario. | A guide reveals a fictional child's location. | Revise a different guide's sharing plan. | private details removed; audience limited; report route clear | Prerequisite: Y5.22. Add a saved, reviewable share responsibly milestone to P-Y5-4; this is not a separate capstone. | K2G |
| Y5.24 — Project: evidence-based web guide | Combine source comparison, original text and credited media in a private webpage. | A claim has no supporting source. | Create a new safe guide from curated evidence. | claims supported; assets credited; page usable | Prerequisite: Y5.23. Complete P-Y5-4: Evidence-based web guide. | K2D, K2E, K2F, K2G, X-PORT |

## Year 6: Pages and Programs

Pathway: **Blocks to Text** (`blocks-to-text`). Course ID: `pages-and-programs`. Recommended core session length: 45 minutes; split or extend according to evidence.

### Functions and Collections

Project **P-Y6-1: Reusable Python toolkit**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y6.01 — Name a useful function | Define and call a Python function with an explicit input and output. | A function prints a value instead of returning it. | Write a new reusable calculation. | two inputs pass; return value correct; call explained | Prerequisite: Y5.24. Add a saved, reviewable name a useful function milestone to P-Y6-1; this is not a separate capstone. | K2A, K2B |
| Y6.02 — Parameters and scope | Distinguish local values from values outside a function. | A local change unexpectedly relies on global state. | Repair a different parameterised function. | inputs explicit; local state isolated; two calls agree | Prerequisite: Y6.01. Add a saved, reviewable parameters and scope milestone to P-Y6-1; this is not a separate capstone. | K2B, K2C |
| Y6.03 — Store a collection | Use a list to organise related values. | An item is read from an invalid position. | Build a new small collection. | items preserved; access correct; invalid position handled | Prerequisite: Y6.02. Add a saved, reviewable store a collection milestone to P-Y6-1; this is not a separate capstone. | K2B |
| Y6.04 — Process a collection | Use a loop to calculate a result from list values. | An accumulator resets during every iteration. | Process a new list including an empty case. | normal list correct; one-item case correct; empty case handled | Prerequisite: Y6.03. Add a saved, reviewable process a collection milestone to P-Y6-1; this is not a separate capstone. | K2B, K2C |
| Y6.05 — Test a reusable component | Write input-output checks for a reusable function. | Only the familiar example is tested. | Test a new function against unseen inputs. | expected results stated; boundary checked; failing case repaired | Prerequisite: Y6.04. Add a saved, reviewable test a reusable component milestone to P-Y6-1; this is not a separate capstone. | K2C, X-SE |
| Y6.06 — Project: reusable Python toolkit | Build and document three functions used by a small program. | One component depends on hidden outside state. | Implement a new component from an input-output brief. | components pass checks; integration works; reuse explained | Prerequisite: Y6.05. Complete P-Y6-1: Reusable Python toolkit. | K2A, K2B, K2C, X-PORT |

### Web Design for People

Project **P-Y6-2: Accessible portfolio page**. Workspace: web. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y6.07 — Structure an accessible page | Create semantic content with labels and meaningful navigation. | A form field has no accessible label. | Build a new labelled content section. | structure meaningful; labels associated; navigation usable | Prerequisite: Y6.06. Add a saved, reviewable structure an accessible page milestone to P-Y6-2; this is not a separate capstone. | K2F |
| Y6.08 — Design for every screen | Create a responsive page that preserves content at narrow widths. | A fixed-width panel clips important controls. | Repair a different narrow-screen layout. | no essential clipping; order sensible; text readable | Prerequisite: Y6.07. Add a saved, reviewable design for every screen milestone to P-Y6-2; this is not a separate capstone. | K2F |
| Y6.09 — Use licensed media | Choose original or permitted assets and record attribution. | An asset's permission conflicts with intended reuse. | Replace a different incompatible asset. | permission recorded; credit correct; alternative supplied | Prerequisite: Y6.08. Add a saved, reviewable use licensed media milestone to P-Y6-2; this is not a separate capstone. | K2F, K2G |
| Y6.10 — Link evidence clearly | Connect a portfolio claim to its actual saved artifact. | A link opens an unrelated or missing artifact. | Add evidence links for a fresh project. | target correct; label meaningful; private access preserved | Prerequisite: Y6.09. Add a saved, reviewable link evidence clearly milestone to P-Y6-2; this is not a separate capstone. | K2F |
| Y6.11 — Review usability with evidence | Use a stated user's needs to test and improve a page. | A change is selected for appearance without addressing the need. | Fix a different documented access problem. | need identified; change relevant; retest documented | Prerequisite: Y6.10. Add a saved, reviewable review usability with evidence milestone to P-Y6-2; this is not a separate capstone. | K2F, X-PORT |
| Y6.12 — Project: accessible portfolio page | Present two saved creations with captions, credit and accessible navigation. | One project link exposes material outside its allowed audience. | Create a new portfolio section from a fresh brief. | evidence links correct; accessibility checks pass; privacy maintained | Prerequisite: Y6.11. Complete P-Y6-2: Accessible portfolio page. | K2F, K2G, X-PORT |

### Data and Intelligent Tools

Project **P-Y6-3: Data investigation and classifier**. Workspace: ai. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y6.13 — Collect data for a question | Select non-personal data that can answer a stated question. | A collection field does not measure the question. | Plan a different fictional investigation. | question measurable; fields relevant; privacy minimised | Prerequisite: Y6.12. Add a saved, reviewable collect data for a question milestone to P-Y6-3; this is not a separate capstone. | K2F, K2G |
| Y6.14 — Clean and validate data | Find missing, duplicated and inconsistent entries. | A cleaning rule silently removes valid values. | Clean a new synthetic dataset. | defects identified; valid rows preserved; changes logged | Prerequisite: Y6.13. Add a saved, reviewable clean and validate data milestone to P-Y6-3; this is not a separate capstone. | K2F |
| Y6.15 — Analyse and communicate | Calculate a summary and choose a chart suited to the audience. | The chart supports a stronger claim than the data allows. | Present a fresh dataset with a bounded conclusion. | calculation correct; chart fair; limitation stated | Prerequisite: Y6.14. Add a saved, reviewable analyse and communicate milestone to P-Y6-3; this is not a separate capstone. | K2F, K2E |
| Y6.16 — Rules and learned patterns | Compare a rule-based classifier with a small example-trained classifier. | The training examples do not represent one category. | Classify a new balanced fixture set. | rule trace explained; classifier tested; missing examples identified | Prerequisite: Y6.15. Add a saved, reviewable rules and learned patterns milestone to P-Y6-3; this is not a separate capstone. | K2A, K2F, X-AI |
| Y6.17 — Check an AI suggestion | Test a generated coding suggestion instead of accepting its confidence. | A plausible suggestion fails a practical check. | Evaluate a different synthetic AI suggestion. | claim tested; failing behaviour shown; safe correction justified | Prerequisite: Y6.16. Add a saved, reviewable check an ai suggestion milestone to P-Y6-3; this is not a separate capstone. | K2C, K2E, X-AI |
| Y6.18 — Project: data investigation | Create a chart and small classifier with a clear statement of limitations. | A claimed result uses training examples as its only test. | Investigate a fresh dataset with separate test examples. | data checked; held-out examples used; conclusion qualified | Prerequisite: Y6.17. Complete P-Y6-3: Data investigation and classifier. | K2A, K2F, K2G, X-AI, X-PORT |

### Integrated Design Studio

Project **P-Y6-4: Calculator and evidence portfolio**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y6.19 — Turn a brief into tests | Convert a calculator user's needs into practical acceptance checks. | The tests omit an invalid input. | Write checks for a different simple tool. | needs explicit; normal and invalid cases covered; evidence saved | Prerequisite: Y6.18. Add a saved, reviewable turn a brief into tests milestone to P-Y6-4; this is not a separate capstone. | K2A, K2C |
| Y6.20 — Integrate the calculator | Combine tested functions, input handling and output presentation. | Two components disagree about units. | Build a new calculation flow. | units agree; correct result shown; invalid input handled | Prerequisite: Y6.19. Add a saved, reviewable integrate the calculator milestone to P-Y6-4; this is not a separate capstone. | K2A, K2B |
| Y6.21 — Trace the whole solution | Predict a calculation across component boundaries. | An intermediate value is rounded too early. | Trace a different multi-step calculation. | states correct; error located; corrected result verified | Prerequisite: Y6.20. Add a saved, reviewable trace the whole solution milestone to P-Y6-4; this is not a separate capstone. | K2C |
| Y6.22 — Collaborate and recover | Use private version history and respectful review to recover a mistaken edit. | A useful revision is overwritten. | Recover a different fictional edit safely. | right version restored; authorship retained; feedback respectful | Prerequisite: Y6.21. Add a saved, reviewable collaborate and recover milestone to P-Y6-4; this is not a separate capstone. | K2D, K2G, X-SE |
| Y6.23 — Explain design and safety | Record why chosen tools, sources and sharing settings fit the project. | The explanation ignores a privacy risk. | Evaluate another project's design and reporting route. | choices justified; source judged; safety response appropriate | Prerequisite: Y6.22. Add a saved, reviewable explain design and safety milestone to P-Y6-4; this is not a separate capstone. | K2E, K2F, K2G |
| Y6.24 — Project: calculator and portfolio | Deliver a working calculator and a private page explaining its evidence. | A documented claim fails the actual program's test. | Implement an unseen calculator change and update its evidence. | tool passes tests; change independent; portfolio matches artifact | Prerequisite: Y6.23. Complete P-Y6-4: Calculator and evidence portfolio. | K2A, K2B, K2C, K2F, K2G, X-PORT |

## Year 7: Programs and Pages

Pathway: **Programming and Web** (`programming-web`). Course ID: `web-and-python`. Recommended core session length: 60 minutes; split or extend according to evidence.

### Python Starts Here

Project **P-Y7-1: Modular revision quiz**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y7.01 — Your first Python program [retains first-python-program] | Demonstrate prior Python skills by translating a visual algorithm and passing a transfer task. | The translation changes input-output behaviour. | Complete an unseen sequence or take the targeted bridge. | transfer output correct; fault repaired; prior competence recorded | Prerequisite: Y6.24. Add a saved, reviewable your first python program milestone to P-Y7-1; this is not a separate capstone. | K3C |
| Y7.02 — Validate input reliably | Handle expected, boundary and invalid inputs without hidden coercion. | Empty text passes validation. | Implement validation for a new input contract. | normal input accepted; boundary handled; invalid rejected | Prerequisite: Y7.01. Add a saved, reviewable validate input reliably milestone to P-Y7-1; this is not a separate capstone. | K3C |
| Y7.03 — Boolean decisions in Python | Build combined conditions and verify their truth cases. | An OR is used where AND is required. | Implement a different multi-condition decision. | truth cases correct; boundary tested; logic explained | Prerequisite: Y7.02. Add a saved, reviewable boolean decisions in python milestone to P-Y7-1; this is not a separate capstone. | K3C, K3D |
| Y7.04 — Lists and traversal | Use indexed and direct traversal appropriately. | A loop skips the last item. | Process a new list with empty and single-item cases. | all items handled; empty list safe; output correct | Prerequisite: Y7.03. Add a saved, reviewable lists and traversal milestone to P-Y7-1; this is not a separate capstone. | K3C |
| Y7.05 — Functions and return values | Decompose a task into functions with testable interfaces. | A function returns the wrong type. | Implement a new function under the same contract. | two calls correct; interface respected; isolated test passes | Prerequisite: Y7.04. Add a saved, reviewable functions and return values milestone to P-Y7-1; this is not a separate capstone. | K3C |
| Y7.06 — Project: modular revision quiz | Build a quiz with stored questions, validated input and accurate scoring. | Question state leaks between rounds. | Add a fresh question type independently. | scoring correct; modules tested; replay resets state | Prerequisite: Y7.05. Complete P-Y7-1: Modular revision quiz. | K3C, K3G, X-PORT |

### Systems and Binary

Project **P-Y7-2: Executable computer model**. Workspace: systems. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y7.07 — Hardware and software roles | Operate a model linking input devices, processor, memory and output. | Storage and working memory are confused. | Diagnose a different component-role fault. | roles correct; data path traced; diagnosis evidenced | Prerequisite: Y7.06. Add a saved, reviewable hardware and software roles milestone to P-Y7-2; this is not a separate capstone. | K3E |
| Y7.08 — Stored instructions execute | Step a simplified fetch-decode-execute model and track state. | The instruction pointer advances incorrectly. | Trace a new bounded instruction sequence. | instruction order correct; state transitions correct; model limits stated | Prerequisite: Y7.07. Add a saved, reviewable stored instructions execute milestone to P-Y7-2; this is not a separate capstone. | K3F, K3E |
| Y7.09 — Binary numbers and conversion | Represent values in binary and convert both ways within a stated width. | A place value is doubled incorrectly. | Convert unseen values and detect overflow. | conversion correct; width respected; overflow recognised | Prerequisite: Y7.08. Add a saved, reviewable binary numbers and conversion milestone to P-Y7-2; this is not a separate capstone. | K3D |
| Y7.10 — Binary arithmetic | Add fixed-width binary values and explain carry bits. | A carry is dropped. | Add new values including an overflow case. | sum correct; carry trace correct; overflow handled | Prerequisite: Y7.09. Add a saved, reviewable binary arithmetic milestone to P-Y7-2; this is not a separate capstone. | K3D |
| Y7.11 — Logic gates and truth tables | Build simple AND, OR and NOT circuits and predict outputs. | A gate is wired to the wrong signal. | Construct a circuit for a new truth table. | all truth rows pass; fault isolated; circuit-program link explained | Prerequisite: Y7.10. Add a saved, reviewable logic gates and truth tables milestone to P-Y7-2; this is not a separate capstone. | K3D |
| Y7.12 — Project: executable computer model | Combine a small instruction trace, memory values and logic-controlled output. | A model produces output from the wrong stored value. | Execute a new input-and-program pair. | trace reproducible; stored state correct; simplifications explained | Prerequisite: Y7.11. Complete P-Y7-2: Executable computer model. | K3D, K3E, K3F, X-PORT |

### Algorithms and Models

Project **P-Y7-3: Search-and-simulation notebook**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y7.13 — Abstract a problem | Define relevant state and omit irrelevant detail for a small simulation. | A necessary state variable is omitted. | Model a different finite process. | state sufficient; omissions justified; predictions testable | Prerequisite: Y7.12. Add a saved, reviewable abstract a problem milestone to P-Y7-3; this is not a separate capstone. | K3A |
| Y7.14 — Linear search with evidence | Implement linear search and trace successful and unsuccessful cases. | The absent-item case reports the last index. | Search new duplicate and absent datasets. | found case correct; absent handled; trace accurate | Prerequisite: Y7.13. Add a saved, reviewable linear search with evidence milestone to P-Y7-3; this is not a separate capstone. | K3B, K3C |
| Y7.15 — Sort by a stated rule | Implement a simple sorting procedure and trace passes. | The comparison orders one pair incorrectly. | Sort a new list including equal values. | order correct; values preserved; passes explained | Prerequisite: Y7.14. Add a saved, reviewable sort by a stated rule milestone to P-Y7-3; this is not a separate capstone. | K3B, K3C |
| Y7.16 — Compare algorithms fairly | Compare operation counts on identical inputs. | One algorithm receives an already-sorted advantage. | Compare new input families. | conditions equal; counts correct; conclusion bounded | Prerequisite: Y7.15. Add a saved, reviewable compare algorithms fairly milestone to P-Y7-3; this is not a separate capstone. | K3B |
| Y7.17 — Model a physical process | Implement a discrete simulation with explicit units and update order. | The timestep mixes incompatible units. | Model a new simple process. | units consistent; state updates correct; assumptions recorded | Prerequisite: Y7.16. Add a saved, reviewable model a physical process milestone to P-Y7-3; this is not a separate capstone. | K3A, K3C |
| Y7.18 — Project: search-and-simulation notebook | Combine a runnable search, sorting trace and small simulation with evidence. | A written explanation contradicts execution. | Investigate a new problem and justify an algorithm choice. | programs run; comparison fair; assumptions supported | Prerequisite: Y7.17. Complete P-Y7-3: Search-and-simulation notebook. | K3A, K3B, K3C, X-PORT |

### Responsible Data Studio

Project **P-Y7-4: User-focused data report**. Workspace: data. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y7.19 — Represent text digitally | Encode and decode text using a supplied character table. | A code is interpreted under the wrong table. | Decode an unseen fixture message. | round-trip correct; table identified; ambiguity explained | Prerequisite: Y7.18. Add a saved, reviewable represent text digitally milestone to P-Y7-4; this is not a separate capstone. | K3F |
| Y7.20 — Represent images and sound | Manipulate pixel values and sound samples and measure representation changes. | A change in resolution is mistaken for extra detail. | Compare new image and audio settings. | representation traced; size comparison correct; quality trade-off explained | Prerequisite: Y7.19. Add a saved, reviewable represent images and sound milestone to P-Y7-4; this is not a separate capstone. | K3F |
| Y7.21 — Use data across tools | Move a synthetic dataset between program, spreadsheet and chart tool. | Import changes a numeric column into text. | Combine a different dataset across tools. | values preserved; transformation checked; outputs consistent | Prerequisite: Y7.20. Add a saved, reviewable use data across tools milestone to P-Y7-4; this is not a separate capstone. | K3G |
| Y7.22 — Design for a known user | Translate an accessibility need into a measurable design criterion. | A chart cannot be understood without colour. | Improve a different supplied user scenario. | need explicit; criterion measurable; improvement verified | Prerequisite: Y7.21. Add a saved, reviewable design for a known user milestone to P-Y7-4; this is not a separate capstone. | K3G, K3H |
| Y7.23 — Privacy, identity and reporting | Apply a threat-and-help plan to fictional content, contact and conduct concerns. | A report unnecessarily redistributes sensitive content. | Resolve a different age-appropriate scenario. | privacy protected; report route appropriate; minimal evidence retained | Prerequisite: Y7.22. Add a saved, reviewable privacy, identity and reporting milestone to P-Y7-4; this is not a separate capstone. | K3I, X-SEC |
| Y7.24 — Project: user-focused data report | Produce an accessible report combining code, data, charts and source evaluation. | A headline overstates the dataset's reliability. | Respond to a new user and dataset brief. | analysis correct; audience needs met; trust and privacy justified | Prerequisite: Y7.23. Complete P-Y7-4: User-focused data report. | K3G, K3H, K3I, X-PORT |

## Year 8: Interactive Web

Pathway: **Programming and Web** (`programming-web`). Course ID: `interactive-web`. Recommended core session length: 60 minutes; split or extend according to evidence.

### Semantic Interfaces

Project **P-Y8-1: Interactive revision website**. Workspace: web. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y8.01 — Structure an accessible interface | Build semantic HTML with labelled controls and a coherent heading outline. | A control has no programmatic name. | Build a new form section for a stated user. | labels linked; keyboard order sensible; structure meaningful | Prerequisite: Y7.24. Add a saved, reviewable structure an accessible interface milestone to P-Y8-1; this is not a separate capstone. | K3H, K3G |
| Y8.02 — Layout with CSS | Implement a responsive layout for three stated viewport widths. | A fixed element covers the main action. | Repair a different layout constraint. | content retained; no essential overflow; controls usable | Prerequisite: Y8.01. Add a saved, reviewable layout with css milestone to P-Y8-1; this is not a separate capstone. | K3H |
| Y8.03 — JavaScript values and events | Use JavaScript state and events to respond to input. | An event handler reads stale state. | Implement a new interaction in JavaScript. | event fires once; state correct; output updated | Prerequisite: Y8.02. Add a saved, reviewable javascript values and events milestone to P-Y8-1; this is not a separate capstone. | K3C |
| Y8.04 — Update the DOM safely | Render values as data and keep application code separate. | User input is inserted as executable markup. | Display a different untrusted fixture string safely. | text displayed literally; handlers preserved; no injected execution | Prerequisite: Y8.03. Add a saved, reviewable update the dom safely milestone to P-Y8-1; this is not a separate capstone. | K3C, K3I, X-SEC |
| Y8.05 — Validate and explain errors | Implement usable form validation and accessible status feedback. | An error disappears before the user can read it. | Handle a new valid-invalid input contract. | valid accepted; invalid explained; status accessible | Prerequisite: Y8.04. Add a saved, reviewable validate and explain errors milestone to P-Y8-1; this is not a separate capstone. | K3C, K3H |
| Y8.06 — Project: interactive revision website | Build a responsive quiz website using JavaScript and structured state. | Navigation loses the current valid progress. | Implement a fresh question or scoring rule. | site runs; state tested; accessibility criteria met | Prerequisite: Y8.05. Complete P-Y8-1: Interactive revision website. | K3C, K3G, K3H, X-PORT |

### Networks and APIs

Project **P-Y8-2: Resilient service dashboard**. Workspace: api. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y8.07 — Packets and network paths | Trace a message split into packets through a network model. | A missing packet is silently ignored. | Reconstruct a different message with a lost packet. | order reconstructed; loss detected; model assumptions explained | Prerequisite: Y8.06. Add a saved, reviewable packets and network paths milestone to P-Y8-2; this is not a separate capstone. | K3E |
| Y8.08 — Names, addresses and services | Trace a named service request through a simplified lookup and response model. | A failed lookup is mistaken for an application error. | Diagnose a new network-service failure. | lookup role correct; failure layer identified; trace evidenced | Prerequisite: Y8.07. Add a saved, reviewable names, addresses and services milestone to P-Y8-2; this is not a separate capstone. | K3E |
| Y8.09 — Read an API contract | Construct a request and validate a fixture JSON response. | A field has the wrong type. | Consume a new response under the same contract. | request valid; schema checked; invalid response rejected | Prerequisite: Y8.08. Add a saved, reviewable read an api contract milestone to P-Y8-2; this is not a separate capstone. | K3C, X-API |
| Y8.10 — Handle service failure | Implement timeout, error and retry behaviour against a controlled service fixture. | Retries run indefinitely. | Handle a new failure-and-recovery sequence. | timeout bounded; retries limited; feedback accurate | Prerequisite: Y8.09. Add a saved, reviewable handle service failure milestone to P-Y8-2; this is not a separate capstone. | K3C, K3H, X-API |
| Y8.11 — Choose and credit data | Evaluate API fixture provenance, permitted use and limits. | A dashboard presents stale data as current. | Evaluate a new synthetic service source. | source credited; freshness shown; uncertainty stated | Prerequisite: Y8.10. Add a saved, reviewable choose and credit data milestone to P-Y8-2; this is not a separate capstone. | K3H, K3I, X-API |
| Y8.12 — Project: resilient service dashboard | Combine a fixture API, chart and accessible failure states. | A failed refresh erases the last valid result. | Meet a fresh dashboard brief. | normal response works; failure safe; provenance visible | Prerequisite: Y8.11. Complete P-Y8-2: Resilient service dashboard. | K3C, K3E, K3G, K3H, X-API, X-PORT |

### Models and Control

Project **P-Y8-3: Feedback-controlled robot**. Workspace: robot. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y8.13 — Model state and transitions | Represent a robot's modes using a finite state diagram and executable model. | Two transitions fire for one event. | Model a different bounded controller. | states explicit; transitions deterministic; unexpected input handled | Prerequisite: Y8.12. Add a saved, reviewable model state and transitions milestone to P-Y8-3; this is not a separate capstone. | K3A, K3C, X-ROBOT |
| Y8.14 — Calibrate a sensor | Use synthetic reference readings to estimate and correct sensor error. | Calibration uses a mismatched unit. | Calibrate a different sensor fixture. | correction measured; units consistent; residual error reported | Prerequisite: Y8.13. Add a saved, reviewable calibrate a sensor milestone to P-Y8-3; this is not a separate capstone. | K3A, X-ROBOT |
| Y8.15 — Use feedback control | Adjust an actuator from sensor feedback rather than a fixed script. | Feedback moves away from the target. | Control a different target trajectory. | error decreases; output bounded; stopping condition works | Prerequisite: Y8.14. Add a saved, reviewable use feedback control milestone to P-Y8-3; this is not a separate capstone. | K3A, K3C, X-ROBOT |
| Y8.16 — Test noisy inputs | Evaluate a controller against noisy synthetic readings. | One noisy sample triggers repeated unsafe changes. | Handle a different noise pattern. | noise cases tested; actions bounded; trade-off explained | Prerequisite: Y8.15. Add a saved, reviewable test noisy inputs milestone to P-Y8-3; this is not a separate capstone. | K3A, K3B, X-ROBOT |
| Y8.17 — Compare model and observation | Compare simulated predictions with supplied observations. | A model is described as exact despite known mismatch. | Evaluate a new observation set. | differences measured; assumptions identified; revision justified | Prerequisite: Y8.16. Add a saved, reviewable compare model and observation milestone to P-Y8-3; this is not a separate capstone. | K3A |
| Y8.18 — Project: feedback-controlled robot | Complete a virtual mission using calibrated sensing and a state controller. | A recovery transition never returns to normal operation. | Complete an unseen mission with a new disturbance. | goal achieved; disturbance recovered; limitations evidenced | Prerequisite: Y8.17. Complete P-Y8-3: Feedback-controlled robot. | K3A, K3C, K3G, X-ROBOT, X-PORT |

### Product Studio

Project **P-Y8-4: Accessible community tool**. Workspace: web. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y8.19 — Write a user-centred brief | Convert a fictional community need into measurable requirements. | Requirements describe features without user benefit. | Specify a different user's tool. | needs explicit; constraints stated; acceptance checks measurable | Prerequisite: Y8.18. Add a saved, reviewable write a user-centred brief milestone to P-Y8-4; this is not a separate capstone. | K3G, K3H, X-SE |
| Y8.20 — Use private version control | Create, compare and restore named project versions. | A restore loses a later useful change. | Recover a different fictional edit sequence. | versions identifiable; intended change recovered; attribution retained | Prerequisite: Y8.19. Add a saved, reviewable use private version control milestone to P-Y8-4; this is not a separate capstone. | K3G, X-SE |
| Y8.21 — Review code constructively | Review a peer fixture using behaviour, clarity and respectful evidence. | A review approves code that fails its stated test. | Review an unseen change. | defect evidenced; feedback respectful; repair verifiable | Prerequisite: Y8.20. Add a saved, reviewable review code constructively milestone to P-Y8-4; this is not a separate capstone. | K3C, K3I, X-SE |
| Y8.22 — Defend identity and data | Apply least-privilege and secure-sharing choices in a local scenario. | A viewer is given edit access and a secret. | Repair another permission plan. | least privilege met; secrets absent; report route clear | Prerequisite: Y8.21. Add a saved, reviewable defend identity and data milestone to P-Y8-4; this is not a separate capstone. | K3I, X-SEC |
| Y8.23 — Test with users and devices | Interpret provided user-test records and retest a repair across widths. | A desktop fix breaks keyboard access on mobile. | Improve a new documented usability defect. | defect reproduced; repair works; regression checked | Prerequisite: Y8.22. Add a saved, reviewable test with users and devices milestone to P-Y8-4; this is not a separate capstone. | K3G, K3H |
| Y8.24 — Project: accessible community tool | Deliver a private interactive tool with tests, version history and user evidence. | A new feature regresses a previously passing task. | Complete an independent change request. | requirements met; regressions pass; user evidence documented | Prerequisite: Y8.23. Complete P-Y8-4: Accessible community tool. | K3C, K3G, K3H, K3I, X-SE, X-PORT |

## Year 9: Algorithms and Data

Pathway: **Programming and Web** (`programming-web`). Course ID: `algorithms-and-data`. Recommended core session length: 60 minutes; split or extend according to evidence.

### Algorithm Evaluation

Project **P-Y9-1: Algorithm investigation tool**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y9.01 — Choose data structures | Select lists or keyed records for stated operations. | A lookup design loses duplicate entries. | Choose structures for a new dataset. | operations supported; values preserved; choice justified | Prerequisite: Y8.24. Add a saved, reviewable choose data structures milestone to P-Y9-1; this is not a separate capstone. | K3C |
| Y9.02 — Search ordered data | Implement binary search and check its ordering precondition. | The search assumes unsorted input is valid. | Search unseen ordered and invalid datasets. | found correct; absent handled; precondition checked | Prerequisite: Y9.01. Add a saved, reviewable search ordered data milestone to P-Y9-1; this is not a separate capstone. | K3B, K3C |
| Y9.03 — Compare sorting strategies | Implement and compare two sorting strategies using trace counts. | A counter measures different operations in each strategy. | Compare fresh sorted, reversed and duplicate inputs. | outputs correct; measures comparable; conclusions justified | Prerequisite: Y9.02. Add a saved, reviewable compare sorting strategies milestone to P-Y9-1; this is not a separate capstone. | K3B, K3C |
| Y9.04 — Measure growth carefully | Compare operation counts as dataset size grows. | A single timing result is treated as universal proof. | Analyse a new count table. | counts correct; pattern described; claim limitations stated | Prerequisite: Y9.03. Add a saved, reviewable measure growth carefully milestone to P-Y9-1; this is not a separate capstone. | K3B |
| Y9.05 — Abstract a reusable algorithm | Separate an algorithm from input presentation and output display. | The search depends on a specific UI control. | Reuse a new algorithm in two contexts. | logic separated; both contexts pass; interface documented | Prerequisite: Y9.04. Add a saved, reviewable abstract a reusable algorithm milestone to P-Y9-1; this is not a separate capstone. | K3A, K3C |
| Y9.06 — Project: algorithm investigation tool | Build a tool that runs searches and sorts and explains measured behaviour. | An explanation claims a result not shown by the trace. | Investigate a fresh input family. | algorithms correct; comparison fair; evidence inspectable | Prerequisite: Y9.05. Complete P-Y9-1: Algorithm investigation tool. | K3A, K3B, K3C, X-PORT |

### Relational Data

Project **P-Y9-2: Searchable data application**. Workspace: sql. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y9.07 — Model records and relationships | Design related tables for synthetic records using stable keys. | Two different records share an unintended key. | Model a different small domain. | entities clear; keys unique; relationship justified | Prerequisite: Y9.06. Add a saved, reviewable model records and relationships milestone to P-Y9-2; this is not a separate capstone. | K3A, K3C |
| Y9.08 — Query with SQL | Write SELECT queries with filters and ordering in an isolated database. | An AND condition is replaced by OR. | Query a new fixture table. | result rows exact; order correct; empty result handled | Prerequisite: Y9.07. Add a saved, reviewable query with sql milestone to P-Y9-2; this is not a separate capstone. | K3C |
| Y9.09 — Aggregate and join | Combine related data and calculate grouped summaries. | A join duplicates values in a total. | Summarise a different related dataset. | join correct; totals verified; missing relation handled | Prerequisite: Y9.08. Add a saved, reviewable aggregate and join milestone to P-Y9-2; this is not a separate capstone. | K3C |
| Y9.10 — Validate stored data | Apply constraints and distinguish invalid data from missing data. | A duplicate record bypasses validation. | Define rules for a new dataset. | invalid rejected; valid retained; missing values explicit | Prerequisite: Y9.09. Add a saved, reviewable validate stored data milestone to P-Y9-2; this is not a separate capstone. | K3C, K3H |
| Y9.11 — Minimise and protect data | Design storage around fictional user needs and access boundaries. | Unnecessary personal fields are collected. | Repair a different synthetic data design. | fields minimised; roles limited; recovery plan stated | Prerequisite: Y9.10. Add a saved, reviewable minimise and protect data milestone to P-Y9-2; this is not a separate capstone. | K3I, X-SEC |
| Y9.12 — Project: searchable data application | Build a query interface over isolated synthetic data with valid and empty states. | A search displays another user's restricted fixture record. | Implement a fresh query requirement. | queries correct; access boundaries tested; feedback usable | Prerequisite: Y9.11. Complete P-Y9-2: Searchable data application. | K3C, K3G, K3H, K3I, X-PORT |

### Intelligent Systems

Project **P-Y9-3: Evaluated classifier**. Workspace: ai. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y9.13 — Rules versus trained models | Compare a deterministic classifier and a small trained classifier on identical examples. | The comparison uses different test examples. | Evaluate a new classification task. | same inputs used; predictions recorded; distinction explained | Prerequisite: Y9.12. Add a saved, reviewable rules versus trained models milestone to P-Y9-3; this is not a separate capstone. | K3A, K3B, X-AI |
| Y9.14 — Training and test separation | Split a synthetic dataset before fitting a model. | Test examples leak into training. | Create a fresh split with stable identifiers. | sets disjoint; split recorded; evaluation uses held-out data | Prerequisite: Y9.13. Add a saved, reviewable training and test separation milestone to P-Y9-3; this is not a separate capstone. | K3A, K3C, X-AI |
| Y9.15 — Evaluate errors and uncertainty | Count false positives and false negatives and identify uncertain cases. | Only successful predictions are reported. | Evaluate a different prediction table. | error counts correct; uncertainty visible; limits explained | Prerequisite: Y9.14. Add a saved, reviewable evaluate errors and uncertainty milestone to P-Y9-3; this is not a separate capstone. | K3B, K3H, X-AI |
| Y9.16 — Investigate data bias | Compare model performance across fictional groups without collecting sensitive learner data. | An overall score hides a weak subgroup. | Analyse a new synthetic imbalance. | group counts correct; disparity identified; remedy tested | Prerequisite: Y9.15. Add a saved, reviewable investigate data bias milestone to P-Y9-3; this is not a separate capstone. | K3A, K3H, K3I, X-AI |
| Y9.17 — Check generated code | Test an AI-generated code fixture against a specification and attack-like inert inputs. | A fluent explanation hides a failing boundary case. | Repair a different generated function independently. | tests independent of prose; fault reproduced; correction justified | Prerequisite: Y9.16. Add a saved, reviewable check generated code milestone to P-Y9-3; this is not a separate capstone. | K3C, K3H, K3I, X-AI, X-SEC |
| Y9.18 — Project: evaluated classifier | Deliver a small classifier with separate tests, error analysis and appropriate-use limits. | The interface presents a low-confidence result as certain. | Evaluate a fresh dataset and revise the interface. | test separation verified; errors reported; uncertainty communicated | Prerequisite: Y9.17. Complete P-Y9-3: Evaluated classifier. | K3A, K3C, K3G, K3H, K3I, X-AI, X-PORT |

### Team Software Studio

Project **P-Y9-4: Evidence-backed application**. Workspace: web. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y9.19 — Plan a team increment | Break a user brief into small testable tasks and dependencies. | Two tasks both assume the other is finished. | Plan a different fixture project. | dependencies acyclic; tasks testable; user value stated | Prerequisite: Y9.18. Add a saved, reviewable plan a team increment milestone to P-Y9-4; this is not a separate capstone. | K3A, K3G, X-SE |
| Y9.20 — Test modular interfaces | Write contract checks between application components. | Two modules disagree on missing-value representation. | Integrate a different pair of components. | contracts explicit; normal case passes; invalid boundary handled | Prerequisite: Y9.19. Add a saved, reviewable test modular interfaces milestone to P-Y9-4; this is not a separate capstone. | K3C, X-SE |
| Y9.21 — Resolve a version conflict | Merge two fictional edits while preserving intended behaviour. | A merge silently removes a validation rule. | Resolve a new controlled conflict. | both intentions preserved; tests pass; resolution explained | Prerequisite: Y9.20. Add a saved, reviewable resolve a version conflict milestone to P-Y9-4; this is not a separate capstone. | K3C, K3G, X-SE |
| Y9.22 — Evaluate security and usability | Prioritise fixes using a fictional threat model and user-test evidence. | A cosmetic change is prioritised over exposed data. | Triage a different issue set. | risk reasoned; user impact evidenced; critical fix verified | Prerequisite: Y9.21. Add a saved, reviewable evaluate security and usability milestone to P-Y9-4; this is not a separate capstone. | K3H, K3I, X-SEC |
| Y9.23 — Revise for a new audience | Repurpose an existing artifact while respecting licences and access limits. | A reused asset cannot be distributed to the new audience. | Adapt a different permitted artifact. | licence checked; audience needs met; trust claims reviewed | Prerequisite: Y9.22. Add a saved, reviewable revise for a new audience milestone to P-Y9-4; this is not a separate capstone. | K3H, K3I |
| Y9.24 — Project: evidence-backed application | Integrate code, synthetic data and media into a private application with a review record. | A feature passes alone but fails in integration. | Deliver an independent new user story. | user story passes; regression suite passes; evaluation supported | Prerequisite: Y9.23. Complete P-Y9-4: Evidence-backed application. | K3C, K3G, K3H, K3I, X-SE, X-PORT |

## Year 10: Applied Projects

Pathway: **Applied Computing** (`applied`). Course ID: `applied-projects`. Recommended core session length: 60 minutes; split or extend according to evidence.

### Testing a Program

Project **P-Y10-1: Tested service component**. Workspace: python. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y10.01 — Plan a test [retains plan-a-test] | Specify normal, boundary and erroneous inputs with expected outputs for a component. | Expected results merely copy the current program's output. | Plan tests for an unseen function contract. | cases justified; expectations independent; fault-revealing case present | Prerequisite: Y9.24. Add a saved, reviewable plan a test milestone to P-Y10-1; this is not a separate capstone. | K4C, X-SE |
| Y10.02 — Decompose requirements | Translate a user problem into components with explicit responsibilities. | A requirement has no accountable component. | Decompose a different bounded application. | needs traceable; interfaces stated; dependencies justified | Prerequisite: Y10.01. Add a saved, reviewable decompose requirements milestone to P-Y10-1; this is not a separate capstone. | K4A, K4C, X-SE |
| Y10.03 — Automate regression checks | Implement repeatable tests that detect a supplied regression. | A test passes without checking an output. | Test an unseen faulty component. | test fails before fix; passes after; meaningful assertion retained | Prerequisite: Y10.02. Add a saved, reviewable automate regression checks milestone to P-Y10-1; this is not a separate capstone. | K4C, X-SE |
| Y10.04 — Read and write virtual files | Persist structured data in a project-only virtual filesystem. | A malformed file silently overwrites good state. | Handle a fresh valid and corrupted file pair. | round-trip correct; corruption handled; valid state preserved | Prerequisite: Y10.03. Add a saved, reviewable read and write virtual files milestone to P-Y10-1; this is not a separate capstone. | K4B, K4C |
| Y10.05 — Document a reusable contract | Define input, output, errors and invariants for a software component. | The documented type differs from the implementation. | Implement a new function against a supplied contract. | contract accurate; tests cover errors; reuse demonstrated | Prerequisite: Y10.04. Add a saved, reviewable document a reusable contract milestone to P-Y10-1; this is not a separate capstone. | K4A, K4C, X-SE |
| Y10.06 — Project: tested service component | Deliver a reusable component with persistence, tests and clear failure behaviour. | A restart loses successfully saved records. | Meet an unseen change to the component contract. | normal cases pass; failures safe; documentation matches | Prerequisite: Y10.05. Complete P-Y10-1: Tested service component. | K4A, K4B, K4C, X-SE, X-PORT |

### Databases and APIs

Project **P-Y10-2: Inventory service**. Workspace: api. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y10.07 — Design relational data | Model entities, keys, relationships and constraints for an inventory domain. | A table duplicates facts inconsistently. | Model a different synthetic inventory domain. | keys stable; relationships correct; duplication justified or removed | Prerequisite: Y10.06. Add a saved, reviewable design relational data milestone to P-Y10-2; this is not a separate capstone. | K4B, K4C |
| Y10.08 — Query and update safely | Use parameterised SQL for reads and writes in an isolated database. | A query concatenates untrusted input. | Implement a different filter and update. | results correct; parameters bound; inert attack string stays data | Prerequisite: Y10.07. Add a saved, reviewable query and update safely milestone to P-Y10-2; this is not a separate capstone. | K4B, K4C, X-SEC |
| Y10.09 — Preserve invariants with transactions | Group related changes so failure cannot leave inconsistent state. | One half of a stock transfer commits alone. | Implement a new atomic transfer fixture. | success consistent; failure rolls back; invariant checked | Prerequisite: Y10.08. Add a saved, reviewable preserve invariants with transactions milestone to P-Y10-2; this is not a separate capstone. | K4C, X-SE |
| Y10.10 — Design an API | Specify endpoints, response shapes and error cases for a local fixture service. | An endpoint changes state during a read request. | Design a different resource contract. | method semantics justified; schema valid; errors explicit | Prerequisite: Y10.09. Add a saved, reviewable design an api milestone to P-Y10-2; this is not a separate capstone. | K4A, K4B, X-API |
| Y10.11 — Validate service boundaries | Check request and response data and enforce role permissions on the server model. | A hidden UI button is the only access control. | Repair another fixture endpoint. | valid request works; malformed rejected; wrong role denied | Prerequisite: Y10.10. Add a saved, reviewable validate service boundaries milestone to P-Y10-2; this is not a separate capstone. | K4C, K4D, X-API, X-SEC |
| Y10.12 — Project: inventory service | Build an isolated inventory API over synthetic relational data with contract tests. | Concurrent fixture requests create inconsistent stock. | Implement a fresh stock operation. | contract tests pass; transactions preserve stock; role checks enforced | Prerequisite: Y10.11. Complete P-Y10-2: Inventory service. | K4A, K4B, K4C, X-API, X-SE, X-PORT |

### Defensive Security

Project **P-Y10-3: Secure application revision**. Workspace: security. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y10.13 — Model threats defensively | Identify assets, entry points and permissions in an intentionally vulnerable local fixture. | A threat plan ignores a sensitive export. | Model a different inert fixture application. | assets identified; threats bounded; mitigations testable | Prerequisite: Y10.12. Add a saved, reviewable model threats defensively milestone to P-Y10-3; this is not a separate capstone. | K4D, X-SEC |
| Y10.14 — Identity and authentication | Distinguish identity proof, sessions and permissions using a local model. | A changed client role is accepted as authority. | Repair a new session-and-role scenario. | identity verified; client role ignored; expiry handled | Prerequisite: Y10.13. Add a saved, reviewable identity and authentication milestone to P-Y10-3; this is not a separate capstone. | K4D, X-SEC |
| Y10.15 — Authorise every action | Enforce object ownership and least privilege at each service operation. | A user can read a different fixture user's record. | Test a fresh cross-user operation. | owner allowed; non-owner denied; denial leaks no record | Prerequisite: Y10.14. Add a saved, reviewable authorise every action milestone to P-Y10-3; this is not a separate capstone. | K4C, K4D, X-SEC |
| Y10.16 — Protect secrets and personal data | Remove secrets from client artifacts and minimise synthetic personal fields. | A token appears in a shared log. | Repair a different fixture logging and storage plan. | secret absent; fields minimised; access constrained | Prerequisite: Y10.15. Add a saved, reviewable protect secrets and personal data milestone to P-Y10-3; this is not a separate capstone. | K4D, X-SEC |
| Y10.17 — Recover and report | Rehearse safe recovery and appropriate incident reporting using fictional evidence. | A recovery process republishes sensitive data. | Respond to a new inert incident scenario. | containment appropriate; valid data recovered; report minimal and clear | Prerequisite: Y10.16. Add a saved, reviewable recover and report milestone to P-Y10-3; this is not a separate capstone. | K4D, X-SEC |
| Y10.18 — Project: secure application revision | Improve a supplied local fixture and document verified defensive changes. | A fix protects one route but leaves an equivalent route exposed. | Secure a new bounded fixture feature. | threats addressed; positive and negative tests pass; residual risk stated | Prerequisite: Y10.17. Complete P-Y10-3: Secure application revision. | K4A, K4C, K4D, X-SEC, X-PORT |

### Engineering Studio

Project **P-Y10-4: Persistent inventory application**. Workspace: web. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y10.19 — Plan an engineering increment | Prioritise a bounded application milestone with acceptance criteria and effort estimates. | A dependency makes the milestone impossible to finish. | Plan a new realistic increment. | scope bounded; dependencies ordered; criteria measurable | Prerequisite: Y10.18. Add a saved, reviewable plan an engineering increment milestone to P-Y10-4; this is not a separate capstone. | K4A, K4C, X-SE |
| Y10.20 — Integrate interface and service | Connect a usable front end to a tested fixture API. | A service failure is displayed as a successful save. | Integrate a new operation and error state. | success truthful; failure visible; saved data consistent | Prerequisite: Y10.19. Add a saved, reviewable integrate interface and service milestone to P-Y10-4; this is not a separate capstone. | K4B, K4C, X-API |
| Y10.21 — Review code and dependencies | Review a fictional change and supplied dependency record for maintainability and trust. | A dependency introduces an unexplained permission need. | Review a different controlled change. | behaviour reviewed; provenance checked; concerns actionable | Prerequisite: Y10.20. Add a saved, reviewable review code and dependencies milestone to P-Y10-4; this is not a separate capstone. | K4A, K4D, X-SE, X-SEC |
| Y10.22 — Test accessibility and performance | Measure task completion and operation budgets against explicit requirements. | A faster version removes keyboard support. | Optimise a different bounded workflow. | access retained; measurements repeatable; budget met | Prerequisite: Y10.21. Add a saved, reviewable test accessibility and performance milestone to P-Y10-4; this is not a separate capstone. | K4B, K4C, X-SE |
| Y10.23 — Evaluate with evidence | Compare actual acceptance results with a user brief and document limits. | The evaluation claims untested features work. | Evaluate a different project evidence pack. | claims traceable; limitations honest; next change justified | Prerequisite: Y10.22. Add a saved, reviewable evaluate with evidence milestone to P-Y10-4; this is not a separate capstone. | K4A, K4C, X-PORT |
| Y10.24 — Project: persistent inventory application | Deliver a private application with database, API, recovery and a usable interface. | Restart or failure corrupts an accepted update. | Complete an unseen user change request. | persistence works; contracts and access tests pass; evidence portfolio matches | Prerequisite: Y10.23. Complete P-Y10-4: Persistent inventory application. | K4A, K4B, K4C, K4D, X-SE, X-API, X-PORT |

## Year 11: Reliable Applications

Pathway: **Applied Computing** (`applied`). Course ID: `reliable-applications`. Recommended core session length: 60 minutes; split or extend according to evidence.

### Architecture and Reliability

Project **P-Y11-1: Reliable service prototype**. Workspace: api. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y11.01 — Choose an architecture | Compare two bounded designs against change, reliability and access requirements. | A design adds a service without a justified need. | Choose an architecture for a fresh brief. | criteria explicit; alternatives compared; trade-off justified | Prerequisite: Y10.24. Add a saved, reviewable choose an architecture milestone to P-Y11-1; this is not a separate capstone. | K4A, K4C, X-SE |
| Y11.02 — Maintain API compatibility | Revise a fixture API while preserving documented clients. | A renamed field silently breaks an old client. | Design a compatible new response version. | old contract passes; new contract passes; migration explained | Prerequisite: Y11.01. Add a saved, reviewable maintain api compatibility milestone to P-Y11-1; this is not a separate capstone. | K4A, K4C, X-API |
| Y11.03 — Make repeated requests safe | Implement idempotent handling of duplicate fixture requests. | A retry creates a duplicate paid-like action in synthetic data. | Handle a new duplicate-request sequence. | one effect per key; repeated response consistent; invalid reuse rejected | Prerequisite: Y11.02. Add a saved, reviewable make repeated requests safe milestone to P-Y11-1; this is not a separate capstone. | K4C, X-SE, X-API |
| Y11.04 — Handle concurrent updates | Use revision checks or transactions to preserve a shared data invariant. | A stale writer overwrites a newer valid value. | Resolve a fresh two-writer schedule. | conflict detected; invariant preserved; user recovery clear | Prerequisite: Y11.03. Add a saved, reviewable handle concurrent updates milestone to P-Y11-1; this is not a separate capstone. | K4C, X-SE |
| Y11.05 — Observe and recover safely | Use redacted logs and reproducible failure cases to diagnose a service. | Logs expose a fixture secret or omit the failure reason. | Diagnose a new controlled failure. | useful event captured; secret absent; recovery verified | Prerequisite: Y11.04. Add a saved, reviewable observe and recover safely milestone to P-Y11-1; this is not a separate capstone. | K4C, K4D, X-SEC |
| Y11.06 — Project: reliable service prototype | Deliver a bounded service with compatible contracts, safe retries and conflict handling. | A retry after a conflict duplicates state. | Meet a new reliability change request. | contracts pass; duplicates safe; conflict recovery evidenced | Prerequisite: Y11.05. Complete P-Y11-1: Reliable service prototype. | K4A, K4C, X-SE, X-API, X-PORT |

### Data and AI Assurance

Project **P-Y11-2: Responsible intelligent feature**. Workspace: ai. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y11.07 — Evaluate data quality and lifecycle | Design validation, retention and deletion rules for synthetic data against stated needs. | A retention rule removes evidence still needed for the stated purpose. | Repair a new fictional lifecycle design. | rules justified; access scoped; lifecycle tests pass | Prerequisite: Y11.06. Add a saved, reviewable evaluate data quality and lifecycle milestone to P-Y11-2; this is not a separate capstone. | K4B, K4D, X-SEC |
| Y11.08 — Evaluate an AI feature | Choose metrics tied to a fictional user's risks and test on separate data. | A high average score hides consequential errors. | Evaluate an unseen prediction dataset. | metrics correct; data separation verified; risk limits stated | Prerequisite: Y11.07. Add a saved, reviewable evaluate an ai feature milestone to P-Y11-2; this is not a separate capstone. | K4A, K4C, X-AI |
| Y11.09 — Test robustness and fairness | Measure performance across synthetic groups and input shifts. | One group or shifted dataset is omitted from the report. | Analyse a new imbalance or shift fixture. | group results complete; shift effects measured; mitigation retested | Prerequisite: Y11.08. Add a saved, reviewable test robustness and fairness milestone to P-Y11-2; this is not a separate capstone. | K4C, K4D, X-AI |
| Y11.10 — Human judgement and uncertainty | Design an interface that communicates uncertainty and offers appropriate human review. | A low-confidence result automatically makes a consequential decision. | Redesign a different fictional decision workflow. | uncertainty visible; human review meaningful; unsafe automation blocked | Prerequisite: Y11.09. Add a saved, reviewable human judgement and uncertainty milestone to P-Y11-2; this is not a separate capstone. | K4D, X-AI |
| Y11.11 — Review generated code and provenance | Evaluate generated software against specification, tests and supplied licence evidence. | A generated dependency or attribution claim is fabricated. | Review an unseen generated change. | behaviour verified; provenance checked; unsupported claims rejected | Prerequisite: Y11.10. Add a saved, reviewable review generated code and provenance milestone to P-Y11-2; this is not a separate capstone. | K4A, K4D, X-AI, X-SE |
| Y11.12 — Project: responsible intelligent feature | Integrate an evaluated classifier into a bounded application with clear appropriate-use limits. | The application silently uses an untested model version. | Deliver an independently evaluated new model version. | version identified; held-out evaluation passes; limitations communicated | Prerequisite: Y11.11. Complete P-Y11-2: Responsible intelligent feature. | K4A, K4B, K4C, K4D, X-AI, X-PORT |

### Independent Capstone

Project **P-Y11-3: Portfolio application**. Workspace: web. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y11.13 — Scope an independent capstone | Define a meaningful user problem, exclusions and feasible evidence plan. | The proposal cannot be tested within its constraints. | Respond to a new constraint without a supplied solution. | user need clear; scope feasible; criteria measurable | Prerequisite: Y11.12. Add a saved, reviewable scope an independent capstone milestone to P-Y11-3; this is not a separate capstone. | K4A, K4C, X-SE |
| Y11.14 — Design and prototype | Create an architecture and usable prototype before full integration. | The prototype cannot perform the core user task. | Revise the design for a fresh user need. | core task demonstrated; design traceable; feedback incorporated | Prerequisite: Y11.13. Add a saved, reviewable design and prototype milestone to P-Y11-3; this is not a separate capstone. | K4B, K4C |
| Y11.15 — Build a tested increment | Implement a capstone slice spanning interface, logic and persistence. | Components pass alone but fail their shared contract. | Complete an unseen bounded integration task. | slice runs end to end; tests meaningful; saved data correct | Prerequisite: Y11.14. Add a saved, reviewable build a tested increment milestone to P-Y11-3; this is not a separate capstone. | K4A, K4C, X-SE |
| Y11.16 — Test security and accessibility | Run authorized defensive and accessibility checks on the learner's isolated project. | A hidden route bypasses ownership or keyboard access. | Repair a new independent defect fixture. | access denied correctly; keyboard tasks pass; no sensitive disclosure | Prerequisite: Y11.15. Add a saved, reviewable test security and accessibility milestone to P-Y11-3; this is not a separate capstone. | K4C, K4D, X-SEC |
| Y11.17 — Evaluate and refine | Use test results and user evidence to improve a capstone against its brief. | The report selects only favourable test outcomes. | Respond independently to a new change request. | all outcomes reported; change verified; limitations evidenced | Prerequisite: Y11.16. Add a saved, reviewable evaluate and refine milestone to P-Y11-3; this is not a separate capstone. | K4A, K4C, X-PORT |
| Y11.18 — Project: portfolio application | Deliver a working private application and explain design, tests and limitations. | A claimed feature cannot be demonstrated in the saved version. | Implement and defend an unseen bounded change. | user goals met; independence demonstrated; portfolio artifacts reproducible | Prerequisite: Y11.17. Complete P-Y11-3: Portfolio application. | K4A, K4B, K4C, K4D, X-SE, X-PORT |

### Professional Portfolio

Project **P-Y11-4: Maintained release and handover**. Workspace: portfolio. The first five lessons build saved components; the sixth integrates them.

| ID / lesson | Objective and practical challenge | Seeded fault to diagnose | Independent assessment variation | Essential checks | Prerequisite / project milestone | Alignment |
|---|---|---|---|---|---|---|
| Y11.19 — Respond to a changing threat | Review a fictional technology change and update privacy and reporting controls. | An old safety plan is assumed sufficient for a new risk. | Assess a new emerging-technology scenario. | new risk identified; controls revised; suitable reporting retained | Prerequisite: Y11.18. Add a saved, reviewable respond to a changing threat milestone to P-Y11-4; this is not a separate capstone. | K4D, X-SEC |
| Y11.20 — Maintain a working release | Plan and execute a reversible upgrade in an isolated release simulator. | An upgrade drops compatibility without warning. | Maintain a different controlled release. | backup valid; regression checks pass; rollback demonstrated | Prerequisite: Y11.19. Add a saved, reviewable maintain a working release milestone to P-Y11-4; this is not a separate capstone. | K4A, K4C, X-SE |
| Y11.21 — Communicate with digital media | Create an original demonstration combining screen recording, visuals and accessible explanations. | A demonstration conceals a limitation or omits alternatives. | Produce a new audience-specific demonstration. | claims accurate; media permitted; accessible alternative provided | Prerequisite: Y11.20. Add a saved, reviewable communicate with digital media milestone to P-Y11-4; this is not a separate capstone. | K4B, X-PORT |
| Y11.22 — Explain professional pathways | Compare computing roles and choose portfolio evidence relevant to a fictional role. | A claimed skill has no artifact demonstrating it. | Match a new role brief to actual evidence. | role needs identified; evidence linked; next learning goal justified | Prerequisite: Y11.21. Add a saved, reviewable explain professional pathways milestone to P-Y11-4; this is not a separate capstone. | K4A, X-PORT |
| Y11.23 — Handover and defend decisions | Write a reproducible handover and answer evidence-based design questions. | A new user cannot reproduce the documented setup. | Handover an unfamiliar component from a fresh brief. | setup reproducible; decisions evidenced; limitations clear | Prerequisite: Y11.22. Add a saved, reviewable handover and defend decisions milestone to P-Y11-4; this is not a separate capstone. | K4A, K4C, X-SE |
| Y11.24 — Project: maintained release and handover | Present a maintained application, original media demonstration and future learning plan. | The final portfolio points to stale or inaccessible artifacts. | Resolve an unseen maintenance request and update the portfolio. | release works; change independent; handover and evidence consistent | Prerequisite: Y11.23. Complete P-Y11-4: Maintained release and handover. | K4A, K4B, K4C, K4D, X-SE, X-PORT |

## Consolidation schedule for every year

| Block | Sessions | Evidence |
|---|---|---|
| After module 1 | 3 | Retrieval of earlier skills; repair of one identified misconception; independent project variation. |
| After module 2 | 3 | Mixed practice across both modules; accessibility/tool fluency support; transfer to a new context. |
| After module 3 | 3 | Delayed recall; debug an unfamiliar artifact; improve and retest a portfolio milestone. |
| After module 4 | 3 | Independent course review; portfolio explanation; practical placement or bridge into the next year. |

These 132 sessions are proposed scheduling capacity, not invented additional published lessons. More practice, bridges and extension projects are permitted whenever evidence warrants them.
