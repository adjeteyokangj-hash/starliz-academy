# StarLiz Coding curriculum — proposed inventory for review

Date: 2 November 2026. Status: proposal, not an implementation or publication claim.

This inventory expands the five existing Years 1–11 pathways into 66 lessons, six per year. Only Understanding Loops currently has a published practical learning journey. All other entries below require implementation, educational review and release verification before publication. The number of lessons is a proposed minimum sequence, not a claim of national-curriculum accreditation or GCSE exam-board coverage.

## Structure and delivery contract

Lab → Pathway → Course → Module → Lesson → Challenge → Project.

Each year is one course containing two three-lesson modules. Lessons 1–3 introduce and combine skills; lessons 4–6 extend, test and apply them. Every lesson contains Discover, Predict, Build together, Practise, Debug, Create and Review, adapted to its medium. A challenge is a practical problem within a lesson; a project is a saved creation with versions and assessable evidence, not a lesson-completion button.

Each lesson must supply a starter, executable demonstration, success rubric, at least one deliberately faulty example, reference solutions, negative cases, an equivalent independent task, an explanation rubric and parent-facing project evidence. Assisted success and independent mastery are different outcomes. AI teaching must use actual learner artifacts and execution results. Human support remains optional and administrator controlled.

Prerequisites run in table order within a year. Each later year assumes the prior year's project or a practical placement demonstration of equivalent skills. Learners retain their actual school year; placement changes their learning route, not their profile. Learners needing revision receive an accessible bridge rather than an unsupported placement into unpublished content.

## Foundations — Years 1–2

Runtime: visual instructions, directional movement, sequence playback and repeat blocks. Keyboard, touch and pointer interactions must be equivalent; reading support is available. No text programming is required.

| ID | Course / module | Lesson | Practical outcome and check |
|---|---|---|---|
| Y1.1 | First Instructions / Ordered actions | Give an instruction | Choose an unambiguous instruction and execute it; distinguish a command from a description. |
| Y1.2 | First Instructions / Ordered actions | Put steps in order | Assemble a route; predict the final square before execution. |
| Y1.3 | First Instructions / Ordered actions | Find the wrong step | Repair one incorrect direction; explain which step changed. |
| Y1.4 | First Instructions / Patterns and routes | Spot a repeated pattern | Identify and continue a movement pattern in executable blocks. |
| Y1.5 | First Instructions / Patterns and routes | Make a short repeat | Replace repeated moves with a repeat and compare execution. |
| Y1.6 | First Instructions / Patterns and routes | Project: deliver the parcel | Build a new route independently, replay it and explain its instructions. |
| Y2.1 | Stories in Steps / Planning | Plan before running | Turn a picture route into an ordered algorithm; compare prediction and result. |
| Y2.2 | Stories in Steps / Planning | Turn and move | Combine relative turns and movement; distinguish heading from position. |
| Y2.3 | Stories in Steps / Planning | Test the whole route | Locate and repair errors at the beginning, middle and end. |
| Y2.4 | Stories in Steps / Reusable patterns | Repeat a group of actions | Execute a two-action repeat; predict its movement trace. |
| Y2.5 | Stories in Steps / Reusable patterns | Two ways to the same goal | Compare valid programs and count instructions without assuming shortest means clearest. |
| Y2.6 | Stories in Steps / Reusable patterns | Project: an animated journey | Save a sequence with movement and scene changes; restart and replay it. |

## Block Coding — Years 3–4

Runtime: event-driven scene engine with sprites, movement, coordinates, conditions and bounded variables. The current loops grid is reused where suitable; it is not sufficient for the whole pathway.

| ID | Course / module | Lesson | Practical outcome and check |
|---|---|---|---|
| Y3.1 | Build Your First Games / Repeating actions | Start with an event | A character acts on a specified input, not before it; test multiple events. |
| Y3.2 | Build Your First Games / Repeating actions | Understanding Loops | Existing lesson: predict, build, debug and explain repeats; complete a fresh independent route. |
| Y3.3 | Build Your First Games / Repeating actions | Coordinates and position | Place and move sprites using coordinates; predict and verify positions. |
| Y3.4 | Build Your First Games / Decisions | Make a choice | Use a condition to select behavior; demonstrate both branches. |
| Y3.5 | Build Your First Games / Decisions | Detect a collision | Respond to contact and boundaries; test contact and non-contact cases. |
| Y3.6 | Build Your First Games / Decisions | Project: a playable maze | Build and run a maze with input, collision and a verifiable win condition. |
| Y4.1 | Interactive Worlds / State and events | Remember the score | Update a variable through play; reset state when restarting. |
| Y4.2 | Interactive Worlds / State and events | Send a message | Coordinate two sprites through events; prevent duplicate responses. |
| Y4.3 | Interactive Worlds / State and events | Loops inside loops | Predict nested execution and repair an incorrect repeat count. |
| Y4.4 | Interactive Worlds / Testing games | Time and lives | Implement bounded timers and lives; verify end and restart behavior. |
| Y4.5 | Interactive Worlds / Testing games | Test every branch | Write cases for win, loss and replay; repair a failing case. |
| Y4.6 | Interactive Worlds / Testing games | Project: interactive quiz game | Build questions, score, feedback and replay; independently demonstrate a new feature. |

## Blocks to Text — Years 5–6

Runtime: block/text correspondence, constrained Python execution and isolated HTML/CSS preview. Text must actually execute in its stated language. It must not be simulated by matching a few expected strings.

| ID | Course / module | Lesson | Practical outcome and check |
|---|---|---|---|
| Y5.1 | From Blocks to Text / Values and expressions | What is a variable? | Store and update a value; predict multiple states. |
| Y5.2 | From Blocks to Text / Values and expressions | Expressions and types | Compute expressions and distinguish text from numbers using execution. |
| Y5.3 | From Blocks to Text / Values and expressions | Read the text version | Translate a familiar block sequence into equivalent executable Python. |
| Y5.4 | From Blocks to Text / Reuse and decisions | Choose with if | Build a conditional program; test true, false and boundary cases. |
| Y5.5 | From Blocks to Text / Reuse and decisions | Name a useful function | Define and call a function with a parameter; test different inputs. |
| Y5.6 | From Blocks to Text / Reuse and decisions | Project: number challenge | Create a playable number program with input, feedback and tested decisions. |
| Y6.1 | Pages and Programs / Building a page | Structure with HTML | Create headings, paragraphs, lists and links in an isolated preview. |
| Y6.2 | Pages and Programs / Building a page | Style with CSS | Apply selectors, spacing and colour; explain the rendered changes. |
| Y6.3 | Pages and Programs / Building a page | Design for every screen | Build a responsive page and verify keyboard navigation and readable contrast. |
| Y6.4 | Pages and Programs / Reliable Python | Repeat with Python | Use bounded loops; predict output and repair an off-by-one error. |
| Y6.5 | Pages and Programs / Reliable Python | Debug with evidence | Read syntax/runtime errors and compare expected and actual output. |
| Y6.6 | Pages and Programs / Reliable Python | Project: calculator and portfolio | Save a working tested calculator and a page explaining its design and results. |

## Programming and Web — Years 7–9

Runtime: isolated Python and web execution, console output, deterministic test harness and safe fixture datasets. Learner code has no application cookies, production credentials, unrestricted network or server filesystem access. Execution has time, memory and output limits, with cancellation.

| ID | Course / module | Lesson | Practical outcome and check |
|---|---|---|---|
| Y7.1 | Programs and Pages / Python starts here | Your first Python program | Run a program; distinguish syntax, execution and output. |
| Y7.2 | Programs and Pages / Python starts here | Input and validation | Accept valid inputs and handle invalid values without crashing. |
| Y7.3 | Programs and Pages / Python starts here | Decisions and Boolean logic | Test combined conditions and boundary values. |
| Y7.4 | Programs and Pages / Collections and iteration | Lists and traversal | Store a collection, access elements and traverse safely. |
| Y7.5 | Programs and Pages / Collections and iteration | Functions and return values | Decompose repeated work and test function outputs. |
| Y7.6 | Programs and Pages / Collections and iteration | Project: revision quiz | Create a quiz with validated input, stored questions and accurate scoring. |
| Y8.1 | Interactive Web / Semantic interfaces | Structure an accessible page | Use semantic HTML, labels and meaningful navigation; verify with keyboard. |
| Y8.2 | Interactive Web / Semantic interfaces | Layout with CSS | Build a responsive layout; test narrow and wide viewports. |
| Y8.3 | Interactive Web / Semantic interfaces | JavaScript events | Respond to user input in the preview; verify event behavior. |
| Y8.4 | Interactive Web / State and validation | Update the DOM safely | Render state without executing learner-supplied markup as application code. |
| Y8.5 | Interactive Web / State and validation | Validate and explain errors | Implement accessible form feedback; test invalid and valid input. |
| Y8.6 | Interactive Web / State and validation | Project: interactive revision site | Build a responsive site with state, interactions and a saved test record. |
| Y9.1 | Algorithms and Data / Working with data | Read a structured dataset | Parse a provided dataset and handle missing or malformed values. |
| Y9.2 | Algorithms and Data / Working with data | Dictionaries and records | Model records and update them through validated operations. |
| Y9.3 | Algorithms and Data / Working with data | Search systematically | Implement linear search and explain its trace on found and absent cases. |
| Y9.4 | Algorithms and Data / Evaluating algorithms | Sort and compare | Execute a sorting algorithm and inspect intermediate states. |
| Y9.5 | Algorithms and Data / Evaluating algorithms | Measure and test | Compare operation counts across inputs; avoid unsupported timing claims. |
| Y9.6 | Algorithms and Data / Evaluating algorithms | Project: data explorer | Filter, summarise and present a fixture dataset with repeatable tests. |

## Applied Computing — Years 10–11

Runtime: isolated programming environment with virtual files and an isolated relational database. All files and database records belong to the learner project sandbox; there is no access to StarLiz production data. Exam-board alignment, if desired, needs a separate approved mapping.

| ID | Course / module | Lesson | Practical outcome and check |
|---|---|---|---|
| Y10.1 | Applied Projects / Testing a program | Plan a test | Specify normal, boundary and erroneous cases with expected outputs. |
| Y10.2 | Applied Projects / Testing a program | Decompose requirements | Break a practical brief into functions with clear contracts. |
| Y10.3 | Applied Projects / Testing a program | Search ordered data | Implement binary search; test prerequisites, missing values and empty data. |
| Y10.4 | Applied Projects / Persistence and reliability | Compare sorting strategies | Implement and trace two strategies; compare operation counts. |
| Y10.5 | Applied Projects / Persistence and reliability | Read and write virtual files | Save and restore structured data; handle missing and invalid files. |
| Y10.6 | Applied Projects / Persistence and reliability | Project: inventory simulator | Create validated inventory operations, persistence and an executable test suite. |
| Y11.1 | Reliable Applications / Data and security | Model a relational database | Create related tables with keys and constraints in an isolated database. |
| Y11.2 | Reliable Applications / Data and security | Query with SQL | Write filtering, aggregation and joins; verify exact result sets. |
| Y11.3 | Reliable Applications / Data and security | Secure input and access | Demonstrate parameterized queries and authorization using safe fixtures. |
| Y11.4 | Reliable Applications / Delivery and evaluation | Recover from failure | Handle errors, preserve valid data and test recovery paths. |
| Y11.5 | Reliable Applications / Delivery and evaluation | Evaluate against a brief | Run acceptance tests, document limitations and improve one measured weakness. |
| Y11.6 | Reliable Applications / Delivery and evaluation | Project: portfolio application | Deliver a working application with persistence, tests, accessible UI and an independent change request. |

## Placement and completion

Placement samples practical evidence at each pathway boundary: ordered instructions; events/loops/conditions; values/functions and basic text; multi-function programs and interactive web; testing/persistence/data. Multiple-choice knowledge alone cannot certify practical placement. The learner can request a bridge, repeat placement or demonstrate a higher level without rewriting their school year.

A lesson certificate names its actual skills and lesson. Course and pathway certificates require every required lesson plus the relevant project rubric; awards are idempotent. Existing lesson rewards do not imply that a pathway has been completed. Projects remain private, with protected parent replay and teacher inspection.

## Publication and verification gates

1. Educational review confirms objective, prerequisite, reading level, inclusivity and suitable challenge.
2. Every reference solution passes the actual engine; negative examples fail for the expected reason.
3. Stage progression, attempts, hints and mastery are enforced by the server. A disclosed independent answer requires an unseen equivalent challenge; restoration alone cannot grant independence.
4. Save/reload, version recovery, concurrent editing and interrupted requests preserve valid work.
5. Model failure falls back to useful guidance. Assessment and rewards never depend on unverified model prose.
6. Administrator assistance disabled/enabled, no available tutor, invalid classroom, expired booking, wrong subject, cross-child access, consent withdrawal and subscription/licence denial are tested.
7. A full learner journey and protected parent preview pass browser checks on desktop, tablet and mobile, including keyboard operation, focus, status announcements and reduced-motion behavior.
8. Migration status, application build and deployment readiness are evidenced separately. No reset, existing-data deletion, commit, push or deployment is part of curriculum approval.

Review decisions: accept or revise lesson inventory, depth and sequence; select any exam-board alignment; approve the required Python/web/database runtime approach before those lessons are published. The 13-lab target is outside this Coding inventory and remains a separate user decision.
