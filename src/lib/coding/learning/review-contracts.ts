/** Authored objective/variation contracts for this Review pass. Changing an
 * objective or transfer brief requires re-authoring its Review assignment.
 * This is assessment content, not a publication approval or mastery receipt. */
export const reviewContracts: Record<string, { contentHash: string; objective: string; workbench: string; essentialChecks: string[]; variants: Array<{id: string; task: string}> }> = {
  "Y2.01": {
    "contentHash": "440d0f807433bf104ace242e496aeb83dfb191d1f08e9d03ff87e9d6ade73fd4",
    "objective": "Represent a picture route as an algorithm and predict the endpoint.",
    "workbench": "robot",
    "essentialChecks": [
      "plan recorded first",
      "endpoint correct",
      "changes explained"
    ],
    "variants": [
      {
        "id": "Y2.01-transfer-1",
        "task": "Before coding, record this new plan: up, right, up, right. Then build its separate program and compare the full trail with the plan."
      },
      {
        "id": "Y2.01-transfer-2",
        "task": "Plan a new delivery before coding: right, right, up, left. Record that plan in the empty coding workspace, build it and inspect every stop."
      }
    ]
  },
  "Y2.02": {
    "contentHash": "3956aed777de8c02922c578f335c6ac9680cd3abda3af2f90ad2704333847f11",
    "objective": "Control a character using heading and forward movement.",
    "workbench": "robot",
    "essentialChecks": [
      "heading tracked",
      "turns correct",
      "route completes"
    ],
    "variants": [
      {
        "id": "Y2.02-transfer-1",
        "task": "Start facing up. Move forward once, turn right once and move forward twice. Inspect the up, right, right trail and finish facing right."
      },
      {
        "id": "Y2.02-transfer-2",
        "task": "Start facing down. Move forward once, turn left once and move forward twice. Inspect the down, right, right trail and finish facing right."
      }
    ]
  },
  "Y2.03": {
    "contentHash": "879a3151ae23185201fcc842476ecf05db448e4f94445c867f857815c1db509a",
    "objective": "Run cases that reveal faults at the beginning, middle and end.",
    "workbench": "robot",
    "essentialChecks": [
      "trace used",
      "fault isolated",
      "corrected sequence passes"
    ],
    "variants": [
      {
        "id": "Y2.03-transfer-1",
        "task": "Repair this unfamiliar route to follow up, right, down, right. Check its first, middle and final squares; matching only the endpoint is insufficient."
      },
      {
        "id": "Y2.03-transfer-2",
        "task": "Repair this new route to follow right, up, left, up, right. Use the trail to find the misplaced middle arrow and retest every stop."
      }
    ]
  },
  "Y2.04": {
    "contentHash": "40585169601fae1001c4f7998fb781262384cfda80818d15578a6f63fba5a58d",
    "objective": "Replace a repeated two-command section without changing the route.",
    "workbench": "robot",
    "essentialChecks": [
      "behaviour preserved",
      "repetition used",
      "trace predicted"
    ],
    "variants": [
      {
        "id": "Y2.04-transfer-1",
        "task": "Start facing up. Repeat forward one, turn right three times. Preserve the up, right, down trail and finish facing left; keep both commands inside the group."
      },
      {
        "id": "Y2.04-transfer-2",
        "task": "Start facing left. Repeat forward one, turn left three times. Preserve the left, down, right trail and finish facing up."
      }
    ]
  },
  "Y2.05": {
    "contentHash": "108b2564e5eff86a5d40f652d31a77ccbf53aa11b8111a7897b1a22863991606",
    "objective": "Use a large button to start a planned robot route.",
    "workbench": "robot",
    "essentialChecks": [
      "waits for input",
      "starts once",
      "resets correctly"
    ],
    "variants": [
      {
        "id": "Y2.05-transfer-1",
        "task": "Connect the water button to up, right, up. Keep start empty, demonstrate that the robot waits before input and verify Restart play."
      },
      {
        "id": "Y2.05-transfer-2",
        "task": "Connect the collect button to right, right, down. The robot must wait before the button press and return to waiting after a restart."
      }
    ]
  },
  "Y2.06": {
    "contentHash": "cc6a416d2c47740d9fc8639b544fdacc2d7985e8669f632b014fe5d63df39f53",
    "objective": "Program two delivery routes and explain how input selects one.",
    "workbench": "robot",
    "essentialChecks": [
      "correct input selects route",
      "destinations reached",
      "restart works"
    ],
    "variants": [
      {
        "id": "Y2.06-transfer-1",
        "task": "Meet a new map brief: red selects up, right, right; blue selects right, down, right. Keep start empty, test both destinations and restart between them. Save, retrieve and replay your project."
      },
      {
        "id": "Y2.06-transfer-2",
        "task": "Meet another two-destination brief: red selects right, right, up, left; blue selects up, right, down, right. Test waiting, both buttons and restart, then save, retrieve and replay the program."
      }
    ]
  },
  "Y2.07": {
    "contentHash": "56c6cd60a0abdd7c06c27ca3b0e55b88089ea62f00b21611a4b08b0b911502ef",
    "objective": "Make a sprite respond to a start event.",
    "workbench": "scene",
    "essentialChecks": [
      "one start per event",
      "predictable order",
      "restart works"
    ],
    "variants": [
      {
        "id": "Y2.07-transfer-1",
        "task": "Make a new sprite say Here and move up once when the scene starts. Test both Run and restart."
      },
      {
        "id": "Y2.07-transfer-2",
        "task": "Make another starting scene say Hello and move left once. The actions must belong to start, not an unrelated button."
      }
    ]
  },
  "Y2.08": {
    "contentHash": "dc40f421f0fa925ccbe609d63f3aecebe235e9bb1ff67ddf7d5a26cbc716bbea",
    "objective": "Order two speech bubbles and movements in a story.",
    "workbench": "scene",
    "essentialChecks": [
      "actions ordered",
      "dialogue readable",
      "trace matches plan"
    ],
    "variants": [
      {
        "id": "Y2.08-transfer-1",
        "task": "Create a bridge story: say Ready, move up, move right, then say At the bridge. Match each bubble to its actual position."
      },
      {
        "id": "Y2.08-transfer-2",
        "task": "Create a pond story: say Set off, move right twice, move down once, then say At the pond. Inspect the combined speech-and-movement replay."
      }
    ]
  },
  "Y2.09": {
    "contentHash": "baaaf8a1df4c12462728992a854619e70508922f90a9c0c34bd20a9d877e2b13",
    "objective": "Use a grouped repeat for a character's dance.",
    "workbench": "scene",
    "essentialChecks": [
      "group repeats",
      "count correct",
      "animation returns safely"
    ],
    "variants": [
      {
        "id": "Y2.09-transfer-1",
        "task": "Say Ready to dance, repeat the whole up, right, down, left group 3 times, then say Back at home. Keep opening and closing speech outside the repeated group, and verify the actual complete trail."
      },
      {
        "id": "Y2.09-transfer-2",
        "task": "Say Wide dance begins, repeat the whole right, right, up, left, left, down group 2 times, then say Wide dance finished. Keep opening and closing speech outside the repeated group, and verify the actual complete trail."
      }
    ]
  },
  "Y2.10": {
    "contentHash": "a124199a814e30b870fad9084c884fca4a1f4d653ad6b497e0bb14d507067e61",
    "objective": "Compare programs by behaviour and clarity.",
    "workbench": "scene",
    "essentialChecks": [
      "both outcomes checked",
      "change identified",
      "preference justified"
    ],
    "variants": [
      {
        "id": "Y2.10-transfer-1",
        "task": "Keep Program A's expanded baseline. Make Program B shorter while meeting this exact brief: Say Ready to dance, repeat the whole up, right, down, left group 3 times, then say Back at home. Compare both complete traces and the number of written commands."
      },
      {
        "id": "Y2.10-transfer-2",
        "task": "Keep Program A's expanded baseline. Make Program B shorter while meeting this exact brief: Say Wide dance begins, repeat the whole right, right, up, left, left, down group 2 times, then say Wide dance finished. Compare both complete traces and the number of written commands."
      }
    ]
  },
  "Y2.11": {
    "contentHash": "ab262649bee5419a1f5d2673b292ebd28d107293f9e5af6d34110364f0a13e7d",
    "objective": "Find a story error using event and action order.",
    "workbench": "scene",
    "essentialChecks": [
      "event identified",
      "scene corrected",
      "other event preserved"
    ],
    "variants": [
      {
        "id": "Y2.11-transfer-1",
        "task": "Repair go's pond story so it waits for input and says At the pond after right, right, down, rather than before travelling."
      },
      {
        "id": "Y2.11-transfer-2",
        "task": "Repair a different trigger fault: go must start Say Starting, right, up, Say Arrived. The scene must remain still before go is pressed."
      }
    ]
  },
  "Y2.12": {
    "contentHash": "bbb602c5712aacfb6c99747cf27d656a69d987d3fea8d8fc10430697cc30792d",
    "objective": "Build a two-scene interactive story with a repeat and restart.",
    "workbench": "scene",
    "essentialChecks": [
      "events work",
      "sequence coherent",
      "restart clears old state"
    ],
    "variants": [
      {
        "id": "Y2.12-transfer-1",
        "task": "Create a fresh two-scene journey. first selects flower: Say Ready to dance, repeat the whole up, right, down, left group 3 times, then say Back at home. next selects robot: Say Robot climbs, repeat the whole up, right group 2 times, then say Robot arrives. Keep both start events empty. Verify input order and restart, then save, retrieve and replay both scenes."
      },
      {
        "id": "Y2.12-transfer-2",
        "task": "Create a fresh two-scene journey. first selects robot: Say Wide dance begins, repeat the whole right, right, up, left, left, down group 2 times, then say Wide dance finished. next selects flower: Say A short climb, repeat the whole right, up group 1 times, then say At the lookout. Keep both start events empty. Verify input order and restart, then save, retrieve and replay both scenes."
      }
    ]
  },
  "Y2.13": {
    "contentHash": "797d0e2cf26d1f72b9f381dc6268e55f158a358c044ae3d1a0bc10505a87bd88",
    "objective": "Choose a question with countable picture responses.",
    "workbench": "data",
    "essentialChecks": [
      "question clear",
      "options distinct",
      "responses recordable"
    ],
    "variants": [
      {
        "id": "Y2.13-transfer-1",
        "task": "Write this single-choice question: Which fruit picture do you choose? Offer exactly these distinct options: apple, pear, plum. Check that every supplied response can be counted."
      },
      {
        "id": "Y2.13-transfer-2",
        "task": "Write this single-choice question: Which travel picture do you choose? Offer exactly these distinct options: walk, cycle, bus. Check that every supplied response can be counted."
      }
    ]
  },
  "Y2.14": {
    "contentHash": "71dffe495e65a1cd40df172aace0bb31b791ac5f2d5bc5b3409ef8825395193e",
    "objective": "Record a small fictional survey in a pictogram tool.",
    "workbench": "data",
    "essentialChecks": [
      "each response counted once",
      "categories correct",
      "total correct"
    ],
    "variants": [
      {
        "id": "Y2.14-transfer-1",
        "task": "Record all 6 supplied fictional fruit responses exactly once, including their identifiers. Use your recorded table, group by fruit and check the resulting pictogram."
      },
      {
        "id": "Y2.14-transfer-2",
        "task": "Record all 6 supplied fictional travel responses exactly once, including their identifiers. Use your recorded table, group by travel and check the resulting pictogram."
      }
    ]
  },
  "Y2.15": {
    "contentHash": "5d5db181fa91f32627dc6cad593825b964c4ba3769471a55ce37cd17d3c80ca8",
    "objective": "Organise saved objects by two simple attributes.",
    "workbench": "data",
    "essentialChecks": [
      "groups consistent",
      "requested item found",
      "reason explained"
    ],
    "variants": [
      {
        "id": "Y2.15-transfer-1",
        "task": "Find only blue circles in the supplied saved-object table. Apply both attribute filters and sort the identifiers; explain why a blue rectangle is excluded."
      },
      {
        "id": "Y2.15-transfer-2",
        "task": "Find only red rectangles. Filter both colour and shape, sort identifiers and check the actual found object rather than only the question title."
      }
    ]
  },
  "Y2.16": {
    "contentHash": "c145317057472a9732d1090b76feb4bd4bcc3af41eb8d799f1117366f72a3a53",
    "objective": "Generate a chart from counted responses.",
    "workbench": "data",
    "essentialChecks": [
      "labels correct",
      "counts match",
      "display readable"
    ],
    "variants": [
      {
        "id": "Y2.16-transfer-1",
        "task": "Generate the Fruit pictures pictogram from actual grouped observations. Label with category, count the symbols using count, begin at zero and retain a readable alternative."
      },
      {
        "id": "Y2.16-transfer-2",
        "task": "Generate the Travel pictures pictogram from actual grouped observations. Label with category, count the symbols using count, begin at zero and retain a readable alternative."
      }
    ]
  },
  "Y2.17": {
    "contentHash": "e47dc079c9e895035fe9b70af21c922a4cdf2d74e174e5573eeec18d69fb8376",
    "objective": "Compare a statement with a supplied chart.",
    "workbench": "data",
    "essentialChecks": [
      "evidence located",
      "correct conclusion selected",
      "uncertainty noted"
    ],
    "variants": [
      {
        "id": "Y2.17-transfer-1",
        "task": "Inspect the actual Fruit pictures display. Choose the supplied statement that names its largest group and count while limiting the conclusion to this fictional survey."
      },
      {
        "id": "Y2.17-transfer-2",
        "task": "Inspect the actual Travel pictures display. Choose the supplied statement that names its largest group and count while limiting the conclusion to this fictional survey."
      }
    ]
  },
  "Y2.18": {
    "contentHash": "6281a517b120c4abb405069afc316b15f280d6fdad17d26af487653f35982b4d",
    "objective": "Combine a question, pictogram and spoken or written conclusion.",
    "workbench": "data",
    "essentialChecks": [
      "counts accurate",
      "conclusion supported",
      "saved display retrieves"
    ],
    "variants": [
      {
        "id": "Y2.18-transfer-1",
        "task": "Build a new Fruit pictures project: state Which fruit picture do you choose?, record every supplied response once, generate a labelled pictogram, select its supported limited conclusion, then save, retrieve and recalculate the actual project."
      },
      {
        "id": "Y2.18-transfer-2",
        "task": "Build a new Travel pictures project: state Which travel picture do you choose?, record every supplied response once, generate a labelled pictogram, select its supported limited conclusion, then save, retrieve and recalculate the actual project."
      }
    ]
  },
  "Y2.19": {
    "contentHash": "16c6bd27c2643c1daf4d86ad8918802e7f1e36afd472326dc67c2880966a5050",
    "objective": "Operate simulated inputs and outputs in everyday devices.",
    "workbench": "scenario",
    "essentialChecks": [
      "input identified",
      "output demonstrated",
      "purpose explained"
    ],
    "variants": [
      {
        "id": "Y2.19-transfer-1",
        "task": "Build a fictional garden helper: use a sensor to measure the distance and a speaker to play the visitor words. Explain the input and output."
      },
      {
        "id": "Y2.19-transfer-2",
        "task": "Build a fictional museum helper: a scanner reads the supplied picture and a speaker plays the visitor words. Explain how these jobs differ."
      }
    ]
  },
  "Y2.20": {
    "contentHash": "7d430ae88f6283380ac85327c739578d4f084c48625df75bfed75abb440f1316",
    "objective": "Save versions and find the intended story or data file.",
    "workbench": "scenario",
    "essentialChecks": [
      "correct version found",
      "naming usable",
      "original retained"
    ],
    "variants": [
      {
        "id": "Y2.20-transfer-1",
        "task": "Retrieve garden-ready, check its caption and two-step route, then save, restore and replay your own working copy without removing the draft source."
      },
      {
        "id": "Y2.20-transfer-2",
        "task": "Find museum-ready rather than museum-draft. Inspect its actual restored content, then save, restore and replay your working copy."
      }
    ]
  },
  "Y2.21": {
    "contentHash": "cb60ecaea63874b8fbbce7747e26d49f640a8e3f2ebe6fe25f610488e787ae20",
    "objective": "Choose when permission or credit is needed in a media scenario.",
    "workbench": "scenario",
    "essentialChecks": [
      "creator acknowledged",
      "permission choice justified",
      "original preserved"
    ],
    "variants": [
      {
        "id": "Y2.21-transfer-1",
        "task": "Ash has allowed the provided picture to be used with a credit. Choose it and acknowledge Ash as its creator."
      },
      {
        "id": "Y2.21-transfer-2",
        "task": "Willow has not given permission. Choose your own original picture and add a short original robot scene. A request alone is not permission."
      }
    ]
  },
  "Y2.22": {
    "contentHash": "84374ec15c47b275baf27dce0ec53c793bcbee683f2d21f1a122f1a7b295f19e",
    "objective": "Reject an inappropriate fictional request for details.",
    "workbench": "scenario",
    "essentialChecks": [
      "private details withheld",
      "contact stopped",
      "trusted adult selected"
    ],
    "variants": [
      {
        "id": "Y2.22-transfer-1",
        "task": "A fictional picture message asks where a character lives. Withhold private details, stop contact and ask a trusted adult."
      },
      {
        "id": "Y2.22-transfer-2",
        "task": "An unfamiliar fictional club message asks for a password to award a prize. Remove the unsafe response and choose stopping contact and trusted adult help."
      }
    ]
  },
  "Y2.23": {
    "contentHash": "3dc9b52c4fada490eb2ea391f981ad7829d67552fe08c0c3f12fa7614f518f0d",
    "objective": "Use a simulated report tool to describe a fictional concern.",
    "workbench": "scenario",
    "essentialChecks": [
      "concern clear",
      "appropriate help route chosen",
      "no sensitive data added"
    ],
    "variants": [
      {
        "id": "Y2.23-transfer-1",
        "task": "Use the matching report category and the clear word-bank description for an unknown fictional message asking for details. Include stopping contact and trusted adult help."
      },
      {
        "id": "Y2.23-transfer-2",
        "task": "Describe repeated unkind behaviour by a fictional player using the matching report category. Keep identifying details out and choose trusted adult help."
      }
    ]
  },
  "Y2.24": {
    "contentHash": "cf767f621eb483821fae6059ba191a0d62876d443eaed6bede8c1c341583269f",
    "objective": "Create a safe guide combining a device demonstration, picture and help advice.",
    "workbench": "scenario",
    "essentialChecks": [
      "device purpose correct",
      "media organised",
      "help advice safe"
    ],
    "variants": [
      {
        "id": "Y2.24-transfer-1",
        "task": "Build a private Garden guide: flower welcome picture, tree help-point picture, sensor then speaker demonstration. Follow both route captions and add safe trusted-adult help. Save, restore and replay it."
      },
      {
        "id": "Y2.24-transfer-2",
        "task": "Build a private Museum guide: robot welcome picture, tree help-point picture, scanner then speaker demonstration. Check the scene names, routes and safe help choices, then save, restore and replay."
      }
    ]
  },
  "C-Y2-1-1": {
    "contentHash": "c9525f3fbbc4bfa3d9df0d856d8dd54d927a87c4fe82266d65716229a43ed8c8",
    "objective": "Retrieve the distinction between a robot's heading, a turn and a forward move in a new route.",
    "workbench": "robot",
    "essentialChecks": [
      "Turns change heading without adding a visit",
      "Forward follows the current heading",
      "Both starting maps produce the complete route"
    ],
    "variants": [
      {
        "id": "C-Y2-1-1-transfer-1",
        "task": "Start facing down, move forward twice, turn left and move forward once. Check the full trail and finish facing right."
      },
      {
        "id": "C-Y2-1-1-transfer-2",
        "task": "Start facing up, move forward three times, turn right and move forward once. Check that the last step goes right."
      }
    ]
  },
  "C-Y2-1-2": {
    "contentHash": "17010eb00b07327a52e9cc0054151838e0dadd3f290e9b6f7b94e01654c3a70b",
    "objective": "Diagnose a new route whose endpoint is correct but whose early collection stop is missed.",
    "workbench": "robot",
    "essentialChecks": [
      "The first differing move is repaired",
      "All collection stops occur in order",
      "A changed starting map is retested"
    ],
    "variants": [
      {
        "id": "C-Y2-1-2-transfer-1",
        "task": "Repair a new route to visit up, right, down, right, up in exactly that order. Its current first pair is swapped; verify the first and middle stops."
      },
      {
        "id": "C-Y2-1-2-transfer-2",
        "task": "Repair another route to follow right, right, up, left, up. A wrong middle pair can hide behind the same endpoint. Retest both maps."
      }
    ]
  },
  "C-Y2-1-3": {
    "contentHash": "8a4de3003a6c82a6888c49ac3b5f35273f1948504055207851e0e2db3f522846",
    "objective": "Replace an expanded route with a repeated unit while preserving waiting, input and restart behaviour.",
    "workbench": "robot",
    "essentialChecks": [
      "The robot waits before input",
      "The full repeated unit preserves every stop",
      "Restart returns to waiting"
    ],
    "variants": [
      {
        "id": "C-Y2-1-3-transfer-1",
        "task": "Improve the water button: repeat up, right twice, keep start empty and verify waiting, the whole trail and restart."
      },
      {
        "id": "C-Y2-1-3-transfer-2",
        "task": "Improve the return button: repeat right, down twice. The robot must wait until return is pressed and wait again after restart."
      }
    ]
  },
  "P-Y2-1": {
    "contentHash": "44143909b7642a2287c8e9539fbc917f583bf1ade9ce739103b0da761da442d8",
    "objective": "Build and preserve a two-destination delivery map with repeated movement, heading-dependent turns, separate inputs and reliable restart.",
    "workbench": "robot",
    "essentialChecks": [
      "Both inputs select their own full route",
      "Red uses a repeated unit and blue uses heading",
      "Waiting and restart work independently",
      "The saved version is restored and replayed"
    ],
    "variants": [
      {
        "id": "P-Y2-1-transfer-1",
        "task": "Build a new independently assessed map. Orchard: red repeats up, right 3 times; blue follows up, up, right using Forward and Turn, finishing facing right. Start stays empty. Test waiting, each button and red-restart-blue, then save, restore and replay."
      },
      {
        "id": "P-Y2-1-transfer-2",
        "task": "Build a new independently assessed map. Harbour: red repeats right, down 2 times; blue follows right, up, up using Forward and Turn, finishing facing up. Start stays empty. Test waiting, each button and red-restart-blue, then save, restore and replay."
      }
    ]
  },
  "C-Y2-2-1": {
    "contentHash": "c500f8db55e54af93c2410487360b9a8f5d4e14b9c947a89c978f369a48d343f",
    "objective": "Reconstruct a new start-triggered story with speech at its actual opening and arrival positions.",
    "workbench": "scene",
    "essentialChecks": [
      "Start triggers the intended story",
      "Opening precedes movement and arrival follows it",
      "Restart replays without retaining old speech"
    ],
    "variants": [
      {
        "id": "C-Y2-2-1-transfer-1",
        "task": "Say Garden opens, move up then right twice, then say Seeds ready. Put the actions under start and verify both the first run and restart."
      },
      {
        "id": "C-Y2-2-1-transfer-2",
        "task": "Say Boat leaves, move right then down twice, then say At the island. Put the actions under start and verify both the first run and restart."
      }
    ]
  },
  "C-Y2-2-2": {
    "contentHash": "dcd8553513b2f15fa0af4aae6b77b7b3fb7b56e9b94726514bb7e30d1b87b3b5",
    "objective": "Diagnose a new story that runs before its input and prove that restart returns it to waiting.",
    "workbench": "scene",
    "essentialChecks": [
      "No story action occurs before input",
      "The requested button selects the complete story",
      "Restart clears the story and waits"
    ],
    "variants": [
      {
        "id": "C-Y2-2-2-transfer-1",
        "task": "Say Garden opens, move up then right twice, then say Seeds ready. Repair the trigger so the story waits for plant; verify waiting, the selected input and restart."
      },
      {
        "id": "C-Y2-2-2-transfer-2",
        "task": "Say Boat leaves, move right then down twice, then say At the island. Repair the trigger so the story waits for sail; verify waiting, the selected input and restart."
      }
    ]
  },
  "C-Y2-2-3": {
    "contentHash": "f3bcab6e8487b6767eb32338c913318b03d831e807a8410920a1325d7f4643ab",
    "objective": "Shorten an expanded story using one repeated unit and demonstrate equivalent movement and speech timing.",
    "workbench": "scene",
    "essentialChecks": [
      "Both actual programs preserve the requested full timeline",
      "The improved version uses fewer written commands",
      "The whole repeated unit remains inside the group"
    ],
    "variants": [
      {
        "id": "C-Y2-2-3-transfer-1",
        "task": "Improve Program B: say Parade begins, repeat up, right, down, left 2 times, then say Parade returns. Preserve Program A and compare both complete timelines."
      },
      {
        "id": "C-Y2-2-3-transfer-2",
        "task": "Improve Program B: say Climb begins, repeat right, up 3 times, then say At the top. Preserve Program A and compare both complete timelines."
      }
    ]
  },
  "P-Y2-2": {
    "contentHash": "6cb1eeade6ae0e88ca9c2feb0bc89a1116a65b3587905d8aaaf4a2a05f3147ef",
    "objective": "Build a three-part independently controlled visitor story with dialogue, repeated travel and a reliable restart.",
    "workbench": "scene",
    "essentialChecks": [
      "Each input selects only its own scene",
      "Travel and arrival words occur in order",
      "Restart clears all scenes before a new selection",
      "The saved story can be restored and replayed"
    ],
    "variants": [
      {
        "id": "P-Y2-2-transfer-1",
        "task": "Build a new visitor story: welcome makes greeter say Welcome to the harbour; travel makes traveller repeat right, down 2 times, then say At the boat; finish makes helper say Ask the harbour guide. Keep start empty, verify every control and restart, then save, restore and replay."
      },
      {
        "id": "P-Y2-2-transfer-2",
        "task": "Build a new visitor story: welcome makes greeter say Welcome to the museum; travel makes traveller repeat up, right 3 times, then say At the robot display; finish makes helper say Ask the museum guide. Keep start empty, verify every control and restart, then save, restore and replay."
      }
    ]
  },
  "C-Y2-3-1": {
    "contentHash": "8a86b41cb156666946a1d5de646fce9cbb1bd342bf9083f524b204b0db3d54a2",
    "objective": "Reconstruct a clearly labelled response table and category counts for a new fictional question.",
    "workbench": "data",
    "essentialChecks": [
      "The single-choice question and options agree",
      "Each source identifier is copied exactly once",
      "Category totals match the actual records"
    ],
    "variants": [
      {
        "id": "C-Y2-3-1-transfer-1",
        "task": "Record the new Garden badges responses exactly once, including identifiers. Ask Which garden badge do you choose? Offer leaf, seed, flower, group badge and verify all counts."
      },
      {
        "id": "C-Y2-3-1-transfer-2",
        "task": "Record the new Boat flags responses exactly once, including identifiers. Ask Which boat flag do you choose? Offer stripe, spot, wave, group flag and verify all counts."
      }
    ]
  },
  "C-Y2-3-2": {
    "contentHash": "7e327168eeb2a40113fa3bfdb93ed7090700effb9b7b3a8f94a908db48aa27e8",
    "objective": "Diagnose an unfamiliar duplicated observation using source identifiers and repair its effect on the displayed count.",
    "workbench": "data",
    "essentialChecks": [
      "The duplicated identifier is removed",
      "No genuine source observation is deleted",
      "All actual category counts are restored"
    ],
    "variants": [
      {
        "id": "C-Y2-3-2-transfer-1",
        "task": "Find and repair the duplicate in Library bookmarks. Preserve every genuine identifier and response, then recalculate all actual category counts."
      },
      {
        "id": "C-Y2-3-2-transfer-2",
        "task": "Find and repair the duplicate in Boat flags. Preserve every genuine identifier and response, then recalculate all actual category counts."
      }
    ]
  },
  "C-Y2-3-3": {
    "contentHash": "a5f7207e9832997eb4ada30ae6aaa522e2dc05438a64508885ed2f0b66d0cd11",
    "objective": "Improve a new pictogram's labels, numerical mapping and supported conclusion without changing its source evidence.",
    "workbench": "data",
    "essentialChecks": [
      "Category labels and numeric values are correctly mapped",
      "The zero-based display and alternative are readable",
      "The conclusion names the actual largest group and its limit"
    ],
    "variants": [
      {
        "id": "C-Y2-3-3-transfer-1",
        "task": "Improve Library bookmarks: use actual category and count fields, readable labels, one-choice symbols and a zero-based display. Select the supported limited conclusion from the supplied claim bank."
      },
      {
        "id": "C-Y2-3-3-transfer-2",
        "task": "Improve Garden badges: use actual category and count fields, readable labels, one-choice symbols and a zero-based display. Select the supported limited conclusion from the supplied claim bank."
      }
    ]
  },
  "P-Y2-3": {
    "contentHash": "7e902fcb06f16938520acb2d1f2029c5d210f6c0bce7a2ca039fc62f234b1d9f",
    "objective": "Build a complete private classroom survey artifact from a clear question, exact fictional observations, a readable pictogram and an evidence-limited conclusion.",
    "workbench": "data",
    "essentialChecks": [
      "Question and distinct options match the brief",
      "Every observation is recorded exactly once",
      "The actual counts drive a readable pictogram",
      "The limited conclusion and restored project agree"
    ],
    "variants": [
      {
        "id": "P-Y2-3-transfer-1",
        "task": "Build the new Classroom display border project. Ask Which display-border picture do you choose? Offer dots, leaves, stars; record every source identifier and choice, group border, create its readable pictogram and select the supported limited claim. Save, restore and recalculate."
      },
      {
        "id": "P-Y2-3-transfer-2",
        "task": "Build the new Classroom welcome sign project. Ask Which welcome-sign picture do you choose? Offer tree, boat, kite; record every source identifier and choice, group sign, create its readable pictogram and select the supported limited claim. Save, restore and recalculate."
      }
    ]
  },
  "C-Y2-4-1": {
    "contentHash": "e43683f7489080406fccda6b7d10adfaa658dad1354b13a8476c452e1c2867ff",
    "objective": "Recall how to select a named source, inspect its content and improve a working copy while retaining both originals.",
    "workbench": "scenario",
    "essentialChecks": [
      "The ready source is retrieved by its meaningful name",
      "The actual caption is revised without changing the route",
      "Original source versions remain available"
    ],
    "variants": [
      {
        "id": "C-Y2-4-1-transfer-1",
        "task": "Retrieve Station-ready, revise scene:0:caption to Move right then down to the welcome desk., then inspect the original character and two-move route while retaining both source versions."
      },
      {
        "id": "C-Y2-4-1-transfer-2",
        "task": "Retrieve Gallery-ready, revise scene:0:caption to Move right then down to the welcome desk., then inspect the original character and two-move route while retaining both source versions."
      }
    ]
  },
  "C-Y2-4-2": {
    "contentHash": "3b5c255dda8a7ec82cc240af92741becba979e1f34c558dadd6f606bcd51673e",
    "objective": "Repair an unfamiliar guide that mistakes a permission request for a grant and retains an unsafe contact response.",
    "workbench": "scenario",
    "essentialChecks": [
      "Unpermitted reuse is replaced with original work",
      "An unsafe reply is removed and contact stopped",
      "Trusted help and a clear matching practice report are selected"
    ],
    "variants": [
      {
        "id": "C-Y2-4-2-transfer-1",
        "task": "Repair a new fictional guide: Hazel has not given reuse permission. Build your original robot help card, remove the unsafe reply, stop contact, ask a trusted adult and report conduct using: A fictional player repeatedly sends unkind messages."
      },
      {
        "id": "C-Y2-4-2-transfer-2",
        "task": "Repair a new fictional guide: Birch has not given reuse permission. Build your original flower help card, remove the unsafe reply, stop contact, ask a trusted adult and report content using: A fictional picture is upsetting. Please help me check it."
      }
    ]
  },
  "C-Y2-4-3": {
    "contentHash": "0692fe89f0afdd23309a3416e74fa9992a9265506866972b5eab0be2f0edc393",
    "objective": "Improve a fictional guide through respectful, actionable feedback and a verifiable caption revision.",
    "workbench": "scenario",
    "essentialChecks": [
      "Every response is respectful",
      "The feedback suggests a concrete change",
      "The actual working caption is revised while its route is preserved"
    ],
    "variants": [
      {
        "id": "C-Y2-4-3-transfer-1",
        "task": "Give respectful, useful caption feedback for Gallery welcome card, then revise scene:0:caption to Move right then down to the visitor help desk. Keep the title and route, and remove any earlier insult."
      },
      {
        "id": "C-Y2-4-3-transfer-2",
        "task": "Give respectful, useful caption feedback for Station welcome card, then revise scene:0:caption to Move right then down to the visitor help desk. Keep the title and route, and remove any earlier insult."
      }
    ]
  },
  "P-Y2-4": {
    "contentHash": "5eaf0749e5efb6ebe4223405a28481cd99e24800453dc086bd65763330254bbe",
    "objective": "Build a private, three-part illustrated community guide with working device demonstrations, respectful picture reuse, safe help advice and a replayable saved version.",
    "workbench": "scenario",
    "essentialChecks": [
      "Three named illustrated routes follow their captions",
      "Both required devices produce actual model outputs",
      "Provided media respects credit and permission",
      "Safe help advice and clear report exclude private details",
      "A saved version restores and replays the full guide"
    ],
    "variants": [
      {
        "id": "P-Y2-4-transfer-1",
        "task": "Build Community garden from its new brief: three named scenes and ordered routes, sensor then speaker, a credit to permitted creator Ash, and safe stop/adult/contact-report advice. Save, restore and replay the whole private guide."
      },
      {
        "id": "P-Y2-4-transfer-2",
        "task": "Build Community museum from its new brief: three named scenes and ordered routes, scanner then speaker, a credit to permitted creator Willow, and safe stop/adult/contact-report advice. Save, restore and replay the whole private guide."
      }
    ]
  },
  "Y3.01": {
    "contentHash": "1ea86928ce5fbfc1d6e2d313780dc0c56bc9eb642401274f20f69b2493d5d37a",
    "objective": "Connect different events to distinct sprite actions.",
    "workbench": "route",
    "essentialChecks": [
      "event-action mapping correct",
      "no duplicate trigger",
      "reset works"
    ],
    "variants": [
      {
        "id": "Y3.01-transfer-1",
        "task": "Give east the route right, up, right and north the route up, right, up. Keep start empty and verify both choices after restart."
      },
      {
        "id": "Y3.01-transfer-2",
        "task": "Give east right, right, down and north up, up, left. Test waiting, each input and east-restart-north without duplicating triggers."
      }
    ]
  },
  "Y3.02": {
    "contentHash": "1caa0a1ad92901f4805a4f40325efffeb45e5d424f4d720d431f56cf97e2a6cc",
    "objective": "Predict, build, repair and explain repeat blocks in the existing grid lesson.",
    "workbench": "route",
    "essentialChecks": [
      "prediction correct",
      "goal reached with loops",
      "independent explanation matches"
    ],
    "variants": [
      {
        "id": "Y3.02-transfer-1",
        "task": "Use one repeated Right action to travel four squares. Predict the endpoint and check four actual iterations from both starts."
      },
      {
        "id": "Y3.02-transfer-2",
        "task": "Use one repeated Up action to travel five squares. Check the vertical trail and five actual iterations from both starts."
      }
    ]
  },
  "Y3.03": {
    "contentHash": "3167d14bd0cd3e817591d4e0b52857b412452eeeadbbc358964b4538d4dd38a5",
    "objective": "Place a sprite at coordinates and trace movement between positions.",
    "workbench": "route",
    "essentialChecks": [
      "axes correct",
      "endpoint correct",
      "trace explained"
    ],
    "variants": [
      {
        "id": "Y3.03-transfer-1",
        "task": "Place a sprite at x one, y three, then move right twice and down once. Check the absolute placement and final x three, y two."
      },
      {
        "id": "Y3.03-transfer-2",
        "task": "Place a sprite at x four, y two, then move left, up, left. Check each coordinate and finish at x two, y three."
      }
    ]
  },
  "Y3.04": {
    "contentHash": "8f635a6c526573cc453e9ee5df2cc4b85a0a24798b55a3f8e02e6c9fb5fec3ae",
    "objective": "Use a bounded repeat-until condition to stop an animation.",
    "workbench": "route",
    "essentialChecks": [
      "repeats as required",
      "stop works",
      "execution limit respected"
    ],
    "variants": [
      {
        "id": "Y3.04-transfer-1",
        "task": "Move upward until y equals five, then emit arrived to say Destination reached and stop. Handle different starts including already at y five."
      },
      {
        "id": "Y3.04-transfer-2",
        "task": "Move right until x equals six, then emit arrived and stop with the same destination feedback. Do not use a fixed movement count."
      }
    ]
  },
  "Y3.05": {
    "contentHash": "d39cee8774ac5237a0f63820d641d3087a465f4a7d9a9831b6920d0c791bc214",
    "objective": "Split an animation into start, movement and finish sections.",
    "workbench": "route",
    "essentialChecks": [
      "parts named",
      "order justified",
      "animation meets plan"
    ],
    "variants": [
      {
        "id": "Y3.05-transfer-1",
        "task": "Build named begin, travel and finish groups for right, right, up, left. Use the same opening and closing words and emit the groups in order."
      },
      {
        "id": "Y3.05-transfer-2",
        "task": "Decompose up, right, down, right into begin, travel and finish. Prove that the finish speech follows all four actual moves."
      }
    ]
  },
  "Y3.06": {
    "contentHash": "ac9500290b480a723cfe226697fec82d675f7c4d9cf13812b88284bf918e15a8",
    "objective": "Build an animation with events, coordinates and two repeat patterns.",
    "workbench": "route",
    "essentialChecks": [
      "events reliable",
      "patterns correct",
      "restart deterministic"
    ],
    "variants": [
      {
        "id": "Y3.06-transfer-1",
        "task": "Create a new two-pattern animation at x three, y four: dance repeats up, right, down, left 3 times and says Dance finished; climb repeats up, right 2 times and says Journey finished. Keep start empty, verify all controls and restart, then save, restore and replay."
      },
      {
        "id": "Y3.06-transfer-2",
        "task": "Create a new two-pattern animation at x three, y four: dance repeats right, down, left, up 2 times and says Dance finished; climb repeats right, down 3 times and says Journey finished. Keep start empty, verify all controls and restart, then save, restore and replay."
      }
    ]
  },
  "Y3.07": {
    "contentHash": "c708123a6342b18c2eb8ae76b0b84b00fada483e27cbc7b6205e90557461b721",
    "objective": "Use a condition to select between two actions.",
    "workbench": "scene",
    "essentialChecks": [
      "true case correct",
      "false case correct",
      "decision explained"
    ],
    "variants": [
      {
        "id": "Y3.07-transfer-1",
        "task": "Make choose select Up and Upper route only when the event input is greater than five; otherwise select Right and Lower route. Test above, equal and below five."
      },
      {
        "id": "Y3.07-transfer-2",
        "task": "Make choose select Up and Upper route only when the event input is greater than zero; otherwise select Right and Lower route. Include zero and a negative input."
      }
    ]
  },
  "Y3.08": {
    "contentHash": "0fadeeaf8573855bbe5f638cc8d9a5e0954a20d0aa199db7b0e97362dff2bb83",
    "objective": "Move a character in response to directional input.",
    "workbench": "scene",
    "essentialChecks": [
      "inputs mapped",
      "release stops movement",
      "reset works"
    ],
    "variants": [
      {
        "id": "Y3.08-transfer-1",
        "task": "Test left movement: its press and one extra tick must move left twice. Release then tick must stop it. Verify Down separately and restart from a released state."
      },
      {
        "id": "Y3.08-transfer-2",
        "task": "Test upward movement: press Up and tick once more, then release and tick without further movement. Verify Right separately and check restart."
      }
    ]
  },
  "Y3.09": {
    "contentHash": "0547d310999605832425d62181c1ed8f686ffbf61b89774065f2fbc4a5e21261",
    "objective": "Respond to contact without triggering on near misses.",
    "workbench": "scene",
    "essentialChecks": [
      "contact detected",
      "near miss ignored",
      "response bounded"
    ],
    "variants": [
      {
        "id": "Y3.09-transfer-1",
        "task": "Respond to an upward attempt: report Contact and hit true only when the destination itself is blocked; ignore a wall beside it."
      },
      {
        "id": "Y3.09-transfer-2",
        "task": "Build the same bounded contact decision for a leftward attempt. Verify actual blocking and a nearby object that must not trigger it."
      }
    ]
  },
  "Y3.10": {
    "contentHash": "a0a42a0050802748447db88b27a7f6c635e5df6e501f02aab71adc2d9a2dc398",
    "objective": "Define a win condition distinct from simply stopping.",
    "workbench": "scene",
    "essentialChecks": [
      "goal wins",
      "obstacle does not",
      "feedback identifies result"
    ],
    "variants": [
      {
        "id": "Y3.10-transfer-1",
        "task": "Use goal x four, y two. The go event attempts Right once and must distinguish reaching that goal, a blocking wall and an ordinary short move."
      },
      {
        "id": "Y3.10-transfer-2",
        "task": "Use a different goal at x two, y three. Check both coordinates after go's Right move and never treat a collision as a win."
      }
    ]
  },
  "Y3.11": {
    "contentHash": "d278dfa5e3aa69d5aba3d0a1ac1dde7439c6c4c413f0076a51253b2eed8a963b",
    "objective": "Use planned cases for success, failure and restart.",
    "workbench": "scene",
    "essentialChecks": [
      "success tested",
      "failure tested",
      "boundary safe"
    ],
    "variants": [
      {
        "id": "Y3.11-transfer-1",
        "task": "Guard an upward step using actual world.height. Test ordinary movement and the top boundary on both board sizes, with Inside or Edge feedback."
      },
      {
        "id": "Y3.11-transfer-2",
        "task": "Guard a leftward step at x zero and a normal inside square. Test both board sizes and keep the sprite still on an edge attempt."
      }
    ]
  },
  "Y3.12": {
    "contentHash": "0aeb30d75437d17f0e821f3c72b021eeed6f869a80244b933d4781693adc3a94",
    "objective": "Create a maze with controls, collision, win condition and reset.",
    "workbench": "scene",
    "essentialChecks": [
      "maze playable",
      "win verified",
      "restart clean"
    ],
    "variants": [
      {
        "id": "Y3.12-transfer-1",
        "task": "Build a new six-by-six maze with goal x 5, y 2 and the supplied walls. One valid route is up, right, right, right, right. Preserve all directional, release, collision, boundary, win and restart behaviours; save, restore and replay."
      },
      {
        "id": "Y3.12-transfer-2",
        "task": "Build a new six-by-six maze with goal x 2, y 4 and the supplied walls. One valid route is up, up, up, right. Preserve all directional, release, collision, boundary, win and restart behaviours; save, restore and replay."
      }
    ]
  },
  "Y3.13": {
    "contentHash": "04fd0431a2afc490e5d50607c0140b1318be87679e9d32f184c1916f71ab1cf1",
    "objective": "Connect simulated sensors, controller and actuators.",
    "workbench": "robot",
    "essentialChecks": [
      "input identified",
      "control decision runs",
      "actuator responds"
    ],
    "variants": [
      {
        "id": "Y3.13-transfer-1",
        "task": "Build a sensor-controller-actuator system that stops at a distance of at most two squares and otherwise moves Forward once. Read the actual distance, not target error."
      },
      {
        "id": "Y3.13-transfer-2",
        "task": "Build a more cautious virtual system: read distance, stop at most three squares from an obstacle, otherwise move Forward once. Inspect input and actual output in all cases."
      }
    ]
  },
  "Y3.14": {
    "contentHash": "05e12840e1f4d33be999cba255f679da8b79e142cfebf3d21b225ec0064ee9f8",
    "objective": "Respond to sensor values at a stated threshold.",
    "workbench": "robot",
    "essentialChecks": [
      "below threshold stops",
      "boundary handled",
      "above continues"
    ],
    "variants": [
      {
        "id": "Y3.14-transfer-1",
        "task": "Change the rule to stop at most three squares away. Test distance two, exactly three and four, with the boundary included."
      },
      {
        "id": "Y3.14-transfer-2",
        "task": "Use a one-square stopping threshold. Stop at exactly one and move once only when the actual distance is larger."
      }
    ]
  },
  "Y3.15": {
    "contentHash": "dd38fd7850beb077374d6171ded708c49486fe66206e0c7be9e05e1c853db07d",
    "objective": "Combine movement commands with bounded power and duration.",
    "workbench": "robot",
    "essentialChecks": [
      "power bounded",
      "duration bounded",
      "stop guaranteed"
    ],
    "variants": [
      {
        "id": "Y3.15-transfer-1",
        "task": "Use power 4 for the supplied duration 0.25, repeat 2 times, then Stop. Verify the actual displacement and power sequence from right-facing and up-facing starts."
      },
      {
        "id": "Y3.15-transfer-2",
        "task": "Use power 1 for the supplied duration 1, repeat 4 times, then Stop. Verify the actual displacement and power sequence from right-facing and up-facing starts."
      }
    ]
  },
  "Y3.16": {
    "contentHash": "16259df82aabd1df39ab5edde874b6dad5be1964d18b09c9c634fed9d4a6098c",
    "objective": "Use sensor feedback to adjust a robot's direction.",
    "workbench": "robot",
    "essentialChecks": [
      "track followed",
      "error corrected",
      "mission terminates"
    ],
    "variants": [
      {
        "id": "Y3.16-transfer-1",
        "task": "Follow the new marked path from its supplied up-facing start. Use relative line sensors to correct direction and stop only when no continuation remains; the second case shifts the entire path."
      },
      {
        "id": "Y3.16-transfer-2",
        "task": "Follow the new marked path from its supplied left-facing start. Use relative line sensors to correct direction and stop only when no continuation remains; the second case shifts the entire path."
      }
    ]
  },
  "Y3.17": {
    "contentHash": "03b64314321c5a044012254f125bb42b2467437862c925374719dcb5c8e8f4e1",
    "objective": "Build and test separate travel, detect and stop behaviours.",
    "workbench": "robot",
    "essentialChecks": [
      "parts independently checked",
      "interfaces agree",
      "mission completes"
    ],
    "variants": [
      {
        "id": "Y3.17-transfer-1",
        "task": "Use a two-square Forward travel contract from the right-facing start. Test Travel, Detect and Halt separately, then prove the composed mission reaches its supplied destination and stops."
      },
      {
        "id": "Y3.17-transfer-2",
        "task": "Use a one-square Forward contract from an up-facing start. Keep Detect driven by the actual destination sensor and verify every part and their composition."
      }
    ]
  },
  "Y3.18": {
    "contentHash": "d148769aed4d0a0ed459cd27e34dcddb681f9889a3baa2e63d161818e256d745",
    "objective": "Deliver a virtual parcel and stop when a sensor detects the destination.",
    "workbench": "robot",
    "essentialChecks": [
      "destination reached",
      "obstacles handled",
      "stop reliable"
    ],
    "variants": [
      {
        "id": "Y3.18-transfer-1",
        "task": "Deliver a parcel on the new up-facing marked route. Turn around the obstacle at its first bend, use the actual destination sensor rather than proximity to a wall, stop reliably and save, restore and replay."
      },
      {
        "id": "Y3.18-transfer-2",
        "task": "Deliver a parcel on the new left-facing marked route. Turn around the obstacle at its first bend, use the actual destination sensor rather than proximity to a wall, stop reliably and save, restore and replay."
      }
    ]
  },
  "Y3.19": {
    "contentHash": "c5f4b6ed380759d3235c9d458c7a8efd007072c3b1d0dcac2e6ca2dde4a9f03e",
    "objective": "Build a small message network and trace delivery.",
    "workbench": "network",
    "essentialChecks": [
      "connected path works",
      "disconnect identified",
      "trace explained"
    ],
    "variants": [
      {
        "id": "Y3.19-transfer-1",
        "task": "Build a new message network using the same named devices. Deliver Map ready through the router to both requested destinations and inspect each complete path."
      },
      {
        "id": "Y3.19-transfer-2",
        "task": "Repair the network so both library and garden can receive Seeds ready. Keep the classroom-router link and connect both branches."
      }
    ]
  },
  "Y3.20": {
    "contentHash": "473619aa27a8091fe0b6a3772c9a29dd660d64b739a4a5f719ec55af07afb2d8",
    "objective": "Match web pages and other services to a network model.",
    "workbench": "network",
    "essentialChecks": [
      "service distinguished",
      "network role correct",
      "misconception repaired"
    ],
    "variants": [
      {
        "id": "Y3.20-transfer-1",
        "task": "Use the web service to deliver the selected fictional owl guide. Inspect its actual title and content while keeping both router paths connected."
      },
      {
        "id": "Y3.20-transfer-2",
        "task": "Use the file service to transfer the single character é. Inspect its text and its two UTF-8 bytes rather than labelling it a web page."
      }
    ]
  },
  "Y3.21": {
    "contentHash": "a980b39819bc3541c23c0ec56ec06d334d8695baaad221be1ca37c806b8680f6",
    "objective": "Choose search terms that locate a requested item in a curated index.",
    "workbench": "network",
    "essentialChecks": [
      "relevant result found",
      "query refined",
      "evidence recorded"
    ],
    "variants": [
      {
        "id": "Y3.21-transfer-1",
        "task": "Find the location in Fictional frog resting place. Refine the vague query to frog pond, read the checked page, record its supported location answer and credit its actual source. Source order may change."
      },
      {
        "id": "Y3.21-transfer-2",
        "task": "Find the location in Fictional robot charging place. Refine the vague query to robot charge, read the checked page, record its supported location answer and credit its actual source. Source order may change."
      }
    ]
  },
  "Y3.22": {
    "contentHash": "d4ba45c1decd46f757be6c261a89af1239195de34cfaa9c8f1a742d8c8e189fc",
    "objective": "Compare ranked results when relevance and promotion signals change.",
    "workbench": "network",
    "essentialChecks": [
      "ranking change identified",
      "promotion recognised",
      "reliability checked separately"
    ],
    "variants": [
      {
        "id": "Y3.22-transfer-1",
        "task": "Investigate Fictional frog resting place with query frog pond. Set relevance weight 2 and promotion weight 1; inspect which source ranks first. Select the checked content, answer its location question and credit its source regardless of ranking."
      },
      {
        "id": "Y3.22-transfer-2",
        "task": "Investigate Fictional robot charging place with query robot charge. Set relevance weight 3 and promotion weight 0; inspect which source ranks first. Select the checked content, answer its location question and credit its source regardless of ranking."
      }
    ]
  },
  "Y3.23": {
    "contentHash": "354d941c7136e918e1d66024f4f473f1d098c571f34fafc8fc4cac8466fbd7f2",
    "objective": "Evaluate a curated page and use a safe concern-report route.",
    "workbench": "network",
    "essentialChecks": [
      "claim checked",
      "source noted",
      "concern routed safely"
    ],
    "variants": [
      {
        "id": "Y3.23-transfer-1",
        "task": "Repair an unsupported copied answer for Fictional frog resting place. Search frog pond, read and select the checked page, answer its new location question and credit its source. Replace the unsafe reply with trusted adult help."
      },
      {
        "id": "Y3.23-transfer-2",
        "task": "Repair an unsupported copied answer for Fictional robot charging place. Search robot charge, read and select the checked page, answer its new location question and credit its source. Replace the unsafe reply with a platform-report practice route."
      }
    ]
  },
  "Y3.24": {
    "contentHash": "6a227c73da1f16ce6b432765fd5ca8e0f7c045aac9c4b7d6a7bedd44c6f7d1dc",
    "objective": "Combine a network diagram, search record and credited answer for a younger learner.",
    "workbench": "network",
    "essentialChecks": [
      "network explanation correct",
      "evidence supported",
      "credit and safety included"
    ],
    "variants": [
      {
        "id": "Y3.24-transfer-1",
        "task": "Create a new discovery guide about Fictional frog resting place. Connect both router destinations, search frog pond, select and credit the checked source and answer its new location question. Set relevance weight 2, promotion weight 1, and choose trusted adult help. Save, restore and rerun the whole guide."
      },
      {
        "id": "Y3.24-transfer-2",
        "task": "Create a new discovery guide about Fictional robot charging place. Connect both router destinations, search robot charge, select and credit the checked source and answer its new location question. Set relevance weight 3, promotion weight 0, and choose a platform-report practice route. Save, restore and rerun the whole guide."
      }
    ]
  },
  "C-Y3-1-1": {
    "contentHash": "92e75498d4165e48537f800756446bd1e38f9676d32a589af4d5d46fea673264",
    "objective": "Retrieve a repeat-until stopping rule that adapts to new starting positions rather than relying on a memorised repeat count.",
    "workbench": "route",
    "essentialChecks": [
      "The condition handles changing initial distances",
      "An already-reached destination needs zero moves",
      "Arrival triggers one stopping response"
    ],
    "variants": [
      {
        "id": "C-Y3-1-1-transfer-1",
        "task": "Reconstruct an upward arrival animation ending at y seven. Use repeat-until, one arrived event and a stopped actuator; include the already-arrived case."
      },
      {
        "id": "C-Y3-1-1-transfer-2",
        "task": "Reconstruct a rightward arrival animation ending at x eight. Handle changing starts and zero required movement without a fixed repeat count."
      }
    ]
  },
  "C-Y3-1-2": {
    "contentHash": "fdd92d25a02cda5a11a1a84998bca48176f6e83d01b61ff939a803d3cbb854ef",
    "objective": "Diagnose a missing final movement inside a correctly ordered set of named animation sections.",
    "workbench": "route",
    "essentialChecks": [
      "The named section order remains correct",
      "The missing travel action is restored",
      "Finish occurs at the actual intended destination"
    ],
    "variants": [
      {
        "id": "C-Y3-1-2-transfer-1",
        "task": "Repair a new incomplete Travel handler to follow up, right, right, down, up. Preserve begin-travel-finish order and the two requested speech bubbles; retest every move."
      },
      {
        "id": "C-Y3-1-2-transfer-2",
        "task": "Repair a new incomplete Travel handler to follow right, right, up, left, up. Preserve begin-travel-finish order and the two requested speech bubbles; retest every move."
      }
    ]
  },
  "C-Y3-1-3": {
    "contentHash": "56f54069e6223273f441c30bfb81ab4f2e28d0a147da985d2e404194b26b2690",
    "objective": "Reduce repeated written instructions while preserving every coordinate of a new zigzag animation.",
    "workbench": "route",
    "essentialChecks": [
      "The baseline and improved full trails match",
      "The complete four-move unit remains intact",
      "The improved program uses one repeat"
    ],
    "variants": [
      {
        "id": "C-Y3-1-3-transfer-1",
        "task": "Improve Program B to repeat up, right, down, right 2 times. Preserve Program A and every actual visited coordinate while reducing the written instructions."
      },
      {
        "id": "C-Y3-1-3-transfer-2",
        "task": "Improve Program B to repeat right, up, left, up 2 times. Preserve Program A and every actual visited coordinate while reducing the written instructions."
      }
    ]
  },
  "P-Y3-1": {
    "contentHash": "4f5d852f9c4548140ab23958d69f249963002b705d3f55530ef800183a36c502",
    "objective": "Create a two-control loop-powered exhibition whose patterns, coordinate trails and restored restart behaviour agree with the visitor brief.",
    "workbench": "route",
    "essentialChecks": [
      "Each control selects its distinct full pattern",
      "Both repeated units are complete",
      "Restart clears the old position and speech",
      "The saved exhibition restores and replays"
    ],
    "variants": [
      {
        "id": "P-Y3-1-transfer-1",
        "task": "Build a new exhibition at x three, y four: dance repeats up, right, down, left 2 times then says Dance finished; climb repeats right, right, up 2 times then says Journey finished. Keep start empty, test both controls and restart, then save, restore and replay."
      },
      {
        "id": "P-Y3-1-transfer-2",
        "task": "Build a new exhibition at x three, y four: dance repeats up, up, down, down 2 times then says Dance finished; climb repeats right, up, left 2 times then says Journey finished. Keep start empty, test both controls and restart, then save, restore and replay."
      }
    ]
  },
  "C-Y3-2-1": {
    "contentHash": "a059e22829c9db9384d3cfff97dabeb29e10bf709dee44de2fc0de652fb43d22",
    "objective": "Reconstruct a two-branch game choice and retrieve the exact meaning of its equality boundary.",
    "workbench": "scene",
    "essentialChecks": [
      "Above-threshold input selects one branch",
      "Equality and below select Otherwise",
      "Only one route and response execute"
    ],
    "variants": [
      {
        "id": "C-Y3-2-1-transfer-1",
        "task": "Reconstruct choose with threshold seven: input greater than seven selects Up and Upper route; equality or below selects Right and Lower route."
      },
      {
        "id": "C-Y3-2-1-transfer-2",
        "task": "Use threshold minus two. A greater input selects Up and Upper route; exactly minus two and below select Right and Lower route. Check negative typed inputs."
      }
    ]
  },
  "C-Y3-2-2": {
    "contentHash": "c15ebaae41acd2c23a24c4af77c2dc62a83d55314b06f2f50e5d99560b2d781a",
    "objective": "Diagnose an unconditional collision response that mistakes a near miss for contact.",
    "workbench": "scene",
    "essentialChecks": [
      "A nearby obstacle does not trigger contact feedback",
      "An actually blocked move does trigger it",
      "Each attempt has one bounded response"
    ],
    "variants": [
      {
        "id": "C-Y3-2-2-transfer-1",
        "task": "Repair an always-true right contact alarm from the new starting square. Use actual collision, return the right hit value and words, and ignore the nearby obstacle."
      },
      {
        "id": "C-Y3-2-2-transfer-2",
        "task": "Repair an always-true up contact alarm from the new starting square. Use actual collision, return the right hit value and words, and ignore the nearby obstacle."
      }
    ]
  },
  "C-Y3-2-3": {
    "contentHash": "6500270962781a8d3aa9cd1bfde45829dfc85d3bf2ba0d95087bfbb141faa005",
    "objective": "Replace an unsafe movement attempt with a dimension-aware boundary guard on new board sizes.",
    "workbench": "scene",
    "essentialChecks": [
      "An ordinary inside step remains possible",
      "The outer edge is refused before movement",
      "The guard works on both new board sizes"
    ],
    "variants": [
      {
        "id": "C-Y3-2-3-transfer-1",
        "task": "Improve right movement on seven-by-seven and nine-by-nine boards. Use actual dimensions, preserve a legal step and refuse an out-of-bounds step with Edge feedback."
      },
      {
        "id": "C-Y3-2-3-transfer-2",
        "task": "Improve up movement on seven-by-seven and nine-by-nine boards. Use actual dimensions, preserve a legal step and refuse an out-of-bounds step with Edge feedback."
      }
    ]
  },
  "P-Y3-2": {
    "contentHash": "8aa34d9a4b66cf5d586801038f9b35ca615b0e1eca2a0466ff679741cbab6a23",
    "objective": "Build a new visitor maze with responsive directional controls, bounded collision and edge handling, a genuine goal and a replayable second game.",
    "workbench": "scene",
    "essentialChecks": [
      "The supplied goal can actually be reached",
      "Walls and edges do not award wins",
      "Release and a won game stop further movement",
      "Restart permits another complete game",
      "The saved maze restores and replays"
    ],
    "variants": [
      {
        "id": "P-Y3-2-transfer-1",
        "task": "Build a new visitor maze with goal x 4, y 4 and the new supplied walls. Preserve controls, release, wall and edge handling, goal-only wins and a second playable game after restart. Save, restore and replay."
      },
      {
        "id": "P-Y3-2-transfer-2",
        "task": "Build a new visitor maze with goal x 3, y 5 and the new supplied walls. Preserve controls, release, wall and edge handling, goal-only wins and a second playable game after restart. Save, restore and replay."
      }
    ]
  },
  "C-Y3-3-1": {
    "contentHash": "d572cf258eac2427a3c0025749477ebdfc4a1adbc0b3e0300bca12916da624c9",
    "objective": "Retrieve a sensor-controller rule at a new safety threshold and verify the actual movement decision.",
    "workbench": "robot",
    "essentialChecks": [
      "The actual distance is recorded",
      "Below and equal readings stop",
      "An above-threshold reading permits one forward step"
    ],
    "variants": [
      {
        "id": "C-Y3-3-1-transfer-1",
        "task": "Reconstruct the controller for an at-most-5 stopping rule. Read the real distance, handle below, equal and above cases, and move one forward step only when safe under this brief."
      },
      {
        "id": "C-Y3-3-1-transfer-2",
        "task": "Reconstruct the controller for an at-most-3 stopping rule. Read the real distance, handle below, equal and above cases, and move one forward step only when safe under this brief."
      }
    ]
  },
  "C-Y3-3-2": {
    "contentHash": "ae1e649b9d4a051ee57d921733db2862a46a1ece194e296b531a421dbfe2f82c",
    "objective": "Find a reversed left-turn correction using actual relative line readings and the first wrong visited square.",
    "workbench": "robot",
    "essentialChecks": [
      "The first wrong turn is repaired",
      "All marked points are visited in order",
      "The robot stops when no continuation remains"
    ],
    "variants": [
      {
        "id": "C-Y3-3-2-transfer-1",
        "task": "Repair the reversed left correction on the new up-facing marked route. Use relative line readings, verify every point on the shifted route as well, and terminate at its end."
      },
      {
        "id": "C-Y3-3-2-transfer-2",
        "task": "Repair the reversed left correction on the new left-facing marked route. Use relative line readings, verify every point on the shifted route as well, and terminate at its end."
      }
    ]
  },
  "C-Y3-3-3": {
    "contentHash": "3346865c6ad33181fe181bd6b0cc5927774307cada8d17cc7c6eba9d8aadd47c",
    "objective": "Preserve a bounded motor journey while adding a verifiable final actuator stop.",
    "workbench": "robot",
    "essentialChecks": [
      "Each power-duration movement is preserved",
      "The applied-power sequence ends at zero",
      "The actuator is explicitly stopped from both headings"
    ],
    "variants": [
      {
        "id": "C-Y3-3-3-transfer-1",
        "task": "Improve the new mission: preserve 4 power-2 commands of supplied duration 0.5, then add an explicit Stop. Verify displacement and final zero power from both headings."
      },
      {
        "id": "C-Y3-3-3-transfer-2",
        "task": "Improve the new mission: preserve 2 power-1 commands of supplied duration 1, then add an explicit Stop. Verify displacement and final zero power from both headings."
      }
    ]
  },
  "P-Y3-3": {
    "contentHash": "99cff24a8cd3192e786ea739465cff13fc02ff0875c961cb753afcf2e5fe0e52",
    "objective": "Create a decomposed parcel mission that follows a new marked path around an early obstacle, confirms the actual destination and safely replays from a saved version.",
    "workbench": "robot",
    "essentialChecks": [
      "Every marked route point is followed around the obstacle",
      "Named Travel and Halt parts actually execute",
      "The destination sensor verifies delivery",
      "The saved mission restores and replays without false success"
    ],
    "variants": [
      {
        "id": "P-Y3-3-transfer-1",
        "task": "Build the new up-facing parcel mission with the supplied longer route and obstacle. Reuse named Travel for each feedback step, select named Halt at the end, verify actual destination delivery and save, restore and replay both map positions."
      },
      {
        "id": "P-Y3-3-transfer-2",
        "task": "Build the new left-facing parcel mission with the supplied longer route and obstacle. Reuse named Travel for each feedback step, select named Halt at the end, verify actual destination delivery and save, restore and replay both map positions."
      }
    ]
  },
  "C-Y3-4-1": {
    "contentHash": "c20686755be8872d4f8456037faa84962567734167a0cd86352970f1ebc39359",
    "objective": "Reconstruct a two-destination message network using new device names and an explicit intermediate switch.",
    "workbench": "network",
    "essentialChecks": [
      "Both destinations have connected paths",
      "The calculated route includes the switch",
      "The actual message content is preserved"
    ],
    "variants": [
      {
        "id": "C-Y3-4-1-transfer-1",
        "task": "Connect garden through hub to both shed and pond. Deliver Welcome route with the message service and inspect both actual paths."
      },
      {
        "id": "C-Y3-4-1-transfer-2",
        "task": "Connect visitor through switch to both guide-room and help-room. Deliver Welcome route with the message service and inspect both actual paths."
      }
    ]
  },
  "C-Y3-4-2": {
    "contentHash": "7035b86736773a3ed1f85f96cf9f1652b5053699529850048b61de4b31c1ef01",
    "objective": "Diagnose an unsupported copied answer and replace it with checked content and an actual source credit on a new topic.",
    "workbench": "network",
    "essentialChecks": [
      "The promoted first result is not mistaken for verification",
      "The selected checked source supports the answer",
      "The actual source is acknowledged"
    ],
    "variants": [
      {
        "id": "C-Y3-4-2-transfer-1",
        "task": "Repair the unsupported answer about Fictional otter meeting place. Search otter mill, keep promotion weight one, select the checked content, record its actual location answer and credit its source rather than the first advert."
      },
      {
        "id": "C-Y3-4-2-transfer-2",
        "task": "Repair the unsupported answer about Fictional butterfly shelter. Search butterfly shelter, keep promotion weight one, select the checked content, record its actual location answer and credit its source rather than the first advert."
      }
    ]
  },
  "C-Y3-4-3": {
    "contentHash": "27e2905f681bb841dfab8535dcfc3ef216100f3cbd8e3510e892bacc0ba51228",
    "objective": "Add a missing source acknowledgement and a specific supporting evidence note without changing a correct factual answer.",
    "workbench": "network",
    "essentialChecks": [
      "The supported answer remains accurate",
      "The actual selected source receives an entered credit",
      "The evidence note points to the observed location and states the ranking limit"
    ],
    "variants": [
      {
        "id": "C-Y3-4-3-transfer-1",
        "task": "Improve Fictional otter meeting place without changing its supported answer. Enter its actual source credit and this evidence note: The checked source names water mill. A promotion does not verify its claim."
      },
      {
        "id": "C-Y3-4-3-transfer-2",
        "task": "Improve Fictional butterfly shelter without changing its supported answer. Enter its actual source credit and this evidence note: The checked source names glass house. A promotion does not verify its claim."
      }
    ]
  },
  "P-Y3-4": {
    "contentHash": "b734d3e758ca874c9e30ae0c9f564b05facfb8e849097beb3516b86af4331bea",
    "objective": "Build and preserve a complete new discovery guide combining a two-destination network, purposeful search, checked answer, actual credit and safe concern route.",
    "workbench": "network",
    "essentialChecks": [
      "Both unfamiliar device paths deliver the selected page",
      "The query finds the new topic",
      "A promoted first result is distinguished from checked evidence",
      "Answer, source credit and evidence note agree",
      "The saved guide restores and reruns"
    ],
    "variants": [
      {
        "id": "P-Y3-4-transfer-1",
        "task": "Create a new guide about Fictional garden water source. Connect explorer through hub to both map-room and source-room. Search garden water, read and credit the checked source, answer its location question and use this evidence note: The checked source names rain barrel. A promotion does not verify its claim. Keep promotion weight one and trusted adult help, then save, restore and rerun."
      },
      {
        "id": "P-Y3-4-transfer-2",
        "task": "Create a new guide about Fictional museum map collection. Connect learner through switch to both archive and report-room. Search museum map, read and credit the checked source, answer its location question and use this evidence note: The checked source names blue desk. A promotion does not verify its claim. Keep promotion weight one and trusted adult help, then save, restore and rerun."
      }
    ]
  },
  "Y4.01": {
    "contentHash": "e4610435a4ba812056b15f48ec3ce35616cee5aa1ad79fb51fdd10f321c41e80",
    "objective": "Update a score variable through play and initialise it on restart.",
    "workbench": "scene",
    "essentialChecks": [
      "score updates once",
      "reset sets initial value",
      "trace explained"
    ],
    "variants": [
      {
        "id": "Y4.01-transfer-1",
        "task": "Build a new scoring rule: each coin adds 2, initialise at zero and verify two coins, clean restart and one coin in a new play."
      },
      {
        "id": "Y4.01-transfer-2",
        "task": "Build a new scoring rule: each coin adds 3, initialise at zero and verify two coins, clean restart and one coin in a new play."
      }
    ]
  },
  "Y4.02": {
    "contentHash": "f0f82cffc301a9e521a55d78307f04d09035279322ce7ffae5d065962798326d",
    "objective": "Use counters for time and lives with clear end states.",
    "workbench": "scene",
    "essentialChecks": [
      "limits respected",
      "end state correct",
      "restart restores counters"
    ],
    "variants": [
      {
        "id": "Y4.02-transfer-1",
        "task": "Use two lives and four clock units. Prevent negative counters, distinguish lost from timeout and restore the complete initial state on restart."
      },
      {
        "id": "Y4.02-transfer-2",
        "task": "Use four lives and three clock units. Test repeated end-state inputs and a fresh restart rather than changing only the visible labels."
      }
    ]
  },
  "Y4.03": {
    "contentHash": "3341e468654495bbc2563fdfa4ed42eac5e745e5964f7328cb2603574c10234a",
    "objective": "Coordinate two sprites through named messages.",
    "workbench": "scene",
    "essentialChecks": [
      "correct receiver acts",
      "unrelated receiver waits",
      "no duplicate action"
    ],
    "variants": [
      {
        "id": "Y4.03-transfer-1",
        "task": "Broadcast water with value 3 from launch. Receiver must add that payload and move Up once; unrelated Bystander must wait. Verify repeated delivery and restart."
      },
      {
        "id": "Y4.03-transfer-2",
        "task": "Broadcast light with value 1 from launch. Receiver must add that payload and move Left once; unrelated Bystander must wait. Verify repeated delivery and restart."
      }
    ]
  },
  "Y4.04": {
    "contentHash": "22a35e8803684a7c29b8b3660d2743000a9782918b0c4e078d66b0117733a30a",
    "objective": "Predict and build nested repeats with bounded execution.",
    "workbench": "scene",
    "essentialChecks": [
      "trace predicted",
      "total actions correct",
      "execution bounded"
    ],
    "variants": [
      {
        "id": "Y4.04-transfer-1",
        "task": "Build outer Repeat three and inner Repeat two around one Up move. Predict six movements and distinguish the three outer plus six inner iterations."
      },
      {
        "id": "Y4.04-transfer-2",
        "task": "Build outer Repeat two and inner Repeat four around Right. Predict eight movements and verify both loops and the full shifted-start trail."
      }
    ]
  },
  "Y4.05": {
    "contentHash": "d346472d4ff87b37523f01c72d598c08c8095f1d40f22b2ebc36129ed313391c",
    "objective": "Use a state trace to find an incorrect score or life update.",
    "workbench": "scene",
    "essentialChecks": [
      "one event one update",
      "trace identifies fault",
      "game remains playable"
    ],
    "variants": [
      {
        "id": "Y4.05-transfer-1",
        "task": "Repair the same continuing-contact fault with four initial lives and the shifted wall. One contact counts once, leaving permits a new contact, and restart clears the flag."
      },
      {
        "id": "Y4.05-transfer-2",
        "task": "Use two lives and a new wall position. Preserve one-life-per-contact behaviour, allow a genuinely new contact after leaving, and reset the flag on restart."
      }
    ]
  },
  "Y4.06": {
    "contentHash": "054f7810a826ee9a989e3b414048c879b6c95ba8dfcb5c519c704d13a6262e3f",
    "objective": "Build and test a game with score, time, lives and a clear replay cycle.",
    "workbench": "scene",
    "essentialChecks": [
      "score correct",
      "win and loss tested",
      "replay clean"
    ],
    "variants": [
      {
        "id": "Y4.06-transfer-1",
        "task": "Build a new number mission starting at question 5, winning at 2 correct answers, with 2 lives and 4 clock units. Preserve one accepted answer per round, all end states and clean replay; save, restore and play again."
      },
      {
        "id": "Y4.06-transfer-2",
        "task": "Build a new number mission starting at question 3, winning at 4 correct answers, with 2 lives and 6 clock units. Preserve one accepted answer per round, all end states and clean replay; save, restore and play again."
      }
    ]
  },
  "Y4.07": {
    "contentHash": "6151eb85e26a6247c6730584f353c30b07fcf6b7a6665729da2042993a22ff34",
    "objective": "Decompose a story into independently testable actions.",
    "workbench": "scene",
    "essentialChecks": [
      "parts named",
      "inputs stated",
      "each behaviour tested"
    ],
    "variants": [
      {
        "id": "Y4.07-transfer-1",
        "task": "Decompose a new visitor story with three Up moves in Travel. Greet and Arrive keep their requested words; test all three independently before combining them."
      },
      {
        "id": "Y4.07-transfer-2",
        "task": "Make Travel perform Right, Up, Right while Greet and Arrive have their own speech contracts. Prove Travel works without a hidden earlier greeting."
      }
    ]
  },
  "Y4.08": {
    "contentHash": "814621f9ea2a8eba6bce1dd84979531fb2c11d616d9df0883bba6dd6fc66de1c",
    "objective": "Replace duplicated block sequences with a named procedure.",
    "workbench": "scene",
    "essentialChecks": [
      "procedure matches intention",
      "two calls work",
      "duplication removed"
    ],
    "variants": [
      {
        "id": "Y4.08-transfer-1",
        "task": "Define pattern once as up, right, down, left, then call it twice. Verify both complete calls from changed starts and remove expanded duplication."
      },
      {
        "id": "Y4.08-transfer-2",
        "task": "Define pattern once as right, up, left, down, then call it twice. Verify both complete calls from changed starts and remove expanded duplication."
      }
    ]
  },
  "Y4.09": {
    "contentHash": "64537c55b760d83b7f2cd5b82039dc91c8713260db58c990b15496afabe391b2",
    "objective": "Pass a count or direction into a reusable action.",
    "workbench": "scene",
    "essentialChecks": [
      "two parameter values work",
      "limits checked",
      "call explained"
    ],
    "variants": [
      {
        "id": "Y4.09-transfer-1",
        "task": "Define march(count) to move Up for whole counts zero to three. Pass go's event input and explain invalid values without moving."
      },
      {
        "id": "Y4.09-transfer-2",
        "task": "Define march(count) to move Left for whole counts zero to two. Verify two distinct valid values, zero and rejected negative, too-large and fractional inputs."
      }
    ]
  },
  "Y4.10": {
    "contentHash": "05cf7d945557374599dc714b888fcd0b8bba9699687f299d2eed18854ceb5aef",
    "objective": "Use two conditions to control a story branch.",
    "workbench": "scene",
    "essentialChecks": [
      "both-needed case passes",
      "single condition fails",
      "explanation correct"
    ],
    "variants": [
      {
        "id": "Y4.10-transfer-1",
        "task": "Require ticket and guide together before Open can move Up and say Gate open. Test both single-condition states, both-ready and neither-ready."
      },
      {
        "id": "Y4.10-transfer-2",
        "task": "Require map and boots together for the opening branch. A single input must leave the gate closed with no movement."
      }
    ]
  },
  "Y4.11": {
    "contentHash": "df1128a0f9cb4e0c39c01118d1c88c2fe607606e6cdef8d1aa858bad285a2217",
    "objective": "Predict path choices and repair an unreachable scene.",
    "workbench": "scene",
    "essentialChecks": [
      "paths traced",
      "unreachable scene fixed",
      "other paths preserved"
    ],
    "variants": [
      {
        "id": "Y4.11-transfer-1",
        "task": "Repair thresholds four and one: above four reaches Hill, otherwise above one reaches Pond, and the rest reaches Home. Preserve every branch and the upper boundary."
      },
      {
        "id": "Y4.11-transfer-2",
        "task": "Repair thresholds three and minus one. Keep Hill above three, Pond above minus one in Otherwise, and Home for the remaining values."
      }
    ]
  },
  "Y4.12": {
    "contentHash": "09f008d80ca5bbac3940912f0ed608ec6f1b24a4bc04d4e64f1c35a55227a16a",
    "objective": "Create a story with reusable actions, parameters and tested branches.",
    "workbench": "scene",
    "essentialChecks": [
      "procedures reused",
      "both branches work",
      "user can restart"
    ],
    "variants": [
      {
        "id": "Y4.12-transfer-1",
        "task": "Create a new shared travel procedure story: positive input moves right 3 times then says First destination; zero or negative input moves down 2 times then says Second destination. Validate counts, test both branches and restart, and save, restore and replay."
      },
      {
        "id": "Y4.12-transfer-2",
        "task": "Create a new shared travel procedure story: positive input moves left 2 times then says First destination; zero or negative input moves up 3 times then says Second destination. Validate counts, test both branches and restart, and save, restore and replay."
      }
    ]
  },
  "Y4.13": {
    "contentHash": "717468b290776c60580bdec1204b039f21d10ecb34d4f6443c3cc2f262408360",
    "objective": "Design categories and record a supplied non-personal dataset.",
    "workbench": "data",
    "essentialChecks": [
      "categories clear",
      "total correct",
      "ambiguity explained"
    ],
    "variants": [
      {
        "id": "Y4.13-transfer-1",
        "task": "Design and record Equipment choices: ask Which equipment picture do you choose? Offer ball, cone, hoop once each and record every supplied identifier and choice exactly once. Group equipment and verify all totals."
      },
      {
        "id": "Y4.13-transfer-2",
        "task": "Design and record Garden choices: ask Which garden picture do you choose? Offer leaf, flower, seed once each and record every supplied identifier and choice exactly once. Group garden and verify all totals."
      }
    ]
  },
  "Y4.14": {
    "contentHash": "c22eb2c425f76d8954f783999f574eaee76fdd790adcfd79b9442fe0dacdc046",
    "objective": "Use a spreadsheet-style tool to calculate totals and simple comparisons.",
    "workbench": "data",
    "essentialChecks": [
      "formula range correct",
      "total verified",
      "edit recalculates"
    ],
    "variants": [
      {
        "id": "Y4.14-transfer-1",
        "task": "Calculate Model garden counts from all four supplied B-column values using SUM(B1:B4), output total and verify the changed last-row case. Preserve the observations."
      },
      {
        "id": "Y4.14-transfer-2",
        "task": "Calculate Model museum counts from all four supplied B-column values using SUM(B1:B4), output total and verify the changed last-row case. Preserve the observations."
      }
    ]
  },
  "Y4.15": {
    "contentHash": "fe958f9d5b8a9602ff331effa12bce78cdd7902fce0c09c543eeb2c20ef9fc1a",
    "objective": "Select and label a chart that answers a stated question.",
    "workbench": "data",
    "essentialChecks": [
      "chart fits question",
      "labels correct",
      "scale justified"
    ],
    "variants": [
      {
        "id": "Y4.15-transfer-1",
        "task": "Create the Model tower heights bar comparison using name and height, a clear title, centimetre alternatives and a zero baseline. Check both supplied measurement sets."
      },
      {
        "id": "Y4.15-transfer-2",
        "task": "Create the Model plant heights bar comparison using name and height, a clear title, centimetre alternatives and a zero baseline. Check both supplied measurement sets."
      }
    ]
  },
  "Y4.16": {
    "contentHash": "1df91e80b11335ca16138082fe3035cca04a5d0a9c8470393978535a95cbd3bf",
    "objective": "Create original media and credit permitted reused assets.",
    "workbench": "evidence",
    "essentialChecks": [
      "permission checked",
      "credit present",
      "original editable"
    ],
    "variants": [
      {
        "id": "Y4.16-transfer-1",
        "task": "Create and reopen two original visible marks for Equipment choices, compose the permitted badge and credit StarLiz Design Team. Keep the reserved source out and inspect both layouts."
      },
      {
        "id": "Y4.16-transfer-2",
        "task": "Create and reopen two original visible marks for Garden choices, compose the permitted badge and credit StarLiz Maker Team. Keep the reserved source out and inspect both layouts."
      }
    ]
  },
  "Y4.17": {
    "contentHash": "9720687f2958ab5d18dc0d5935ef4aab2fd51caec1e13bbd510c5a7d708f6086",
    "objective": "Revise a poster for readability, keyboard access and meaningful alternatives.",
    "workbench": "evidence",
    "essentialChecks": [
      "text readable",
      "alternatives meaningful",
      "colour not sole cue"
    ],
    "variants": [
      {
        "id": "Y4.17-transfer-1",
        "task": "Repair Equipment choices: circle means ball, rectangle means cone. Restore meaningful alternatives, readable contrast and both labelled controls' Tab access while keeping the actual source credit. Save and reopen the revised original picture before previewing the whole poster."
      },
      {
        "id": "Y4.17-transfer-2",
        "task": "Repair Garden choices: circle means leaf, rectangle means flower. Restore meaningful alternatives, readable contrast and both labelled controls' Tab access while keeping the actual source credit. Save and reopen the revised original picture before previewing the whole poster."
      }
    ]
  },
  "Y4.18": {
    "contentHash": "31fb6ff8c3a5d8e06512d57044536caedfe1a43fe699b804c0863a8d34d5546c",
    "objective": "Combine data, chart, credited media and a small interactive explanation.",
    "workbench": "evidence",
    "essentialChecks": [
      "claim supported",
      "media credited",
      "interaction usable"
    ],
    "variants": [
      {
        "id": "Y4.18-transfer-1",
        "task": "Build an independent Equipment choices poster: ask Which equipment picture do you choose?, record all source identifiers and choices once, group equipment, make its readable chart and retain the limited claim. Combine original described marks with the permitted badge credited to StarLiz Design Team; provide accessible explanation and table controls, then save, restore and preview."
      },
      {
        "id": "Y4.18-transfer-2",
        "task": "Build an independent Garden choices poster: ask Which garden picture do you choose?, record all source identifiers and choices once, group garden, make its readable chart and retain the limited claim. Combine original described marks with the permitted badge credited to StarLiz Maker Team; provide accessible explanation and table controls, then save, restore and preview."
      }
    ]
  },
  "Y4.19": {
    "contentHash": "023f55bd48b97ebd304ecaa347cd774602c1ff31ba032f3c8ab5a040fc7e0668",
    "objective": "Use a simulated shared workspace with explicit editing roles.",
    "workbench": "engineering",
    "essentialChecks": [
      "permissions correct",
      "change attributed",
      "history retained"
    ],
    "variants": [
      {
        "id": "Y4.19-transfer-1",
        "task": "Configure Museum learning team so viewers can read but cannot edit or create snapshots. Queue the exact improved instruction “Choose a museum object, then press Check.” in museum.txt, then save v2 with the supplied fictional editor attribution. Verify both supplied roles and preserve v1."
      },
      {
        "id": "Y4.19-transfer-2",
        "task": "Configure Garden learning team so viewers can read but cannot edit or create snapshots. Queue the exact improved instruction “Choose a garden tool, then press Check.” in garden.txt, then save v2 with the supplied fictional editor attribution. Verify both supplied roles and preserve v1."
      }
    ]
  },
  "Y4.20": {
    "contentHash": "4520a285e804a79840c9e7a31c77cb2617285125f03dab5f880e1801a6bd5d9d",
    "objective": "Comment on a creation using specific evidence and respectful wording.",
    "workbench": "scenario",
    "essentialChecks": [
      "feedback specific",
      "respectful",
      "actionable change named"
    ],
    "variants": [
      {
        "id": "Y4.20-transfer-1",
        "task": "Review Museum instructions. Finding: The caption has no instruction telling the player to choose one object. Give one respectful feedback action citing the finding and a concrete repair: Choose one object. Address the creation and explain how the change helps."
      },
      {
        "id": "Y4.20-transfer-2",
        "task": "Review Garden instructions. Finding: The steps say Check before the player has made a choice. Give one respectful feedback action citing the finding and a concrete repair: Choose one tool. Address the creation and explain how the change helps."
      }
    ]
  },
  "Y4.21": {
    "contentHash": "ce4e23604b9395f6641a59f2ccb79ea27b678366e561336c5fba5b1a7b341605",
    "objective": "Choose safe sign-in and sharing actions in a fixture-based scenario.",
    "workbench": "scenario",
    "essentialChecks": [
      "secret removed",
      "audience limited",
      "help route identified"
    ],
    "variants": [
      {
        "id": "Y4.21-transfer-1",
        "task": "Repair Museum team's sharing plan. Remove the fictional recoveryCode field, retain only a fictional nickname, limit the audience to private, save privately and choose trusted adult help. Explain the secret-protection decision; never enter an actual credential."
      },
      {
        "id": "Y4.21-transfer-2",
        "task": "Repair Garden team's sharing plan. Remove the fictional accessToken field, retain only a fictional nickname, limit the audience to private, save privately and choose trusted adult help. Explain the secret-protection decision; never enter an actual credential."
      }
    ]
  },
  "Y4.22": {
    "contentHash": "69245d7e09bb838f6139d4428b279adcb2bc551c510e1a4aad528eda5f52b69b",
    "objective": "Route fictional content, contact and conduct concerns appropriately.",
    "workbench": "scenario",
    "essentialChecks": [
      "unsafe contact stopped",
      "suitable report selected",
      "evidence minimal"
    ],
    "variants": [
      {
        "id": "Y4.22-transfer-1",
        "task": "A fictional page contains an unsuitable picture. Stop interaction, select the matching content report route, use only “Unsuitable picture on the fictional page.” and ask a trusted adult. Do not investigate or add identifying information."
      },
      {
        "id": "Y4.22-transfer-2",
        "task": "A fictional game player repeatedly sends unkind messages. Stop interaction, select the matching conduct report route, use only “Repeated unkind messages in the fictional game.” and ask a trusted adult. Do not investigate or add identifying information."
      }
    ]
  },
  "Y4.23": {
    "contentHash": "83cfa93b6bc409a43a5f8b1953013c4049984236ad6bb53f53c9403a2c1d7484",
    "objective": "Observe fictional user-test evidence and prioritise a usability repair.",
    "workbench": "game",
    "essentialChecks": [
      "finding evidenced",
      "change relevant",
      "retest shows improvement"
    ],
    "variants": [
      {
        "id": "Y4.23-transfer-1",
        "task": "Test Museum practice. Observation: The tester cannot read the small instructions. Apply this relevant repair: Increase the instruction text size to 24. Record observation and repair, keep the audience private, then verify scoring, restart, readable instructions and keyboard access."
      },
      {
        "id": "Y4.23-transfer-2",
        "task": "Test Garden practice. Observation: The tester cannot reach Check answer with Tab. Apply this relevant repair: Include Check answer in the keyboard Tab order. Record observation and repair, keep the audience private, then verify scoring, restart, readable instructions and keyboard access."
      }
    ]
  },
  "Y4.24": {
    "contentHash": "add14dcda1f69c8c67a76c58a4780912e24701f535c7207075a157ffe733c642",
    "objective": "Deliver a learning game with private sharing, usable controls and documented tests.",
    "workbench": "game",
    "essentialChecks": [
      "game teaches stated goal",
      "access checks pass",
      "user feedback addressed"
    ],
    "variants": [
      {
        "id": "Y4.24-transfer-1",
        "task": "Build Find the supplied tile count. Compare the numeric answer event with supplied target 4 or 5; award one point only for the first correct input, give helpful feedback for either result and reset cleanly. Repair keyboard access, document the repeat-input and other tests, keep sharing private, then save, retrieve and replay this game."
      },
      {
        "id": "Y4.24-transfer-2",
        "task": "Build Find the supplied robot distance. Compare the numeric answer event with supplied target 6 or 7; award one point only for the first correct input, give helpful feedback for either result and reset cleanly. Repair keyboard access, document the repeat-input and other tests, keep sharing private, then save, retrieve and replay this game."
      }
    ]
  },
  "C-Y4-1-1": {
    "contentHash": "e29d6bc58d817735ca57a284ded3eb0e407ed4bbf9c643051388a28c8f83728f",
    "objective": "Reconstruct a four-point scoring rule and verify a clean new play without copying an earlier program.",
    "workbench": "scene",
    "essentialChecks": [
      "One coin adds four",
      "Two coins add eight",
      "Restart returns zero and a fresh coin adds four"
    ],
    "variants": [
      {
        "id": "C-Y4-1-1-transfer-1",
        "task": "Retrieve a 5-point coin rule. Test two coins, clean restart and a new one-coin play. Explain the difference between scoring and initialisation."
      },
      {
        "id": "C-Y4-1-1-transfer-2",
        "task": "Retrieve a 6-point coin rule. Test two coins, clean restart and a new one-coin play. Explain the difference between scoring and initialisation."
      }
    ]
  },
  "C-Y4-1-2": {
    "contentHash": "ee694d13697f4140f22ec5eabdcbac8fe9f8e2fa458b34aaabc6bf40f4620fb6",
    "objective": "Use repeated-frame evidence to repair life loss in a new two-life game.",
    "workbench": "scene",
    "essentialChecks": [
      "Continuing contact removes one life",
      "Leaving and returning allows a new contact",
      "Restart clears the flag"
    ],
    "variants": [
      {
        "id": "C-Y4-1-2-transfer-1",
        "task": "Repair the continuing-contact fault with 5 lives and the supplied shifted wall. Preserve one loss per contact, a second loss after leaving, and clean restart."
      },
      {
        "id": "C-Y4-1-2-transfer-2",
        "task": "Repair the continuing-contact fault with 6 lives and the supplied shifted wall. Preserve one loss per contact, a second loss after leaving, and clean restart."
      }
    ]
  },
  "C-Y4-1-3": {
    "contentHash": "3dad9648c24c690cfbee7df9e8898c77e96b07c89ee0d895a5093c1e9184eb7b",
    "objective": "Repair the communication contract of three separate characters using a new named message and payload.",
    "workbench": "scene",
    "essentialChecks": [
      "The named receiver handles every payload once",
      "The unrelated character waits",
      "Restart clears only the previous play's state"
    ],
    "variants": [
      {
        "id": "C-Y4-1-3-transfer-1",
        "task": "Reconnect garden_ready, carrying 5. Receiver adds the payload and moves Left once per delivery; Bystander waits. Verify two deliveries and restart."
      },
      {
        "id": "C-Y4-1-3-transfer-2",
        "task": "Reconnect museum_ready, carrying 6. Receiver adds the payload and moves Right once per delivery; Bystander waits. Verify two deliveries and restart."
      }
    ]
  },
  "P-Y4-1": {
    "contentHash": "a0aef0a80e1c3cd862812267e8f47ede6f89e80eccc3508634cd1de888d79150",
    "objective": "Deliver and retrieve a number challenge with independent win, loss, timeout and replay evidence.",
    "workbench": "scene",
    "essentialChecks": [
      "Win, loss and timeout have distinct actual results",
      "One accepted answer cannot score twice",
      "A retrieved version supports another complete game"
    ],
    "variants": [
      {
        "id": "P-Y4-1-transfer-1",
        "task": "Deliver a fresh number challenge starting at 9, winning after 3 correct answers, with 3 lives and 8 clock units. Verify all end states, duplicate-input protection and a full replay; save, retrieve and rerun the version."
      },
      {
        "id": "P-Y4-1-transfer-2",
        "task": "Deliver a fresh number challenge starting at 11, winning after 2 correct answers, with 5 lives and 9 clock units. Verify all end states, duplicate-input protection and a full replay; save, retrieve and rerun the version."
      }
    ]
  },
  "C-Y4-2-1": {
    "contentHash": "8d2944f0e636b74cb4e7b3611fec109371997614036e2147e45504d918a0c9c2",
    "objective": "Reconstruct and test greeting, travel and arrival as independent behaviours on a new route.",
    "workbench": "scene",
    "essentialChecks": [
      "Travel runs without greeting first",
      "Greeting has no hidden movement setup",
      "The full sequence preserves its intended words and trail"
    ],
    "variants": [
      {
        "id": "C-Y4-2-1-transfer-1",
        "task": "Reconstruct independent greet, travel and arrive behaviours. Travel follows down, right, up once each and works without greeting. Preserve the stated words and full route."
      },
      {
        "id": "C-Y4-2-1-transfer-2",
        "task": "Reconstruct independent greet, travel and arrive behaviours. Travel follows up, left, down once each and works without greeting. Preserve the stated words and full route."
      }
    ]
  },
  "C-Y4-2-2": {
    "contentHash": "097181fd75fabc14227ac93cfd760c766f20ffc9d8a5d95dc6a8beea44c8fd23",
    "objective": "Use ordinary and boundary cases to replace a hard-coded repeat with its actual validated parameter.",
    "workbench": "scene",
    "essentialChecks": [
      "Valid whole counts determine movement",
      "Zero produces no movement",
      "Negative, fractional and too-large counts are refused"
    ],
    "variants": [
      {
        "id": "C-Y4-2-2-transfer-1",
        "task": "Repair march so the supplied count controls right movement. Accept whole counts zero to 6; reject negative, fractional and larger values with the matching explanation and no movement."
      },
      {
        "id": "C-Y4-2-2-transfer-2",
        "task": "Repair march so the supplied count controls left movement. Accept whole counts zero to 3; reject negative, fractional and larger values with the matching explanation and no movement."
      }
    ]
  },
  "C-Y4-2-3": {
    "contentHash": "480480e5586def2291b9098ed3c874c763961756e5e3d00184db5131001a8da0",
    "objective": "Repair a repeated outer comparison so three disjoint story outcomes remain reachable at their boundaries.",
    "workbench": "scene",
    "essentialChecks": [
      "High, middle and low inputs select distinct scenes",
      "The upper boundary belongs to the middle scene",
      "Speech and actual movement agree"
    ],
    "variants": [
      {
        "id": "C-Y4-2-3-transfer-1",
        "task": "Repair the three scenes: Hill above 6, otherwise Pond above 2, otherwise Home. Verify each scene and the upper equality boundary using actual movement and speech."
      },
      {
        "id": "C-Y4-2-3-transfer-2",
        "task": "Repair the three scenes: Hill above 1, otherwise Pond above -3, otherwise Home. Verify each scene and the upper equality boundary using actual movement and speech."
      }
    ]
  },
  "P-Y4-2": {
    "contentHash": "d6340e0ae18c64dad71ec576ebcf49eb258f8db56281ae6f4de5e7b9f15744fb",
    "objective": "Deliver a saved story whose two destinations use one parameterised travel procedure and replay correctly.",
    "workbench": "scene",
    "essentialChecks": [
      "Both scene branches call the same procedure",
      "Their different arguments produce the intended routes",
      "Restart clears the previous scene before another choice"
    ],
    "variants": [
      {
        "id": "P-Y4-2-transfer-1",
        "task": "Deliver a new story: positive choose travels down 2 times; zero or negative travels left 3 times. Use one validated travel procedure, correct scene words and clean restart. Save, retrieve and replay."
      },
      {
        "id": "P-Y4-2-transfer-2",
        "task": "Deliver a new story: positive choose travels up 4 times; zero or negative travels right 2 times. Use one validated travel procedure, correct scene words and clean restart. Save, retrieve and replay."
      }
    ]
  },
  "C-Y4-3-1": {
    "contentHash": "7f24aa21a5e02b0fb4537a258313ab5b84443dfb0beb58f181739d6a8b4a6bb5",
    "objective": "Reconstruct a spreadsheet-style range formula that includes a new fifth row and recalculates changed data.",
    "workbench": "data",
    "essentialChecks": [
      "All five B-column values are included",
      "A changed fifth value changes the total",
      "The source observations remain intact"
    ],
    "variants": [
      {
        "id": "C-Y4-3-1-transfer-1",
        "task": "Calculate Fictional harbour counts using all five B-column values. Output total with SUM(B1:B5), preserve the table and verify the changed final observation."
      },
      {
        "id": "C-Y4-3-1-transfer-2",
        "task": "Calculate Fictional park counts using all five B-column values. Output total with SUM(B1:B5), preserve the table and verify the changed final observation."
      }
    ]
  },
  "C-Y4-3-2": {
    "contentHash": "aac488db4c8ddb2184e25a39c9b75668e6e5cc89286d5e4deae1aacea924b195",
    "objective": "Repair a recorded survey by comparing identifiers and choices with the source rather than adjusting chart totals.",
    "workbench": "data",
    "essentialChecks": [
      "Every source identifier occurs once",
      "Choices match the source",
      "Actual grouped counts agree"
    ],
    "variants": [
      {
        "id": "C-Y4-3-2-transfer-1",
        "task": "Repair the duplicated first response in Fictional harbour symbols. Match every identifier and choice exactly once, keep distinct categories and verify grouped counts against both source orders."
      },
      {
        "id": "C-Y4-3-2-transfer-2",
        "task": "Repair the duplicated first response in Fictional park symbols. Match every identifier and choice exactly once, keep distinct categories and verify grouped counts against both source orders."
      }
    ]
  },
  "C-Y4-3-3": {
    "contentHash": "7c708ccd7d405c026cc61090d7e10865dd8ad4fb7a7a2f5899d84d15bd418a47",
    "objective": "Correct a permitted picture's creator credit while preserving original editable artwork and its saved history.",
    "workbench": "evidence",
    "essentialChecks": [
      "The entered credit names the supplied creator",
      "The source permission permits reuse",
      "The original drawing is saved and reopened without loss"
    ],
    "variants": [
      {
        "id": "C-Y4-3-3-transfer-1",
        "task": "Repair Fictional harbour symbols's provided-picture credit to StarLiz Harbour Studio. Preserve the permitted source, original marks, saved/reopened editable picture and accessible controls."
      },
      {
        "id": "C-Y4-3-3-transfer-2",
        "task": "Repair Fictional park symbols's provided-picture credit to StarLiz Park Studio. Preserve the permitted source, original marks, saved/reopened editable picture and accessible controls."
      }
    ]
  },
  "P-Y4-3": {
    "contentHash": "f26b57564f4967f5544811835fc72c0fe26e9ec33e373d6a84690f67c82c64f1",
    "objective": "Deliver a private, accessible evidence poster whose records, chart, explanation and source acknowledgements agree.",
    "workbench": "evidence",
    "essentialChecks": [
      "Recorded identifiers and actual grouped totals agree",
      "The explanation uses actual observations and a limited claim",
      "Original art, source credit and keyboard controls remain usable"
    ],
    "variants": [
      {
        "id": "P-Y4-3-transfer-1",
        "task": "Deliver Fictional harbour symbols's independent evidence poster. Preserve exact records, calculated groups, limited claims, meaningful original art, permitted badge credit StarLiz Harbour Studio and keyboard-accessible explanation/table views. Save, retrieve and replay the complete project."
      },
      {
        "id": "P-Y4-3-transfer-2",
        "task": "Deliver Fictional park symbols's independent evidence poster. Preserve exact records, calculated groups, limited claims, meaningful original art, permitted badge credit StarLiz Park Studio and keyboard-accessible explanation/table views. Save, retrieve and replay the complete project."
      }
    ]
  },
  "C-Y4-4-1": {
    "contentHash": "640b0d2abaabea53332f6b7a2a3f10d043cc22afc65d077149ee29ed849463f2",
    "objective": "Reconstruct viewer and editor permissions, attributed changes and retained history for a new fictional team.",
    "workbench": "engineering",
    "essentialChecks": [
      "A viewer can read but cannot overwrite",
      "An editor saves the exact improved guide",
      "The new version keeps the original unchanged"
    ],
    "variants": [
      {
        "id": "C-Y4-4-1-transfer-1",
        "task": "Reconstruct Forest team's read/edit contract. Save forest.txt as “Choose a forest creature, then press Check.” in v2 with the fictional editor attribution, retain v1 and verify that viewer changes are refused."
      },
      {
        "id": "C-Y4-4-1-transfer-2",
        "task": "Reconstruct Coastal team's read/edit contract. Save coast.txt as “Choose a coastal creature, then press Check.” in v2 with the fictional editor attribution, retain v1 and verify that viewer changes are refused."
      }
    ]
  },
  "C-Y4-4-2": {
    "contentHash": "e80df8c63fabb7f2691e4a4e22a2c3b0af9e4dbf626c7f547fd56e606212ad56",
    "objective": "Remove a fictional sign-in field and repair both sharing and help decisions without entering a real secret.",
    "workbench": "scenario",
    "essentialChecks": [
      "The secret field is absent",
      "The audience is private",
      "Trusted help is chosen and the reason is recorded"
    ],
    "variants": [
      {
        "id": "C-Y4-4-2-transfer-1",
        "task": "Repair Forest team's fictional recoveryCode exposure. Remove that field, retain a fictional nickname, limit sharing, save privately and choose trusted adult help. Record why the secret needs protection."
      },
      {
        "id": "C-Y4-4-2-transfer-2",
        "task": "Repair Coastal team's fictional accessToken exposure. Remove that field, retain a fictional nickname, limit sharing, save privately and choose trusted adult help. Record why the secret needs protection."
      }
    ]
  },
  "C-Y4-4-3": {
    "contentHash": "ffa02b81e0385a9a4b6ca669488c3b5f6eea993bda53b2719072dd631422cda2",
    "objective": "Choose a relevant usability repair and verify that the actual scoring and restart behaviours survive it.",
    "workbench": "game",
    "essentialChecks": [
      "The notes cite the supplied finding",
      "The relevant setting is repaired",
      "Actual answer and restart results remain correct"
    ],
    "variants": [
      {
        "id": "C-Y4-4-3-transfer-1",
        "task": "Forest practice game: The tester cannot reach Check answer with Tab. Apply the relevant repair Include Check answer in the keyboard Tab order, record the observation and repair, then verify readable instructions, keyboard access, actual scoring and restart."
      },
      {
        "id": "C-Y4-4-3-transfer-2",
        "task": "Coastal practice game: The tester cannot tell what Go will do. Apply the relevant repair Change Go to Check answer, record the observation and repair, then verify readable instructions, keyboard access, actual scoring and restart."
      }
    ]
  },
  "P-Y4-4": {
    "contentHash": "8e71b93168570f1d24b542fdef8fedb6efb82f8f2b102f0e238ba26dae4e8f99",
    "objective": "Deliver a documented target-matching game with usable controls, actual answer feedback and a clean retrieved replay.",
    "workbench": "game",
    "essentialChecks": [
      "The game teaches the stated target-matching goal",
      "Correct, wrong, repeated-input and restart tests execute",
      "Keyboard repair and private audience are retained in the retrieved project"
    ],
    "variants": [
      {
        "id": "P-Y4-4-transfer-1",
        "task": "Deliver Forest target-count learning game for targets 30 and 40. Preserve actual target comparison, correct/wrong feedback, one point per attempt, clean restart, documented keyboard repair and private sharing. Save, retrieve and replay both targets."
      },
      {
        "id": "P-Y4-4-transfer-2",
        "task": "Deliver Coastal target-count learning game for targets 50 and 60. Preserve actual target comparison, correct/wrong feedback, one point per attempt, clean restart, documented keyboard repair and private sharing. Save, retrieve and replay both targets."
      }
    ]
  },
  "Y5.03": {
    "contentHash": "0a00f9364e7d087026dc0be9ce7dac3d7aeb07ef1f2fc806fdd301a2c4e96b62",
    "objective": "Match visual blocks to executable Python statements.",
    "workbench": "dual",
    "essentialChecks": [
      "outputs equivalent",
      "order preserved",
      "mapping explained"
    ],
    "variants": [
      {
        "id": "Y5.03-transfer-1",
        "task": "Translate a new rule in both views: add 1 to score, multiply the updated value by 2, then display it. Preserve the order."
      },
      {
        "id": "Y5.03-transfer-2",
        "task": "Translate a different rule in both views: add 4 to score, multiply by 2, then display it. Both programs must respond to a changed starting score."
      }
    ]
  },
  "Y5.06": {
    "contentHash": "c14118423a1e0d4607b3a279ac0f4f03917d5ff1adb92476a063d0f9a585116a",
    "objective": "Create equivalent visual and Python scoring programs.",
    "workbench": "dual",
    "essentialChecks": [
      "outputs equivalent",
      "reset correct",
      "learner explains translation"
    ],
    "variants": [
      {
        "id": "Y5.06-transfer-1",
        "task": "Create both representations of a new rule: add 3 to the starting score, multiply by 2, and display it. Test both a fresh play and Restart."
      },
      {
        "id": "Y5.06-transfer-2",
        "task": "Create a different dual-view rule: add 1, multiply by 3, and display the score. Both views must reset to their supplied starting value before each play."
      }
    ]
  },
  "Y5.07": {
    "contentHash": "93f5d99c04564bfadc5c8166c0a949e0cb2cf690b7a157a4af8c1d13a1782fcc",
    "objective": "Implement selection in Python and test both outcomes.",
    "workbench": "python",
    "essentialChecks": [
      "true case correct",
      "false case correct",
      "boundary checked"
    ],
    "variants": [
      {
        "id": "Y5.07-transfer-1",
        "task": "Use if/else to compare supplied number strictly above 9. Store and print Above or At or below. Verify above, equal and below inputs."
      },
      {
        "id": "Y5.07-transfer-2",
        "task": "Use if/else to compare supplied number strictly above -2. Store and print Above or At or below. Verify above, equal and below inputs."
      }
    ]
  },
  "Y5.08": {
    "contentHash": "a075a0807984136b0da46b29b4d578138d31afdf5020dffb41f88a376e99301f",
    "objective": "Read controlled input and convert it to a needed type.",
    "workbench": "python",
    "essentialChecks": [
      "valid input works",
      "invalid handled",
      "clear feedback given"
    ],
    "variants": [
      {
        "id": "Y5.08-transfer-1",
        "task": "Convert supplied raw text to a whole amount zero to twenty, multiply by 3, and print result. Catch invalid conversion and reject out-of-range values with Use a whole number from 0 to 20."
      },
      {
        "id": "Y5.08-transfer-2",
        "task": "Convert supplied raw text to a whole amount zero to twenty, multiply by 4, and print result. Catch invalid conversion and reject out-of-range values with Use a whole number from 0 to 20."
      }
    ]
  },
  "Y5.09": {
    "contentHash": "79d49ca74ed3442d238936ef80d622115726789b173229ab8511920504c97cd7",
    "objective": "Use a bounded counted loop and predict its output.",
    "workbench": "python",
    "essentialChecks": [
      "iteration count correct",
      "first and last values correct",
      "limit respected"
    ],
    "variants": [
      {
        "id": "Y5.09-transfer-1",
        "task": "Loop index from one through count inclusive, with count restricted to zero through ten. Append index + 2 to values and accumulate total. Check empty, single, ordinary, maximum and rejected counts."
      },
      {
        "id": "Y5.09-transfer-2",
        "task": "Loop index from one through count inclusive, with count restricted to zero through ten. Append index + 5 to values and accumulate total. Check empty, single, ordinary, maximum and rejected counts."
      }
    ]
  },
  "Y5.10": {
    "contentHash": "678688055b5f6a606db3da9caf5986ea84e74dc8cd85f627ba985cf4447b86d7",
    "objective": "Use a condition-controlled loop with a guaranteed stopping path.",
    "workbench": "python",
    "essentialChecks": [
      "progress changes",
      "stop reached",
      "execution cap respected"
    ],
    "variants": [
      {
        "id": "Y5.10-transfer-1",
        "task": "Advance position by 2 per turn while it is below target, with at most twenty turns. Record trail and turns, stop at the first reached-or-passed target and report Reached. Check zero and targets not divisible by the step."
      },
      {
        "id": "Y5.10-transfer-2",
        "task": "Advance position by 3 per turn while it is below target, with at most twenty turns. Record trail and turns, stop at the first reached-or-passed target and report Reached. Check zero and targets not divisible by the step."
      }
    ]
  },
  "Y5.11": {
    "contentHash": "2fd92b91372c191876e42431154201b55a68c44e31776d5f8556ed4c54b37f11",
    "objective": "Locate a logic error using expected and actual variable values.",
    "workbench": "python",
    "essentialChecks": [
      "fault located",
      "corrected trace passes",
      "unrelated behaviour preserved"
    ],
    "variants": [
      {
        "id": "Y5.11-transfer-1",
        "task": "Repair a new trace where total should accumulate index times 2 for indices one through three. Preserve supplied bonus and record every total in trail. Verify the state and printed result rather than hard-coding an answer."
      },
      {
        "id": "Y5.11-transfer-2",
        "task": "Repair a new trace where total should accumulate index times 3 for indices one through three. Preserve supplied bonus and record every total in trail. Verify the state and printed result rather than hard-coding an answer."
      }
    ]
  },
  "Y5.12": {
    "contentHash": "16ffd5ccab3f4ef14fe8496ffcaf775431a01e78ec3034f620b0bad1b3ffe5d3",
    "objective": "Build a number game with validated input, decisions and bounded repetition.",
    "workbench": "python",
    "essentialChecks": [
      "input handled",
      "decisions correct",
      "termination and restart tested"
    ],
    "variants": [
      {
        "id": "Y5.12-transfer-1",
        "task": "Build a fresh controlled number challenge allowing at most 2 guesses per game. Validate whole numbers zero to twenty, count invalid attempts, stop immediately on success, preserve useful messages and reset every game's state. Save, retrieve and replay."
      },
      {
        "id": "Y5.12-transfer-2",
        "task": "Build a fresh controlled number challenge allowing at most 4 guesses per game. Validate whole numbers zero to twenty, count invalid attempts, stop immediately on success, preserve useful messages and reset every game's state. Save, retrieve and replay."
      }
    ]
  },
  "C-Y5-1-1": {
    "contentHash": "e81e06e566a2d2a9418756cdf07f4c0573a1d2d142b075fc0f900533bf45a1a0",
    "objective": "Reconstruct an update expression that preserves the supplied starting value and explain its before/after trace.",
    "workbench": "python",
    "essentialChecks": [
      "The right side uses the old score",
      "Both changed inputs are updated correctly",
      "The real output matches the stored result"
    ],
    "variants": [
      {
        "id": "C-Y5-1-1-transfer-1",
        "task": "Retrieve a new update: add 6 to supplied score, store the result and print it. Cite the actual old and new values in your explanation."
      },
      {
        "id": "C-Y5-1-1-transfer-2",
        "task": "Retrieve a new update: add 7 to supplied score, store the result and print it. Cite the actual old and new values in your explanation."
      }
    ]
  },
  "C-Y5-1-2": {
    "contentHash": "2f6668f237a2b8dea9da4c884df45c76863bf043ad36819832f30129cc0c0d5e",
    "objective": "Use intermediate interpreter state to restore add-then-multiply order while preserving the output contract.",
    "workbench": "python",
    "essentialChecks": [
      "The addition occurs before multiplication",
      "The intermediate value is recorded at the right moment",
      "Both printed states match changed inputs"
    ],
    "variants": [
      {
        "id": "C-Y5-1-2-transfer-1",
        "task": "Repair the rule add five, record first, multiply by two, then print first and score. Verify both supplied starts and the intermediate trace."
      },
      {
        "id": "C-Y5-1-2-transfer-2",
        "task": "Repair add two, record first, multiply by four and print both states. Preserve this exact data-flow order for changed inputs."
      }
    ]
  },
  "C-Y5-1-3": {
    "contentHash": "e4968be9e3e264f7d7835b97eaf45d327352692fa51e88d1a9109c68cf028d61",
    "objective": "Restore equivalent visual and Python data flow and verify that both also meet the requested scoring rule.",
    "workbench": "dual",
    "essentialChecks": [
      "Both editable representations implement the requested rule",
      "Their actual states and output agree",
      "Restart restores the supplied input"
    ],
    "variants": [
      {
        "id": "C-Y5-1-3-transfer-1",
        "task": "Repair both-view agreement for add 5 then multiply by 3. Keep the requested rule, actual expected output and restarted input correct."
      },
      {
        "id": "C-Y5-1-3-transfer-2",
        "task": "Repair both-view agreement for add 6 then multiply by 2. Keep the requested rule, actual expected output and restarted input correct."
      }
    ]
  },
  "P-Y5-1": {
    "contentHash": "c84a089d4f79db1181ab0153ff834e6f747358c25d66c16f0afa4dcfc1e72049",
    "objective": "Deliver, retrieve and replay equivalent editable visual and Python score programs with an explained data-flow contract.",
    "workbench": "dual",
    "essentialChecks": [
      "Both views implement add seven then double",
      "Changed and restarted inputs produce the requested results",
      "The complete dual-view project is saved and retrieved"
    ],
    "variants": [
      {
        "id": "P-Y5-1-transfer-1",
        "task": "Deliver both editable representations of add 8 then multiply by 3, followed by display. Verify expected state, output, equivalence and clean restart. Save, retrieve and replay the complete project."
      },
      {
        "id": "P-Y5-1-transfer-2",
        "task": "Deliver both editable representations of add 9 then multiply by 2, followed by display. Verify expected state, output, equivalence and clean restart. Save, retrieve and replay the complete project."
      }
    ]
  },
  "C-Y5-2-1": {
    "contentHash": "26e006bc19f70c00c9a318978252a6a64c12e158cdff994ccdf8768b0b6a09c6",
    "objective": "Reconstruct a bounded counted loop that records and totals every transformed value through its endpoint.",
    "workbench": "python",
    "essentialChecks": [
      "Each index one through count is included",
      "Every recorded value is index plus seven",
      "Zero, maximum and rejected counts behave as specified"
    ],
    "variants": [
      {
        "id": "C-Y5-2-1-transfer-1",
        "task": "Reconstruct the bounded inclusive loop with values index plus 8. Preserve every list item, actual total, zero-count result and rejected-count message."
      },
      {
        "id": "C-Y5-2-1-transfer-2",
        "task": "Reconstruct the bounded inclusive loop with values index plus 9. Preserve every list item, actual total, zero-count result and rejected-count message."
      }
    ]
  },
  "C-Y5-2-2": {
    "contentHash": "12779f3b7716719abec529e82a66cea1b0a6b0ae9438f355a85f44e7252f8200",
    "objective": "Handle invalid controlled text and boundary values while preserving a new valid numeric calculation.",
    "workbench": "python",
    "essentialChecks": [
      "Valid whole-number text is multiplied by five",
      "Words and decimals receive the defined message",
      "Out-of-range values do not produce a result"
    ],
    "variants": [
      {
        "id": "C-Y5-2-2-transfer-1",
        "task": "Repair controlled text conversion for multiplication by 6. Accept whole amounts zero to twenty and explain words, decimals and out-of-range values without crashing or inventing a numeric substitute."
      },
      {
        "id": "C-Y5-2-2-transfer-2",
        "task": "Repair controlled text conversion for multiplication by 7. Accept whole amounts zero to twenty and explain words, decimals and out-of-range values without crashing or inventing a numeric substitute."
      }
    ]
  },
  "C-Y5-2-3": {
    "contentHash": "2a2a083a270760e2a7dae70828059a8248f78ad7bfbb18840cf3643843908499",
    "objective": "Repair the actual progress update and distinguish a reached target from merely hitting a safety cap.",
    "workbench": "python",
    "essentialChecks": [
      "Position advances by four per turn",
      "The loop stops at the first reached-or-passed target",
      "The cap does not substitute for successful progress"
    ],
    "variants": [
      {
        "id": "C-Y5-2-3-transfer-1",
        "task": "Repair position progress using step 5. Retain the twenty-turn cap, record the actual trail, handle target zero and stop at the first reached-or-passed target rather than merely counting turns."
      },
      {
        "id": "C-Y5-2-3-transfer-2",
        "task": "Repair position progress using step 6. Retain the twenty-turn cap, record the actual trail, handle target zero and stop at the first reached-or-passed target rather than merely counting turns."
      }
    ]
  },
  "P-Y5-2": {
    "contentHash": "f72e9722dbda9c3ce4e7e6feecba943d20b183de1094da6aa07fc805a7fe5904",
    "objective": "Deliver a saved multi-game challenge with controlled input validation, bounded turns and fresh state for every replay.",
    "workbench": "python",
    "essentialChecks": [
      "Invalid guesses receive useful feedback and consume a turn",
      "Success stops the current game immediately",
      "Each new game starts with clean state and a retrieved version replays"
    ],
    "variants": [
      {
        "id": "P-Y5-2-transfer-1",
        "task": "Deliver a new challenge capped at 6 guesses per game. Preserve input validation, counted invalid attempts, immediate success stopping, exhaustion and fresh state for every game. Save, retrieve and replay."
      },
      {
        "id": "P-Y5-2-transfer-2",
        "task": "Deliver a new challenge capped at 7 guesses per game. Preserve input validation, counted invalid attempts, immediate success stopping, exhaustion and fresh state for every game. Save, retrieve and replay."
      }
    ]
  },
  "Y5.13": {
    "contentHash": "33e81e463fe6d666424cdc2dc0df3bcd587bee895b70b712684c8ee50449f352",
    "objective": "Model a robot mission as smaller input-process-output behaviours.",
    "workbench": "robot",
    "essentialChecks": [
      "interfaces stated",
      "units consistent",
      "parts testable"
    ],
    "variants": [
      {
        "id": "Y5.13-transfer-1",
        "task": "Use a new model scale of 50 centimetres per cell. Store the centimetre sensor reading, convert it back to cells for stepIfClear, refuse distance one, take one safe Right step when farther away and stop."
      },
      {
        "id": "Y5.13-transfer-2",
        "task": "Use a new model scale of 25 centimetres per cell. Store the centimetre sensor reading, convert it back to cells for stepIfClear, refuse distance one, take one safe Right step when farther away and stop."
      }
    ]
  },
  "Y5.14": {
    "contentHash": "c7f7fbb40a43c0b0794c1526d3762b47353fb0279a550cf3540a41864278db46",
    "objective": "Represent a simulated rescue area using explicit state.",
    "workbench": "robot",
    "essentialChecks": [
      "state defined",
      "transitions consistent",
      "prediction checked"
    ],
    "variants": [
      {
        "id": "Y5.14-transfer-1",
        "task": "Build the same explicit rescue model with 4 energy units. Charge attempted movement consistently, require the authoritative destination before collection, prevent duplicate counting and preserve blocked-map facts."
      },
      {
        "id": "Y5.14-transfer-2",
        "task": "Build the same explicit rescue model with 5 energy units. Charge attempted movement consistently, require the authoritative destination before collection, prevent duplicate counting and preserve blocked-map facts."
      }
    ]
  },
  "Y5.15": {
    "contentHash": "3c3e9cb947d6b574d769bf9fe4a61beaf6f670e0a60e778fab63f16c24ab10c3",
    "objective": "Find a marked location by a systematic sequence of checks.",
    "workbench": "robot",
    "essentialChecks": [
      "all candidates considered",
      "found case works",
      "absent case terminates"
    ],
    "variants": [
      {
        "id": "Y5.15-transfer-1",
        "task": "Search candidate columns zero through 5 from the supplied start. Check the initial square, advance systematically, count checks and stop correctly for a first, middle, final or absent mark."
      },
      {
        "id": "Y5.15-transfer-2",
        "task": "Search candidate columns zero through 6 from the supplied start. Check the initial square, advance systematically, count checks and stop correctly for a first, middle, final or absent mark."
      }
    ]
  },
  "Y5.16": {
    "contentHash": "33f24cbf0304b9be6a772e222b75bf146a33e1219e9cc6a8e0e0afc5c228b18b",
    "objective": "Compare two working algorithms by steps and reliability.",
    "workbench": "robot",
    "essentialChecks": [
      "same inputs used",
      "measures accurate",
      "trade-off explained"
    ],
    "variants": [
      {
        "id": "Y5.16-transfer-1",
        "task": "Compare a detour Down one, Right 3, Up 2 with a shorter Right 3, Up 1 route. Use the same start and wall for both, verify actual destinations and movement counts, and explain clear-map cost versus obstruction reliability."
      },
      {
        "id": "Y5.16-transfer-2",
        "task": "Compare a detour Down one, Right 2, Up 3 with a shorter Right 2, Up 2 route. Use the same start and wall for both, verify actual destinations and movement counts, and explain clear-map cost versus obstruction reliability."
      }
    ]
  },
  "Y5.17": {
    "contentHash": "db9771e212cb0cd7d017173dfe8debcb29db46a618b82986eab1b60ad4b84fa3",
    "objective": "Use synthetic readings to test a decision at and around a threshold.",
    "workbench": "robot",
    "essentialChecks": [
      "below correct",
      "equal correct",
      "above correct"
    ],
    "variants": [
      {
        "id": "Y5.17-transfer-1",
        "task": "Use a safety threshold of 3 cells. Preserve the actual initial reading, move Right once only strictly above it, wait at equality or below and stop. Test the supplied half-cell readings around the threshold."
      },
      {
        "id": "Y5.17-transfer-2",
        "task": "Use a safety threshold of 4 cells. Preserve the actual initial reading, move Right once only strictly above it, wait at equality or below and stop. Test the supplied half-cell readings around the threshold."
      }
    ]
  },
  "Y5.18": {
    "contentHash": "0f2785258b069f5255ac30861e001efade8efd8be4ea75c8e23af5f1f5717b10",
    "objective": "Build a rescue plan with search, state and verified safe stopping.",
    "workbench": "robot",
    "essentialChecks": [
      "mission goal met",
      "duplicates prevented",
      "safety conditions tested"
    ],
    "variants": [
      {
        "id": "Y5.18-transfer-1",
        "task": "Deliver an independent rescue mission over columns zero through 5. Preserve systematic found/absent search, actual obstacle stopping, single collection, ignored repeated requests and clean restart. Save, retrieve and replay all outcomes."
      },
      {
        "id": "Y5.18-transfer-2",
        "task": "Deliver an independent rescue mission over columns zero through 6. Preserve systematic found/absent search, actual obstacle stopping, single collection, ignored repeated requests and clean restart. Save, retrieve and replay all outcomes."
      }
    ]
  },
  "C-Y5-3-1": {
    "contentHash": "0b0902a28bbe51b320d1ea7d0618b1cc2e85c21f89c0237c68db6efd27a1c525",
    "objective": "Reconstruct sensing and movement behaviours that exchange the right units in a new scaled grid model.",
    "workbench": "robot",
    "essentialChecks": [
      "The centimetre reading follows the new scale",
      "The receiver gets cells",
      "One-cell clearance is refused before collision"
    ],
    "variants": [
      {
        "id": "C-Y5-3-1-transfer-1",
        "task": "Reconstruct the interface with 40 centimetres per grid cell. Store the actual centimetre reading, convert before the procedure call, refuse one-cell clearance and safely stop after the decision."
      },
      {
        "id": "C-Y5-3-1-transfer-2",
        "task": "Reconstruct the interface with 20 centimetres per grid cell. Store the actual centimetre reading, convert before the procedure call, refuse one-cell clearance and safely stop after the decision."
      }
    ]
  },
  "C-Y5-3-2": {
    "contentHash": "2c5a0e05229e45130329286dd67f7c5909cf3357fae7ca554122709be291655c",
    "objective": "Use a starting-square counterexample to restore a complete bounded search on a longer row.",
    "workbench": "robot",
    "essentialChecks": [
      "Column zero is checked",
      "Middle and final marks are found",
      "A complete absent search terminates with the right check count"
    ],
    "variants": [
      {
        "id": "C-Y5-3-2-transfer-1",
        "task": "Repair the skipped starting candidate for columns zero through 8. Preserve systematic middle/final search, a complete absent outcome, the actual checked count and safe stopping."
      },
      {
        "id": "C-Y5-3-2-transfer-2",
        "task": "Repair the skipped starting candidate for columns zero through 9. Preserve systematic middle/final search, a complete absent outcome, the actual checked count and safe stopping."
      }
    ]
  },
  "C-Y5-3-3": {
    "contentHash": "a24142e8018457ab2dd7679fd372d9e617413c6548008508483828bc50f12688",
    "objective": "Repair an equality decision using actual synthetic readings around a larger safety threshold.",
    "workbench": "robot",
    "essentialChecks": [
      "Below and equal readings wait",
      "Only above-threshold readings move",
      "The original reading and safe final actuator state are preserved"
    ],
    "variants": [
      {
        "id": "C-Y5-3-3-transfer-1",
        "task": "Repair a threshold of 6 grid cells. Wait at equality or below, move once only above, retain the initial real reading and stop. Verify all three supplied half-cell cases."
      },
      {
        "id": "C-Y5-3-3-transfer-2",
        "task": "Repair a threshold of 7 grid cells. Wait at equality or below, move once only above, retain the initial real reading and stop. Verify all three supplied half-cell cases."
      }
    ]
  },
  "P-Y5-3": {
    "contentHash": "f6a3fc92f52dd5602b3968fa04ef71d7a26a6e040789cb7d502c5b029bb24463",
    "objective": "Deliver a retrieved rescue simulation that distinguishes found, absent and blocked outcomes without duplicate collection.",
    "workbench": "robot",
    "essentialChecks": [
      "All candidates are considered before claiming absence",
      "Obstructions stop safely without inventing a rescue",
      "Repeated collection and a restarted mission preserve correct counts"
    ],
    "variants": [
      {
        "id": "P-Y5-3-transfer-1",
        "task": "Deliver the independent mission over columns zero through 8. Preserve found/absent/blocked distinctions, actual safe stopping, one collection, ignored repeat requests and clean restart. Save, retrieve and replay."
      },
      {
        "id": "P-Y5-3-transfer-2",
        "task": "Deliver the independent mission over columns zero through 9. Preserve found/absent/blocked distinctions, actual safe stopping, one collection, ignored repeat requests and clean restart. Save, retrieve and replay."
      }
    ]
  },
  "Y5.19": {
    "contentHash": "e4d198cb5c13862893dcff4dbb7c5b086cd3019816148b24a3f3b25ed8a034a0",
    "objective": "Follow a request across devices and distinguish network from web service.",
    "workbench": "network",
    "essentialChecks": [
      "path correct",
      "service identified",
      "fault located"
    ],
    "variants": [
      {
        "id": "Y5.19-transfer-1",
        "task": "Repair and trace Fictional museum guide's model GET /museum request to both supplied service destinations. Preserve the complete network route, web service, correctly ordered message pieces and actual selected page content."
      },
      {
        "id": "Y5.19-transfer-2",
        "task": "Repair and trace Fictional garden guide's model GET /garden request to both supplied service destinations. Preserve the complete network route, web service, correctly ordered message pieces and actual selected page content."
      }
    ]
  },
  "Y5.20": {
    "contentHash": "422918403d3a1168ee5c997678d6f13479ad38b8ad907ca10cb3acb06c534f71",
    "objective": "Use a curated index to compare support for a claim.",
    "workbench": "network",
    "essentialChecks": [
      "query effective",
      "two sources compared",
      "conclusion evidenced"
    ],
    "variants": [
      {
        "id": "Y5.20-transfer-1",
        "task": "Search museum opening days. Compare museum-a and museum-b, credit StarLiz Fictional Museum Schedule and StarLiz Fictional Museum Notice, and support the conclusion The fictional museum is closed on Mondays. Name both evidence records and reject promotion as proof."
      },
      {
        "id": "Y5.20-transfer-2",
        "task": "Search garden watering time. Compare garden-a and garden-b, credit StarLiz Fictional Garden Plan and StarLiz Fictional Gardener Record, and support the conclusion The fictional garden is watered in the morning. Name both evidence records and reject promotion as proof."
      }
    ]
  },
  "Y5.23": {
    "contentHash": "228f2c87324a75694e193b6ed35f3d8ded14bcec80de19c6ebd0b1f73352d0db",
    "objective": "Review permission, privacy and reporting in a private web-guide scenario.",
    "workbench": "scenario",
    "essentialChecks": [
      "private details removed",
      "audience limited",
      "report route clear"
    ],
    "variants": [
      {
        "id": "Y5.23-transfer-1",
        "task": "Review Fictional museum guide: remove the fictional location, keep sharing private, credit StarLiz Museum Illustration Team, practise the minimal content report and choose known trusted help. Never enter actual identifying information."
      },
      {
        "id": "Y5.23-transfer-2",
        "task": "Review Fictional garden guide: remove the fictional location, keep sharing private, credit StarLiz Garden Illustration Team, practise the minimal content report and choose known trusted help. Never enter actual identifying information."
      }
    ]
  },
  "Y5.21": {
    "contentHash": "0f4b7c319793061f180fcbbf57715e255ac1e48b3b4daa6d875e4acf9201a5fc",
    "objective": "Create headings, paragraphs, lists and a link in an isolated page.",
    "workbench": "web",
    "essentialChecks": [
      "structure valid",
      "link target safe",
      "outline meaningful"
    ],
    "variants": [
      {
        "id": "Y5.21-transfer-1",
        "task": "Create Fictional museum guide in a single main region. Use its topic as H1, an original introduction, H2 Source notes, the three stated list steps and a keyboard-usable Read source notes link to #evidence. Use real structure and no scripts or external navigation."
      },
      {
        "id": "Y5.21-transfer-2",
        "task": "Create Fictional garden guide in a single main region. Use its topic as H1, an original introduction, H2 Source notes, the three stated list steps and a keyboard-usable Read source notes link to #evidence. Use real structure and no scripts or external navigation."
      }
    ]
  },
  "Y5.22": {
    "contentHash": "24a2e7898ccfc4df5f40a1e06a6cb10c9fbba14980867a72bd4e1f49936231c7",
    "objective": "Use selectors, spacing and colour to improve a page.",
    "workbench": "web",
    "essentialChecks": [
      "selector scope correct",
      "spacing usable",
      "contrast checked"
    ],
    "variants": [
      {
        "id": "Y5.22-transfer-1",
        "task": "Style only .warning in Fictional museum guide: 22px text, 18px padding and explicit contrasting foreground/background colours. Preserve the ordinary paragraph's 18px text, zero padding and #111111 colour. Inspect both notices and the unrelated paragraph in the actual preview."
      },
      {
        "id": "Y5.22-transfer-2",
        "task": "Style only .tip in Fictional garden guide: 24px text, 20px padding and explicit contrasting foreground/background colours. Preserve the ordinary paragraph's 18px text, zero padding and #111111 colour. Inspect both notices and the unrelated paragraph in the actual preview."
      }
    ]
  },
  "Y5.24": {
    "contentHash": "b0caf3ebb3669c228111e51da8911179095d1b5dcd17387c198b07af7ade947f",
    "objective": "Combine source comparison, original text and credited media in a private webpage.",
    "workbench": "web",
    "essentialChecks": [
      "claims supported",
      "assets credited",
      "page usable"
    ],
    "variants": [
      {
        "id": "Y5.24-transfer-1",
        "task": "Create Fictional museum guide from museum-a and museum-b. State The fictional museum is closed on Mondays., compare and credit both sources, write a meaningful fictional-scope introduction and use museum.png with its provided alternative and creator credit. Preserve readable styling and local navigation, then save, retrieve and preview the complete private project."
      },
      {
        "id": "Y5.24-transfer-2",
        "task": "Create Fictional garden guide from garden-a and garden-b. State The fictional garden is watered in the morning., compare and credit both sources, write a meaningful fictional-scope introduction and use garden.png with its provided alternative and creator credit. Preserve readable styling and local navigation, then save, retrieve and preview the complete private project."
      }
    ]
  },
  "C-Y5-4-1": {
    "contentHash": "86ad47156a37a743eaee55896e80e4813927c25c79e6882939d698d8c4adcca1",
    "objective": "Reconstruct meaningful HTML structure and a working evidence-section link for a new fictional topic.",
    "workbench": "web",
    "essentialChecks": [
      "One main H1 and a coherent heading outline",
      "An original introduction and real list",
      "A meaningful link reaches the existing local evidence section"
    ],
    "variants": [
      {
        "id": "C-Y5-4-1-transfer-1",
        "task": "Retrieve the complete structure for Fictional gallery guide: one main H1, meaningful original intro, H2 Source notes, the three source-review list steps and a working Read source notes link to #evidence."
      },
      {
        "id": "C-Y5-4-1-transfer-2",
        "task": "Retrieve the complete structure for Fictional greenhouse guide: one main H1, meaningful original intro, H2 Source notes, the three source-review list steps and a working Read source notes link to #evidence."
      }
    ]
  },
  "C-Y5-4-2": {
    "contentHash": "0efd625426a3e55fb205afd98efbffa45b2345b91a2b1d3902db1b0e44ef5d8d",
    "objective": "Use actual winning style rules to remove a conflicting ID override while preserving the scoped notice design.",
    "workbench": "web",
    "essentialChecks": [
      "The first notice regains readable explicit-colour contrast",
      "The second notice retains the intended class styling",
      "The unrelated paragraph remains unchanged"
    ],
    "variants": [
      {
        "id": "C-Y5-4-2-transfer-1",
        "task": "Repair the white-on-white #notice override in Fictional gallery guide. Preserve .reminder, 24px text and 20px padding on both notices, with at least 4.5:1 contrast and the ordinary paragraph unchanged."
      },
      {
        "id": "C-Y5-4-2-transfer-2",
        "task": "Repair the white-on-white #notice override in Fictional greenhouse guide. Preserve .advice, 20px text and 16px padding on both notices, with at least 4.5:1 contrast and the ordinary paragraph unchanged."
      }
    ]
  },
  "C-Y5-4-3": {
    "contentHash": "309fe4481f7703385276148de68210fe4ba9d5ae17587953e75d4019b8df6d08",
    "objective": "Repair an unsupported conclusion while retaining the correct selected records, credits and purposeful query.",
    "workbench": "network",
    "essentialChecks": [
      "The answer agrees with both actual supplied records",
      "The explanation identifies both records and their agreeing claim",
      "Promotion remains separate from evidential support"
    ],
    "variants": [
      {
        "id": "C-Y5-4-3-transfer-1",
        "task": "Repair Fictional gallery guide's unsupported universal conclusion. Keep the actual selected records, source credits and gallery opening day query, then connect gallery-a and gallery-b to their agreed claim The fictional gallery opens on Tuesdays."
      },
      {
        "id": "C-Y5-4-3-transfer-2",
        "task": "Repair Fictional greenhouse guide's unsupported universal conclusion. Keep the actual selected records, source credits and greenhouse watering evening query, then connect greenhouse-a and greenhouse-b to their agreed claim The fictional greenhouse is watered in the evening."
      }
    ]
  },
  "P-Y5-4": {
    "contentHash": "dd003a1f64a1f9b890e4b0a6478918a281c7d7fcc98d7c26b2e67c8ed0d6e919",
    "objective": "Deliver a retrieved private guide combining original explanation, compared source evidence, permitted media and usable local navigation.",
    "workbench": "web",
    "essentialChecks": [
      "The actual claim and both cited records agree",
      "The supplied illustration resolves with its correct alternative and creator credit",
      "Readable styles and local navigation survive whole-project retrieval"
    ],
    "variants": [
      {
        "id": "P-Y5-4-transfer-1",
        "task": "Deliver Fictional gallery guide from the two supplied records. Support The fictional gallery opens on Tuesdays., write a meaningful fictional-scope introduction, credit both sources and the supplied gallery.png illustration, and preserve accessible structure and readable styling. Save, retrieve and replay the whole private project."
      },
      {
        "id": "P-Y5-4-transfer-2",
        "task": "Deliver Fictional greenhouse guide from the two supplied records. Support The fictional greenhouse is watered in the evening., write a meaningful fictional-scope introduction, credit both sources and the supplied greenhouse.png illustration, and preserve accessible structure and readable styling. Save, retrieve and replay the whole private project."
      }
    ]
  },
  "Y6.06": {
    "contentHash": "0ce879b8443d8ca3699639ab342b4cb97a77beb32d08d8c043f00001e0670a30",
    "objective": "Build and document three functions used by a small program.",
    "workbench": "python",
    "essentialChecks": [
      "components pass checks",
      "integration works",
      "reuse explained"
    ],
    "variants": [
      {
        "id": "Y6.06-transfer-1",
        "task": "Deliver a fresh three-component toolkit whose scale(value) multiplies by 5. Integrate total and describe, test two independent collections including empty input, preserve outside, and save the supplied input/output contract in toolkit.txt. Retrieve and replay."
      },
      {
        "id": "Y6.06-transfer-2",
        "task": "Deliver a fresh three-component toolkit whose scale(value) multiplies by 7. Integrate total and describe, test two independent collections including empty input, preserve outside, and save the supplied input/output contract in toolkit.txt. Retrieve and replay."
      }
    ]
  },
  "Y6.19": {
    "contentHash": "702d141ec5595dae655f10c6ac7f3d6add96ea1a44c280c1467c71e357c1ba75",
    "objective": "Convert a calculator user's needs into practical acceptance checks.",
    "workbench": "python",
    "essentialChecks": [
      "needs explicit",
      "normal and invalid cases covered",
      "evidence saved"
    ],
    "variants": [
      {
        "id": "Y6.19-transfer-1",
        "task": "Design and run acceptance checks for a different maker tool: multiply numbers in 0..12 by 4. Reject other values. Include 2, 0, 12, 13 and bad with independently chosen expected results. Save the contract and executed evidence in acceptance.json and calculate supplied probe."
      },
      {
        "id": "Y6.19-transfer-2",
        "task": "Design and run acceptance checks for a different maker tool: multiply numbers in 0..16 by 5. Reject other values. Include 2, 0, 16, 17 and bad with independently chosen expected results. Save the contract and executed evidence in acceptance.json and calculate supplied probe."
      }
    ]
  },
  "Y6.20": {
    "contentHash": "9831f86c1473eb86f39d2c4fb631de574820513495be2ba4190bc9d4c3c33cf3",
    "objective": "Combine tested functions, input handling and output presentation.",
    "workbench": "python",
    "essentialChecks": [
      "units agree",
      "correct result shown",
      "invalid input handled"
    ],
    "variants": [
      {
        "id": "Y6.20-transfer-1",
        "task": "Build a material flow for 4 equal lengths. Validate supplied raw text in 0..1000, convert supplied unit m/cm to metres, multiply by 4 and round only the final quantity to four decimals. Return the exact valid/result/message contract and reject unknown units or invalid lengths."
      },
      {
        "id": "Y6.20-transfer-2",
        "task": "Build a material flow for 6 equal lengths. Validate supplied raw text in 0..1000, convert supplied unit m/cm to metres, multiply by 6 and round only the final quantity to four decimals. Return the exact valid/result/message contract and reject unknown units or invalid lengths."
      }
    ]
  },
  "Y6.21": {
    "contentHash": "1e7dbf4a97dbba93a4445cbfbf1c8c2399303b9889de996d48f6ab0d3183d042",
    "objective": "Predict a calculation across component boundaries.",
    "workbench": "python",
    "essentialChecks": [
      "states correct",
      "error located",
      "corrected result verified"
    ],
    "variants": [
      {
        "id": "Y6.21-transfer-1",
        "task": "Trace another estimate at rate 9. Convert supplied centimetres, calculate subtotal and combined using supplied pieces without intermediate rounding, then round only final to two decimals. Record the four actual step/value states and locate the early-rounding fault."
      },
      {
        "id": "Y6.21-transfer-2",
        "task": "Trace another estimate at rate 11. Convert supplied centimetres, calculate subtotal and combined using supplied pieces without intermediate rounding, then round only final to two decimals. Record the four actual step/value states and locate the early-rounding fault."
      }
    ]
  },
  "Y6.22": {
    "contentHash": "1a05b622d8030149cb2ed875d4169239407c15b6f8262002d421fce213457a98",
    "objective": "Use private version history and respectful review to recover a mistaken edit.",
    "workbench": "engineering",
    "essentialChecks": [
      "right version restored",
      "authorship retained",
      "feedback respectful"
    ],
    "variants": [
      {
        "id": "Y6.22-transfer-1",
        "task": "Recover the Ribbon calculator using its actual supplied history. Select and restore v1, snapshot v3 as Fictional editor, retain both earlier revisions and Fictional River contributor's attribution. Run normal and zero tests. Record this specific respectful review: The ribbon conversion multiplies by 100; restore v1 so it divides by 100."
      },
      {
        "id": "Y6.22-transfer-2",
        "task": "Recover the Border calculator using its actual supplied history. Select and restore v1, snapshot v3 as Fictional editor, retain both earlier revisions and Fictional Meadow contributor's attribution. Run normal and zero tests. Record this specific respectful review: The border conversion multiplies by 100; restore v1 so it divides by 100."
      }
    ]
  },
  "Y6.23": {
    "contentHash": "74c1249f2620d7586e366ca0bb8d3b55512a9ac5a7bfa05c36e870e2f9a3cb23",
    "objective": "Record why chosen tools, sources and sharing settings fit the project.",
    "workbench": "scenario",
    "essentialChecks": [
      "choices justified",
      "source judged",
      "safety response appropriate"
    ],
    "variants": [
      {
        "id": "Y6.23-transfer-1",
        "task": "Review Ribbon calculator. Choose its measured permitted source, credit Fictional Ribbon Group and cite “Recorded ribbon lengths and reproducible conversion tests.”. Justify keyboard input and Python functions. Remove secret fields, keep private, recognise earlier copies, stop interaction and report content using only “The fictional project page contains unsuitable material.”, with trusted adult help."
      },
      {
        "id": "Y6.23-transfer-2",
        "task": "Review Border calculator. Choose its measured permitted source, credit Fictional Border Group and cite “Recorded border measurements and reproducible test results.”. Justify keyboard input and Python functions. Remove secret fields, keep private, recognise earlier copies, stop interaction and report conduct using only “Repeated unkind messages about the fictional calculator project.”, with trusted adult help."
      }
    ]
  },
  "Y6.24": {
    "contentHash": "d4bec3cc849583a184285ba5bfa28c58ee07c35b0994d04858b5805567f4644b",
    "objective": "Deliver a working calculator and a private page explaining its evidence.",
    "workbench": "python",
    "essentialChecks": [
      "tool passes tests",
      "change independent",
      "portfolio matches artifact"
    ],
    "variants": [
      {
        "id": "Y6.24-transfer-1",
        "task": "Independently change the calculator to find the total area of 2 equal rectangles. Validate and convert both supplied dimensions, multiply the single area by 2 before final rounding, update the executed test expectations and generate a matching private HTML page plus area-evidence.json. Reject invalid dimensions and unsupported units without inventing an area."
      },
      {
        "id": "Y6.24-transfer-2",
        "task": "Independently change the calculator to find the total area of 3 equal rectangles. Validate and convert both supplied dimensions, multiply the single area by 3 before final rounding, update the executed test expectations and generate a matching private HTML page plus area-evidence.json. Reject invalid dimensions and unsupported units without inventing an area."
      }
    ]
  },
  "C-Y6-4-1": {
    "contentHash": "2f906e1e81aa4b5606f721eaaaf1e6424b015739c9f41b79e3301a58198f558f",
    "objective": "Reconstruct an acceptance suite that accepts a conforming component and exposes two distinct boundary defects in a suspect component.",
    "workbench": "python",
    "essentialChecks": [
      "Expected results come from the range contract",
      "The same suite accepts the correct component and rejects the suspect",
      "Actual outcomes identify both invalid boundaries"
    ],
    "variants": [
      {
        "id": "C-Y6-4-1-transfer-1",
        "task": "Compare two different tools claiming multiplication by 4 on the inclusive range 0..12. Reconstruct the five-case suite for 2, 0, -1, 13 and bad. Record both actual outcomes and identify each suspect failure; also calculate supplied probe using correct."
      },
      {
        "id": "C-Y6-4-1-transfer-2",
        "task": "Compare two different tools claiming multiplication by 6 on the inclusive range 0..15. Reconstruct the five-case suite for 2, 0, -1, 16 and bad. Record both actual outcomes and identify each suspect failure; also calculate supplied probe using correct."
      }
    ]
  },
  "C-Y6-4-2": {
    "contentHash": "c0cde10d65b06041662217a28ef8cbd2a3a516ec162b190c3eae4e1031df4ebd",
    "objective": "Integrate validation, per-record unit conversion and an auditable total without discarding valid zeros.",
    "workbench": "python",
    "essentialChecks": [
      "Each reading uses its own unit",
      "Valid zero is accepted while invalid input is rejected",
      "The total and audit agree"
    ],
    "variants": [
      {
        "id": "C-Y6-4-2-transfer-1",
        "task": "Repair the mixed-unit tool for an inclusive raw-value limit of 200. Validate each supplied reading, divide cm by 100, keep m unchanged, accept zero, audit every row and sum only accepted metre values before rounding to four decimals."
      },
      {
        "id": "C-Y6-4-2-transfer-2",
        "task": "Repair the mixed-unit tool for an inclusive raw-value limit of 500. Validate each supplied reading, divide cm by 100, keep m unchanged, accept zero, audit every row and sum only accepted metre values before rounding to four decimals."
      }
    ]
  },
  "C-Y6-4-3": {
    "contentHash": "7430c843dcd8db1fbbdebd91b498e2e9c440e4151b99851c1f0d25b1d927074c",
    "objective": "Read, validate, use and round-trip a real saved settings file without trusting malformed or incompatible content.",
    "workbench": "python",
    "essentialChecks": [
      "Valid saved rate and units are used",
      "Malformed or invalid settings select explicit safe defaults",
      "The written settings and evidence match the actual calculation"
    ],
    "variants": [
      {
        "id": "C-Y6-4-3-transfer-1",
        "task": "Implement safe resume with default rate 5 and unit m. Read actual settings.json, require exactly a finite rate in (0,20] plus unit m/cm, and distinguish saved from defaults. Calculate supplied length, write and reread settings, then save matching four-decimal resume-evidence.txt."
      },
      {
        "id": "C-Y6-4-3-transfer-2",
        "task": "Implement safe resume with default rate 7 and unit m. Read actual settings.json, require exactly a finite rate in (0,20] plus unit m/cm, and distinguish saved from defaults. Calculate supplied length, write and reread settings, then save matching four-decimal resume-evidence.txt."
      }
    ]
  },
  "P-Y6-4": {
    "contentHash": "05c08b422ce860471150b6e256db7060946d5d253ba43de868e4e7e0c259ed5f",
    "objective": "Deliver a reusable validated calculator and a private evidence page that accurately reports independently tested multi-component results.",
    "workbench": "python",
    "essentialChecks": [
      "Input contracts and units agree across components",
      "Area, perimeter and reserve are calculated independently",
      "Executed tests, saved evidence and private page agree"
    ],
    "variants": [
      {
        "id": "P-Y6-4-transfer-1",
        "task": "Independently change the fictional plot planner to include 15% material reserve. Preserve input validation, both-dimension conversion, full independent edge calculation and count limits. Update actual test expectations, matching four-decimal summary, private HTML evidence page and plot-plan.json. The edge still has no material-reserve multiplier."
      },
      {
        "id": "P-Y6-4-transfer-2",
        "task": "Independently change the fictional plot planner to include 20% material reserve. Preserve input validation, both-dimension conversion, full independent edge calculation and count limits. Update actual test expectations, matching four-decimal summary, private HTML evidence page and plot-plan.json. The edge still has no material-reserve multiplier."
      }
    ]
  },
  "Y6.10": {
    "contentHash": "826226b07e86a25ecc8568e0ed6969c8221de0eb36c537bff868aef562b2d1f3",
    "objective": "Connect a portfolio claim to its actual saved artifact.",
    "workbench": "web",
    "essentialChecks": [
      "target correct",
      "label meaningful",
      "private access preserved"
    ],
    "variants": [
      {
        "id": "Y6.10-transfer-1",
        "task": "Choose a different earlier saved creation for independent work. Build the heading My private story evidence; link and caption that actual creation using its exact selected title, #saved-first and data-starliz-evidence first. Preserve private access and inspect the actual frozen artifact."
      },
      {
        "id": "Y6.10-transfer-2",
        "task": "Choose a different earlier saved creation for independent work. Build the heading My private investigation evidence; link and caption that actual creation using its exact selected title, #saved-first and data-starliz-evidence first. Preserve private access and inspect the actual frozen artifact."
      }
    ]
  },
  "Y6.12": {
    "contentHash": "e207e3b450ccbca1e5eef1ca215a316b9a108243152deac39a6379192245f585",
    "objective": "Present two saved creations with captions, credit and accessible navigation.",
    "workbench": "web",
    "essentialChecks": [
      "evidence links correct",
      "accessibility checks pass",
      "privacy maintained"
    ],
    "variants": [
      {
        "id": "Y6.12-transfer-1",
        "task": "Create My private story evidence using two different earlier saved creations. Give each slot its actual selected title, meaningful evidence link, unique caption and private frozen target. Preserve semantic navigation, the supplied museum.png illustration, its alternative and StarLiz Museum Illustration Team's credit. Verify both real linked artifacts and the full layout at three widths."
      },
      {
        "id": "Y6.12-transfer-2",
        "task": "Create My private investigation evidence using two different earlier saved creations. Give each slot its actual selected title, meaningful evidence link, unique caption and private frozen target. Preserve semantic navigation, the supplied garden.png illustration, its alternative and StarLiz Garden Illustration Team's credit. Verify both real linked artifacts and the full layout at three widths."
      }
    ]
  },
  "C-Y6-2-1": {
    "contentHash": "bdfa650d63510655de2a8044a45ef42ec2af696d337f9b8ba21a2ebbdf502642",
    "objective": "Reconstruct the relationship between a meaningful link, its unique target, a matching caption and an actual frozen creation.",
    "workbench": "web",
    "essentialChecks": [
      "The label names the selected actual creation",
      "The local target and caption agree with the frozen slot",
      "Private ownership is preserved"
    ],
    "variants": [
      {
        "id": "C-Y6-2-1-transfer-1",
        "task": "Create Story evidence I can retrieve. Select a different earlier creation, replace the vague label with its exact selected title and reconstruct its local frozen-evidence target and matching caption. Verify the actual saved source and result without changing its audience."
      },
      {
        "id": "C-Y6-2-1-transfer-2",
        "task": "Create Investigation evidence I can retrieve. Select a different earlier creation, replace the vague label with its exact selected title and reconstruct its local frozen-evidence target and matching caption. Verify the actual saved source and result without changing its audience."
      }
    ]
  },
  "C-Y6-2-2": {
    "contentHash": "a90676082133354dab8b92c8977d41d9f88d4b2aa033ac934ed4c306dc2e99b2",
    "objective": "Diagnose duplicate identifiers and restore two distinct accessible links to the correct frozen creations.",
    "workbench": "web",
    "essentialChecks": [
      "Both sections have distinct identifiers",
      "Each descriptive link and caption resolves to its own saved creation",
      "The permitted illustration and credit remain intact"
    ],
    "variants": [
      {
        "id": "C-Y6-2-2-transfer-1",
        "task": "Repair Two unambiguous story targets with two different earlier creations. Restore distinct saved-first and saved-second targets, meaningful actual-title labels and matching unique captions while preserving privacy, media and credit. Inspect each actual frozen artifact."
      },
      {
        "id": "C-Y6-2-2-transfer-2",
        "task": "Repair Two unambiguous investigation targets with two different earlier creations. Restore distinct saved-first and saved-second targets, meaningful actual-title labels and matching unique captions while preserving privacy, media and credit. Inspect each actual frozen artifact."
      }
    ]
  },
  "C-Y6-2-3": {
    "contentHash": "8cb00cf9746bbb42cf1626ad4d64ba853b46158c9a3e250f7cd321d594c788b0",
    "objective": "Repair measurable navigation readability and source attribution while retaining correct private evidence links.",
    "workbench": "web",
    "essentialChecks": [
      "Actual links have readable contrasting text",
      "The actual permitted illustration is correctly credited",
      "Both real evidence relationships survive and a concrete re-test is recorded"
    ],
    "variants": [
      {
        "id": "C-Y6-2-3-transfer-1",
        "task": "Repair A readable and credited story portfolio: readable contrasting actual-title links, StarLiz Museum Illustration Team's actual illustration credit and two correct private frozen relationships. Record a keyboard re-test after trying the full page at three widths."
      },
      {
        "id": "C-Y6-2-3-transfer-2",
        "task": "Repair A readable and credited investigation portfolio: readable contrasting actual-title links, StarLiz Garden Illustration Team's actual illustration credit and two correct private frozen relationships. Record a keyboard re-test after trying the full page at three widths."
      }
    ]
  },
  "P-Y6-2": {
    "contentHash": "f8b247fe8e6a9df27c7da48eedb11759893129fe6240d30adb37987e804bfe2a",
    "objective": "Deliver a complete private portfolio page whose two real frozen creations, captions, navigation, media rights and design explanation agree.",
    "workbench": "web",
    "essentialChecks": [
      "Two different actual creations are correctly linked and captioned",
      "Semantic readable navigation and permitted credited media are functional",
      "The private audience and publication permission are explained accurately"
    ],
    "variants": [
      {
        "id": "P-Y6-2-transfer-1",
        "task": "Deliver My private story and evidence portfolio using two different earlier creations. Independently build the complete matching captions, protected links and design explanation; preserve readable semantic navigation, private access and correct illustration attribution. Explain why private access does not permit publication and verify both real saved outcomes at three widths."
      },
      {
        "id": "P-Y6-2-transfer-2",
        "task": "Deliver My private investigation and evidence portfolio using two different earlier creations. Independently build the complete matching captions, protected links and design explanation; preserve readable semantic navigation, private access and correct illustration attribution. Explain why private access does not permit publication and verify both real saved outcomes at three widths."
      }
    ]
  },
  "Y7.01": {
    "contentHash": "cf7ddfb5c98e18950a16c51b81a2341ca1740220deefdfdf46be035b8cf78eb1",
    "objective": "Demonstrate prior Python skills by translating a visual algorithm and passing a transfer task.",
    "workbench": "dual",
    "essentialChecks": [
      "transfer output correct",
      "fault repaired",
      "prior competence recorded"
    ],
    "variants": [
      {
        "id": "Y7.01-transfer-1",
        "task": "Translate the new visual update of 5 per round into Python. Preserve supplied start, use exactly rounds updates, print energy and verify both actual representations on zero and repeated rounds."
      },
      {
        "id": "Y7.01-transfer-2",
        "task": "Translate the new visual update of -2 per round into Python. Preserve supplied start, use exactly rounds updates, print energy and verify both actual representations on zero and repeated rounds."
      }
    ]
  },
  "Y7.02": {
    "contentHash": "a89f6e784e93c9b4d160735167e4b275be80d78ed13b217737877dbfab63023e",
    "objective": "Handle expected, boundary and invalid inputs without hidden coercion.",
    "workbench": "python",
    "essentialChecks": [
      "normal input accepted",
      "boundary handled",
      "invalid rejected"
    ],
    "variants": [
      {
        "id": "Y7.02-transfer-1",
        "task": "Implement a new ASCII whole-number text contract on the inclusive range 1..12. Strip outer whitespace, reject blank or unsupported input without coercion, return an integer or None and record valid using an explicit None check."
      },
      {
        "id": "Y7.02-transfer-2",
        "task": "Implement a new ASCII whole-number text contract on the inclusive range 2..8. Strip outer whitespace, reject blank or unsupported input without coercion, return an integer or None and record valid using an explicit None check."
      }
    ]
  },
  "Y7.03": {
    "contentHash": "465477b77ac56e4a54ea9a0ec3a886f83fe56d93a1f323be006e73a5c8a5a916",
    "objective": "Build combined conditions and verify their truth cases.",
    "workbench": "python",
    "essentialChecks": [
      "truth cases correct",
      "boundary tested",
      "logic explained"
    ],
    "variants": [
      {
        "id": "Y7.03-transfer-1",
        "task": "Require active, then allow either not locked or manual, with attempts from zero through four inclusive. Implement allowed and an actual exhaustive truth table using attempts -1, 0, 3 and 4, then calculate supplied result."
      },
      {
        "id": "Y7.03-transfer-2",
        "task": "Require either active or manual, then require not locked, with attempts from zero up to but excluding five. Implement allowed and an actual exhaustive truth table using attempts -1, 0, 4 and 5, then calculate supplied result."
      }
    ]
  },
  "Y7.04": {
    "contentHash": "017bd06c21ee71a0ce1eea2a2bb830534972595286410b0add5897b8b73a6307",
    "objective": "Use indexed and direct traversal appropriately.",
    "workbench": "python",
    "essentialChecks": [
      "all items handled",
      "empty list safe",
      "output correct"
    ],
    "variants": [
      {
        "id": "Y7.04-transfer-1",
        "task": "Process both supplied lists into positions with displayed position index plus 1 and value multiplied by 3. Separately sum original values directly, report count and preserve readings. Handle empty and single-item lists without skipping the final element."
      },
      {
        "id": "Y7.04-transfer-2",
        "task": "Process both supplied lists into positions with displayed position index plus 0 and value multiplied by -1. Separately sum original values directly, report count and preserve readings. Handle empty and single-item lists without skipping the final element."
      }
    ]
  },
  "Y7.05": {
    "contentHash": "064180a72e1ad2c313e17e29494c69e60986e251fa7d18355d842bbb0a5f59fc",
    "objective": "Decompose a task into functions with testable interfaces.",
    "workbench": "python",
    "essentialChecks": [
      "two calls correct",
      "interface respected",
      "isolated test passes"
    ],
    "variants": [
      {
        "id": "Y7.05-transfer-1",
        "task": "Implement a new summary module whose total is the sum of original items multiplied by 2; mean is that transformed total divided by count or None. Preserve the count/total/mean record, two independent calls, exact formatted description and isolated empty test."
      },
      {
        "id": "Y7.05-transfer-2",
        "task": "Implement a new summary module whose total is the sum of original items multiplied by 3; mean is that transformed total divided by count or None. Preserve the count/total/mean record, two independent calls, exact formatted description and isolated empty test."
      }
    ]
  },
  "Y7.06": {
    "contentHash": "abc7764f374ec6092bd7f346b133476d5d4cc9f93848465d60a7f59f86e77ec2",
    "objective": "Build a quiz with stored questions, validated input and accurate scoring.",
    "workbench": "python",
    "essentialChecks": [
      "scoring correct",
      "modules tested",
      "replay resets state"
    ],
    "variants": [
      {
        "id": "Y7.06-transfer-1",
        "task": "Independently add the true-false question type in the supplied real bank and imported normaliser. Accept only true or false text after trimming and lower-casing; False remains a valid answer. Preserve correct choice validation, independent replay scoring, unchanged bank and the actual saved evidence file."
      },
      {
        "id": "Y7.06-transfer-2",
        "task": "Independently add the integer question type in the supplied real bank and imported normaliser. Accept ASCII whole-integer text with an optional single leading minus; zero remains valid. Preserve correct choice validation, independent replay scoring, unchanged bank and the actual saved evidence file."
      }
    ]
  },
  "Y8.19": {
    "contentHash": "8f80b20c0aeae394c140cbe1d86122099789a54c5aee311c731b363c5707f1ff",
    "objective": "Convert a fictional community need into measurable requirements.",
    "workbench": "web",
    "essentialChecks": [
      "needs explicit",
      "constraints stated",
      "acceptance checks measurable"
    ],
    "variants": [
      {
        "id": "Y8.19-transfer-1",
        "task": "Specify and implement Museum card planner for a fictional museum workshop organiser: prepare enough display cards without collecting visitor details. Preserve the supplied factor 4, whole bounds 0..8, private scope and actual invalidation behaviour. Show user benefit and measurable acceptance in the saved page, then test actual interactions."
      },
      {
        "id": "Y8.19-transfer-2",
        "task": "Specify and implement Garden label planner for a fictional garden-club organiser: prepare enough plant labels without collecting gardener details. Preserve the supplied factor 2, whole bounds 0..12, private scope and actual invalidation behaviour. Show user benefit and measurable acceptance in the saved page, then test actual interactions."
      }
    ]
  },
  "Y8.23": {
    "contentHash": "7723835c8c2dedd4913cc4f13cb061caea792d6a1b6a329456cee5e834690719",
    "objective": "Interpret provided user-test records and retest a repair across widths.",
    "workbench": "web",
    "essentialChecks": [
      "defect reproduced",
      "repair works",
      "regression checked"
    ],
    "variants": [
      {
        "id": "Y8.23-transfer-1",
        "task": "Repair the keyboard regression in Museum card planner without changing its supplied calculation. Verify actual native control semantics, zero, upper bound, stale-output clearing and persistent feedback, then perform the stated three-width browser keyboard retest."
      },
      {
        "id": "Y8.23-transfer-2",
        "task": "Repair the keyboard regression in Garden label planner without changing its supplied calculation. Verify actual native control semantics, zero, upper bound, stale-output clearing and persistent feedback, then perform the stated three-width browser keyboard retest."
      }
    ]
  },
  "Y8.20": {
    "contentHash": "7a061824bc3cca0495939575d91c1a4ace19875e48db8c90785b28646a1ff3f5",
    "objective": "Create, compare and restore named project versions.",
    "workbench": "engineering",
    "essentialChecks": [
      "versions identifiable",
      "intended change recovered",
      "attribution retained"
    ],
    "variants": [
      {
        "id": "Y8.20-transfer-1",
        "task": "Recover Museum card planner's correct factor-4 calculation while preserving the improved label. Retain both originals, checkpoint beforeRestore and a new combined version; run zero and upper-bound tests on the actual recovered source."
      },
      {
        "id": "Y8.20-transfer-2",
        "task": "Recover Garden label planner's correct factor-2 calculation while preserving the improved label. Retain both originals, checkpoint beforeRestore and a new combined version; run zero and upper-bound tests on the actual recovered source."
      }
    ]
  },
  "Y8.22": {
    "contentHash": "1b33f5ee663c314cd6a1334d9d558b3612fd74e0d91dbe5195353bae381d4068",
    "objective": "Apply least-privilege and secure-sharing choices in a local scenario.",
    "workbench": "engineering",
    "essentialChecks": [
      "least privilege met",
      "secrets absent",
      "report route clear"
    ],
    "variants": [
      {
        "id": "Y8.22-transfer-1",
        "task": "Protect Museum card planner's actual project file. Refuse viewer/anonymous edits even when claimedRole says owner, permit the authoritative owner and return no files to anonymous callers. Retain the trusted reporting and revocation note; use no real secrets."
      },
      {
        "id": "Y8.22-transfer-2",
        "task": "Protect Garden label planner's actual project file. Refuse viewer/anonymous edits even when claimedRole says owner, permit the authoritative owner and return no files to anonymous callers. Retain the trusted reporting and revocation note; use no real secrets."
      }
    ]
  },
  "Y8.21": {
    "contentHash": "e6a6f5d8123c3b8ab5d7250fc94ec36cf9544ae823ec03fd7962cf7ff872e9f0",
    "objective": "Review a peer fixture using behaviour, clarity and respectful evidence.",
    "workbench": "portfolio",
    "essentialChecks": [
      "defect evidenced",
      "feedback respectful",
      "repair verifiable"
    ],
    "variants": [
      {
        "id": "Y8.21-transfer-1",
        "task": "Review the fictional factor-4 submission for Museum card planner. Execute the peer and repaired functions on every supplied count; withhold approval on demonstrated failures and provide respectful, precise repair and retest feedback."
      },
      {
        "id": "Y8.21-transfer-2",
        "task": "Review the fictional factor-2 submission for Garden label planner. Execute the peer and repaired functions on every supplied count; withhold approval on demonstrated failures and provide respectful, precise repair and retest feedback."
      }
    ]
  },
  "Y8.24": {
    "contentHash": "bf6ed899a20a1f9645be27050a7d1fda475bd3448b77f9bdf9fbcd97fbf7449d",
    "objective": "Deliver a private interactive tool with tests, version history and user evidence.",
    "workbench": "web",
    "essentialChecks": [
      "requirements met",
      "regressions pass",
      "user evidence documented"
    ],
    "variants": [
      {
        "id": "Y8.24-transfer-1",
        "task": "Deliver Museum card planner with its original calculation plus actual shortage/spare comparison. Preserve zero, bounds, labels, persistent invalidation feedback and original user benefit; demonstrate old and new tests and a real private save/replay/restore."
      },
      {
        "id": "Y8.24-transfer-2",
        "task": "Deliver Garden label planner with its original calculation plus actual shortage/spare comparison. Preserve zero, bounds, labels, persistent invalidation feedback and original user benefit; demonstrate old and new tests and a real private save/replay/restore."
      }
    ]
  },
  "C-Y8-4-1": {
    "contentHash": "613b9cd6eed514b0e2c852c3113186d4204ae1f4be817551297a7d6e48a6214d",
    "objective": "Integrate a supply-budget constraint without confusing participant counts and supply quantities.",
    "workbench": "web",
    "essentialChecks": [
      "Original calculation remains correct",
      "Budget compares computed supplies",
      "Zero and exact-budget boundaries are retained"
    ],
    "variants": [
      {
        "id": "C-Y8-4-1-transfer-1",
        "task": "Add the stated supply-unit session limit to Museum card planner. Preserve the original calculation and distinguish valid input from an over-budget requirement."
      },
      {
        "id": "C-Y8-4-1-transfer-2",
        "task": "Add the stated supply-unit session limit to Garden label planner. Preserve the original calculation and distinguish valid input from an over-budget requirement."
      }
    ]
  },
  "C-Y8-4-2": {
    "contentHash": "912e22946f0582433ce4b127804b2aaf1b38282761f58d27ed82a4503f5a7f2a",
    "objective": "Preserve user-entered stock while invalidating a comparison made from an earlier participant count.",
    "workbench": "web",
    "essentialChecks": [
      "Changed participant input clears the old comparison",
      "Persistent feedback requests recomputation",
      "Independent stock input remains"
    ],
    "variants": [
      {
        "id": "C-Y8-4-2-transfer-1",
        "task": "In Museum card planner, invalidate the previous comparison when the participant input changes, preserve available stock and request an explicit new comparison."
      },
      {
        "id": "C-Y8-4-2-transfer-2",
        "task": "In Garden label planner, invalidate the previous comparison when the participant input changes, preserve available stock and request an explicit new comparison."
      }
    ]
  },
  "C-Y8-4-3": {
    "contentHash": "86d415c8992ae3a7f59054da481eeafcd4cded4730be1aa8f80e00cf3502b55c",
    "objective": "Replace blanket rejection with a scoped decision based on fresh execution of corrected fictional peer code.",
    "workbench": "portfolio",
    "essentialChecks": [
      "Corrected peer code actually runs",
      "Approval follows the current test results",
      "Review does not claim exhaustive correctness"
    ],
    "variants": [
      {
        "id": "C-Y8-4-3-transfer-1",
        "task": "Re-evaluate the corrected factor-4 submission from actual supplied executions. Approve matching results and retain the limits of this evidence."
      },
      {
        "id": "C-Y8-4-3-transfer-2",
        "task": "Re-evaluate the corrected factor-2 submission from actual supplied executions. Approve matching results and retain the limits of this evidence."
      }
    ]
  },
  "P-Y8-4": {
    "contentHash": "409914aff0dd0dfb2b002fe39cb8b9208f3eed1c1e33f02a0d79bccae491908f",
    "objective": "Build and retain a small private collection of validated fictional planning scenarios with current-input calculations and immutable earlier records.",
    "workbench": "web",
    "essentialChecks": [
      "Each scenario uses current validated numeric inputs",
      "Previously recorded scenarios remain unchanged",
      "No stale displayed comparison or personal fields enter a record",
      "Invalid later input is refused without erasing the collection"
    ],
    "variants": [
      {
        "id": "P-Y8-4-transfer-1",
        "task": "Deliver Museum card planner's private scenario portfolio. Store only the specified validated current numeric fields and unit, compute fresh quantities, retain previous records and reject invalid later saves. Demonstrate actual private workspace save/replay/restore separately from in-run scenario snapshots."
      },
      {
        "id": "P-Y8-4-transfer-2",
        "task": "Deliver Garden label planner's private scenario portfolio. Store only the specified validated current numeric fields and unit, compute fresh quantities, retain previous records and reject invalid later saves. Demonstrate actual private workspace save/replay/restore separately from in-run scenario snapshots."
      }
    ]
  },
  "Y9.01": {
    "contentHash": "8fbb9d214a534d20902d6379a23afee4343b7235adb7d86eb8e95df0214b9c93",
    "objective": "Select lists or keyed records for stated operations.",
    "workbench": "python",
    "essentialChecks": [
      "operations supported",
      "values preserved",
      "choice justified"
    ],
    "variants": [
      {
        "id": "Y9.01-transfer-1",
        "task": "Preserve the ordered synthetic rows and build a duplicate-preserving route index with explicit empty lookup results."
      },
      {
        "id": "Y9.01-transfer-2",
        "task": "Preserve the ordered synthetic rows and build a duplicate-preserving material index with explicit empty lookup results."
      }
    ]
  },
  "Y9.02": {
    "contentHash": "7096cd842e999fc83b7704833edfc9a9c7ac63e46cacc8ed9c30246f5215a624",
    "objective": "Implement binary search and check its ordering precondition.",
    "workbench": "python",
    "essentialChecks": [
      "found correct",
      "absent handled",
      "precondition checked"
    ],
    "variants": [
      {
        "id": "Y9.02-transfer-1",
        "task": "Implement checked first-occurrence binary search for the new shifted dataset. Preserve original indices, reject unsorted input and separately report precondition checks and actual probes."
      },
      {
        "id": "Y9.02-transfer-2",
        "task": "Implement checked first-occurrence binary search for the new shifted dataset. Preserve original indices, reject unsorted input and separately report precondition checks and actual probes."
      }
    ]
  },
  "Y9.03": {
    "contentHash": "a023d99d642c1bf0696232809d7a32e4872aa62cfced2e61e20b36b43168ce47",
    "objective": "Implement and compare two sorting strategies using trace counts.",
    "workbench": "python",
    "essentialChecks": [
      "outputs correct",
      "measures comparable",
      "conclusions justified"
    ],
    "variants": [
      {
        "id": "Y9.03-transfer-1",
        "task": "Compare the real insertion and selection implementations on the new identical datasets, preserving original values and copied passes. Count value comparisons consistently and report swaps separately without universal timing claims."
      },
      {
        "id": "Y9.03-transfer-2",
        "task": "Compare the real insertion and selection implementations on the new identical datasets, preserving original values and copied passes. Count value comparisons consistently and report swaps separately without universal timing claims."
      }
    ]
  },
  "Y9.04": {
    "contentHash": "aef2dbbc5646aad165cd1a8b023b47c378e455163f92417e22a5ec7da084968e",
    "objective": "Compare operation counts as dataset size grows.",
    "workbench": "python",
    "essentialChecks": [
      "counts correct",
      "pattern described",
      "claim limitations stated"
    ],
    "variants": [
      {
        "id": "Y9.04-transfer-1",
        "task": "Run the same controlled last-item experiment for the new supplied sizes. Preserve all actual counters and explain probe growth, validation work and the limits of count-only evidence."
      },
      {
        "id": "Y9.04-transfer-2",
        "task": "Run the same controlled last-item experiment for the new supplied sizes. Preserve all actual counters and explain probe growth, validation work and the limits of count-only evidence."
      }
    ]
  },
  "Y9.05": {
    "contentHash": "0fbc3a4e1d2a4426c9fbd93f11a572e199432ae18718ca480cbe9400d48d15e0",
    "objective": "Separate an algorithm from input presentation and output display.",
    "workbench": "python",
    "essentialChecks": [
      "logic separated",
      "both contexts pass",
      "interface documented"
    ],
    "variants": [
      {
        "id": "Y9.05-transfer-1",
        "task": "Repair the reusable search dependency for two new caller contexts. Use only each call's arguments, preserve complete search results and let each adapter format its own returned data."
      },
      {
        "id": "Y9.05-transfer-2",
        "task": "Repair the reusable search dependency for two new caller contexts. Use only each call's arguments, preserve complete search results and let each adapter format its own returned data."
      }
    ]
  },
  "Y9.06": {
    "contentHash": "b3f89bf74274782901b24081d16c3a4ad184125ef37bd3e604c8ddd5401642ca",
    "objective": "Build a tool that runs searches and sorts and explains measured behaviour.",
    "workbench": "python",
    "essentialChecks": [
      "algorithms correct",
      "comparison fair",
      "evidence inspectable"
    ],
    "variants": [
      {
        "id": "Y9.06-transfer-1",
        "task": "Deliver an investigation for the new synthetic data and targets. Retain both real sorting histories, comparable counts and checked searches; generate actual JSON/HTML evidence with a run-specific conclusion and explicit sorted-index provenance."
      },
      {
        "id": "Y9.06-transfer-2",
        "task": "Deliver an investigation for the new synthetic data and targets. Retain both real sorting histories, comparable counts and checked searches; generate actual JSON/HTML evidence with a run-specific conclusion and explicit sorted-index provenance."
      }
    ]
  },
  "C-Y9-1-1": {
    "contentHash": "334848b867dee5e5acdb9d12044aaad4031a40910b744c9adf3e0a67f0f7fd7a",
    "objective": "Map a sorted search result back to all matching original positions without confusing sorted and original indices.",
    "workbench": "python",
    "essentialChecks": [
      "Sorted search executes correctly",
      "All original matching positions survive",
      "Absent results remain explicit"
    ],
    "variants": [
      {
        "id": "C-Y9-1-1-transfer-1",
        "task": "Search the sorted copy for the new targets and report all matching original positions separately. Preserve duplicates and explicit empty results."
      },
      {
        "id": "C-Y9-1-1-transfer-2",
        "task": "Search the sorted copy for the new targets and report all matching original positions separately. Preserve duplicates and explicit empty results."
      }
    ]
  },
  "C-Y9-1-2": {
    "contentHash": "72cec8c701baccc62c9e75eb0fc4aeb5be5fe90e7ce8f4f7a78f49cf2e8d76bd",
    "objective": "Repair an experiment that gives one sorting strategy already ordered input while the other receives the original data.",
    "workbench": "python",
    "essentialChecks": [
      "Both strategies receive identical original ordering",
      "Actual algorithm outputs and passes are retained",
      "Counters measure value comparisons"
    ],
    "variants": [
      {
        "id": "C-Y9-1-2-transfer-1",
        "task": "Repair the experiment for the new data so insertion and selection receive identical original ordering. Retain actual inputs, passes and comparable counters."
      },
      {
        "id": "C-Y9-1-2-transfer-2",
        "task": "Repair the experiment for the new data so insertion and selection receive identical original ordering. Retain actual inputs, passes and comparable counters."
      }
    ]
  },
  "C-Y9-1-3": {
    "contentHash": "0589433fe042df8600ec4a9994d3e916bf042b2c6b1a23b5137b863283e45bd4",
    "objective": "Validate complete ordering once before searching an unchanged collection for multiple targets.",
    "workbench": "python",
    "essentialChecks": [
      "Complete ordering is checked once",
      "Invalid input prevents every search",
      "Each query has an actual probe history"
    ],
    "variants": [
      {
        "id": "C-Y9-1-3-transfer-1",
        "task": "Validate the new collection completely once, then run all actual searches only if the unchanged data is ordered. Preserve validation count and per-query probe histories."
      },
      {
        "id": "C-Y9-1-3-transfer-2",
        "task": "Validate the new collection completely once, then run all actual searches only if the unchanged data is ordered. Preserve validation count and per-query probe histories."
      }
    ]
  },
  "P-Y9-1": {
    "contentHash": "222cb2c9c4a8d97f73c89416dab13cf565106790fe24abb0774c456ab028ed76",
    "objective": "Investigate multiple stored synthetic collections with actual sorting/search traces, fair per-dataset counts and preserved original-record provenance.",
    "workbench": "python",
    "essentialChecks": [
      "Every stored collection executes both algorithms on identical input",
      "All actual traces and original matching positions are retained",
      "Each conclusion cites its own measured counters",
      "Private JSON and accessible HTML evidence are generated"
    ],
    "variants": [
      {
        "id": "P-Y9-1-transfer-1",
        "task": "Investigate both new stored collections with the actual algorithms and supplied targets. Preserve duplicate provenance, complete per-dataset evidence and scoped conclusions, generate JSON/HTML files and demonstrate private save/replay/restore."
      },
      {
        "id": "P-Y9-1-transfer-2",
        "task": "Investigate both new stored collections with the actual algorithms and supplied targets. Preserve duplicate provenance, complete per-dataset evidence and scoped conclusions, generate JSON/HTML files and demonstrate private save/replay/restore."
      }
    ]
  },
  "Y9.07": {
    "contentHash": "62f0680e423bc2c3d6adaa63fc4f29d9597fe83b6e0958586eabbbac68a40f42",
    "objective": "Design related tables for synthetic records using stable keys.",
    "workbench": "sql",
    "essentialChecks": [
      "entities clear",
      "keys unique",
      "relationship justified"
    ],
    "variants": [
      {
        "id": "Y9.07-transfer-1",
        "task": "Model Fictional garden inventory with stable object/collection keys, preserve distinct equal-named objects and verify the real relationships and ordered joined output."
      },
      {
        "id": "Y9.07-transfer-2",
        "task": "Model Fictional model library with stable object/collection keys, preserve distinct equal-named objects and verify the real relationships and ordered joined output."
      }
    ]
  },
  "Y9.08": {
    "contentHash": "19eaf32d0e589731630d97e96a4048fd5c2f633b395044d1ce3b4700c53820ff",
    "objective": "Write SELECT queries with filters and ordering in an isolated database.",
    "workbench": "sql",
    "essentialChecks": [
      "result rows exact",
      "order correct",
      "empty result handled"
    ],
    "variants": [
      {
        "id": "Y9.08-transfer-1",
        "task": "Query only practice rows at amount ≥3, with amount descending and ID ascending ties. Preserve the explicit empty-table result."
      },
      {
        "id": "Y9.08-transfer-2",
        "task": "Query only practice rows at amount ≥4, with amount descending and ID ascending ties. Preserve the explicit empty-table result."
      }
    ]
  },
  "Y9.09": {
    "contentHash": "64f8ffbdf335f902cf9199554a509f84b69019b9213c0cf46c2a540d8f8aa466",
    "objective": "Combine related data and calculate grouped summaries.",
    "workbench": "sql",
    "essentialChecks": [
      "join correct",
      "totals verified",
      "missing relation handled"
    ],
    "variants": [
      {
        "id": "Y9.09-transfer-1",
        "task": "Summarise Fictional garden inventory without multiplying object amounts by label count. Preserve every collection, exact label counts and defined empty-group totals."
      },
      {
        "id": "Y9.09-transfer-2",
        "task": "Summarise Fictional model library without multiplying object amounts by label count. Preserve every collection, exact label counts and defined empty-group totals."
      }
    ]
  },
  "Y9.10": {
    "contentHash": "7693a38f300d0b74bf64ea9fbf29df0a7db037d3309d3e6076d3af1c1415c6f4",
    "objective": "Apply constraints and distinguish invalid data from missing data.",
    "workbench": "sql",
    "essentialChecks": [
      "invalid rejected",
      "valid retained",
      "missing values explicit"
    ],
    "variants": [
      {
        "id": "Y9.10-transfer-1",
        "task": "Validate the new Fictional garden inventory staged import using actual constraints. Preserve unique valid records, valid zero and optional NULL notes; expose rejected counts."
      },
      {
        "id": "Y9.10-transfer-2",
        "task": "Validate the new Fictional model library staged import using actual constraints. Preserve unique valid records, valid zero and optional NULL notes; expose rejected counts."
      }
    ]
  },
  "Y9.11": {
    "contentHash": "4346bd05cb3cefb0bbd5fdba310d5bcdce4aa178a4edabb0c09337b37d06774d",
    "objective": "Design storage around fictional user needs and access boundaries.",
    "workbench": "sql",
    "essentialChecks": [
      "fields minimised",
      "roles limited",
      "recovery plan stated"
    ],
    "variants": [
      {
        "id": "Y9.11-transfer-1",
        "task": "Retain only the planning fields needed by Fictional garden inventory. Verify the actual stored schema and useful rows, omit contact text and preserve honest server-boundary/recovery limits."
      },
      {
        "id": "Y9.11-transfer-2",
        "task": "Retain only the planning fields needed by Fictional model library. Verify the actual stored schema and useful rows, omit contact text and preserve honest server-boundary/recovery limits."
      }
    ]
  },
  "Y9.12": {
    "contentHash": "d3a2945b610bf422e19714492442e48df51a0aa0fd47c6966ac8243e9f07ddb5",
    "objective": "Build a query interface over isolated synthetic data with valid and empty states.",
    "workbench": "sql",
    "essentialChecks": [
      "queries correct",
      "access boundaries tested",
      "feedback usable"
    ],
    "variants": [
      {
        "id": "Y9.12-transfer-1",
        "task": "Implement the supplied scoped synthetic search. Enforce role and collection in results and feedback, preserve literal query handling and return honest non-leaking empty states. Demonstrate private save/replay/restore without claiming production SQL authorisation."
      },
      {
        "id": "Y9.12-transfer-2",
        "task": "Implement the supplied scoped synthetic search. Enforce role and collection in results and feedback, preserve literal query handling and return honest non-leaking empty states. Demonstrate private save/replay/restore without claiming production SQL authorisation."
      }
    ]
  },
  "C-Y9-2-1": {
    "contentHash": "8548adad356881455a456c9ffdf18c8106ba1a3faf9364ab2abb0e9c89a354ce",
    "objective": "Find an orphan synthetic foreign-key reference instead of hiding it with an inner join.",
    "workbench": "sql",
    "essentialChecks": [
      "Missing relations are exposed",
      "Valid relationships are excluded from the audit",
      "Empty audit remains explicit"
    ],
    "variants": [
      {
        "id": "C-Y9-2-1-transfer-1",
        "task": "Audit the new staged objects for missing collections using a real unmatched-row query. Preserve IDs and distinguish an honest empty audit from hidden join loss."
      },
      {
        "id": "C-Y9-2-1-transfer-2",
        "task": "Audit the new staged objects for missing collections using a real unmatched-row query. Preserve IDs and distinguish an honest empty audit from hidden join loss."
      }
    ]
  },
  "C-Y9-2-2": {
    "contentHash": "e6dfa7a8db8a27c857a32b3aa9e79e4a65c5c6aa7586485b4dc3896176c53d09",
    "objective": "Calculate a known-observation mean without inventing zero measurements for missing data.",
    "workbench": "sql",
    "essentialChecks": [
      "Zero observations are included",
      "Missing observations are excluded from the denominator",
      "All-missing groups have NULL mean"
    ],
    "variants": [
      {
        "id": "C-Y9-2-2-transfer-1",
        "task": "Calculate known counts and means for the changed synthetic observations. Preserve zero, exclude missing measurements and retain NULL for all-missing groups."
      },
      {
        "id": "C-Y9-2-2-transfer-2",
        "task": "Calculate known counts and means for the changed synthetic observations. Preserve zero, exclude missing measurements and retain NULL for all-missing groups."
      }
    ]
  },
  "C-Y9-2-3": {
    "contentHash": "78794da6f0c7ef03308d193e5212b60d6b257a4c301804028897292c72fb8c4b",
    "objective": "Preserve a required collection scope when a query supports either title or ID matching.",
    "workbench": "sql",
    "essentialChecks": [
      "Both match routes remain in scope",
      "A foreign requested ID is excluded",
      "Legitimate matching rows remain"
    ],
    "variants": [
      {
        "id": "C-Y9-2-3-transfer-1",
        "task": "Group the alternative title/ID routes under the mandatory synthetic collection scope. Retain own matches and reject a foreign requested ID on actual execution."
      },
      {
        "id": "C-Y9-2-3-transfer-2",
        "task": "Group the alternative title/ID routes under the mandatory synthetic collection scope. Retain own matches and reject a foreign requested ID on actual execution."
      }
    ]
  },
  "P-Y9-2": {
    "contentHash": "ae9ad4a428a59ab8924d5469b173b661843d6934614f61c4333c02cb92f1dd34",
    "objective": "Integrate a searchable synthetic relation with minimal fields, exact authorised rows, scoped totals and non-leaking feedback.",
    "workbench": "sql",
    "essentialChecks": [
      "Rows and aggregates share the required scope",
      "Unnecessary contact fields are absent from the report relation",
      "Zero and empty states remain distinct",
      "Anonymous and foreign matches contribute no data"
    ],
    "variants": [
      {
        "id": "P-Y9-2-transfer-1",
        "task": "Deliver Fictional garden inventory's minimal relational report. Use one scoped relation consistently for search rows, totals, counts and status, exclude contacts and demonstrate actual private save/replay/restore."
      },
      {
        "id": "P-Y9-2-transfer-2",
        "task": "Deliver Fictional model library's minimal relational report. Use one scoped relation consistently for search rows, totals, counts and status, exclude contacts and demonstrate actual private save/replay/restore."
      }
    ]
  },
  "Y9.13": {
    "contentHash": "e1287396d132cba5bf52c54ef75c0febf18e39f04b8854928800d5c2c9574d97",
    "objective": "Compare a deterministic classifier and a small trained classifier on identical examples.",
    "workbench": "ai",
    "essentialChecks": [
      "same inputs used",
      "predictions recorded",
      "distinction explained"
    ],
    "variants": [
      {
        "id": "Y9.13-transfer-1",
        "task": "Compare the actual fixed rule and nearest-neighbour model on the same shifted held-out observations. Use threshold 25, retain complete input provenance and avoid unrelated rule-test fixtures."
      },
      {
        "id": "Y9.13-transfer-2",
        "task": "Compare the actual fixed rule and nearest-neighbour model on the same shifted held-out observations. Use threshold 45, retain complete input provenance and avoid unrelated rule-test fixtures."
      }
    ]
  },
  "Y9.14": {
    "contentHash": "89031fc31538c3066ecf14105b56a472f757282d64aae6f4f4d98bf7a7a79cd9",
    "objective": "Split a synthetic dataset before fitting a model.",
    "workbench": "ai",
    "essentialChecks": [
      "sets disjoint",
      "split recorded",
      "evaluation uses held-out data"
    ],
    "variants": [
      {
        "id": "Y9.14-transfer-1",
        "task": "Preserve only the predetermined train-low-1/train-high-1 observations and evaluate the separate shifted held-out sets. Remove copied test observations without hiding their provenance through renaming."
      },
      {
        "id": "Y9.14-transfer-2",
        "task": "Preserve only the predetermined train-low-2/train-high-2 observations and evaluate the separate shifted held-out sets. Remove copied test observations without hiding their provenance through renaming."
      }
    ]
  },
  "Y9.15": {
    "contentHash": "b95a0f6fd30466828fcb1c427cf2237e30d80cad080774e36013a1478a2400bb",
    "objective": "Count false positives and false negatives and identify uncertain cases.",
    "workbench": "ai",
    "essentialChecks": [
      "error counts correct",
      "uncertainty visible",
      "limits explained"
    ],
    "variants": [
      {
        "id": "Y9.15-transfer-1",
        "task": "Audit every new shifted prediction using three neighbours and threshold 0.8. Retain both error directions, all raw vote labels and four deferred decisions; repair any successful-only reporting policy."
      },
      {
        "id": "Y9.15-transfer-2",
        "task": "Audit every new shifted prediction using three neighbours and threshold 0.8. Retain both error directions, all raw vote labels and four deferred decisions; repair any successful-only reporting policy."
      }
    ]
  },
  "Y9.16": {
    "contentHash": "d12f799f194840f3e16075ae70a248c715c4bb79b703fc8aeca242f62bb44303",
    "objective": "Compare model performance across fictional groups without collecting sensitive learner data.",
    "workbench": "ai",
    "essentialChecks": [
      "group counts correct",
      "disparity identified",
      "remedy tested"
    ],
    "variants": [
      {
        "id": "Y9.16-transfer-1",
        "task": "Evaluate the new fictional material groups and add separate coverage examples at 28 low and 29 high. Preserve held-out separation, per-group denominators and sample-limited claims."
      },
      {
        "id": "Y9.16-transfer-2",
        "task": "Evaluate the new fictional material groups and add separate coverage examples at 48 low and 49 high. Preserve held-out separation, per-group denominators and sample-limited claims."
      }
    ]
  },
  "Y9.17": {
    "contentHash": "65a7af719f248a107fbd4d8acd101ba1386b03b34b39038acbf32acc5401f61b",
    "objective": "Test an AI-generated code fixture against a specification and attack-like inert inputs.",
    "workbench": "python",
    "essentialChecks": [
      "tests independent of prose",
      "fault reproduced",
      "correction justified"
    ],
    "variants": [
      {
        "id": "Y9.17-transfer-1",
        "task": "Validate the original list strictly, then retain only non-negative numeric observations before computing the actual mean. Distinguish invalid, empty-after-filtering and genuine zero; treat all strings as inert invalid data."
      },
      {
        "id": "Y9.17-transfer-2",
        "task": "Validate the original list strictly, then average numeric absolute magnitudes. Preserve invalid/empty/ok status semantics and test inert strings, booleans and zero without executing text."
      }
    ]
  },
  "Y9.18": {
    "contentHash": "a797d26732807cbac4b3f1da862a69a9e25f5aeaacdef0e71b279d2535de2f64",
    "objective": "Deliver a small classifier with separate tests, error analysis and appropriate-use limits.",
    "workbench": "ai",
    "essentialChecks": [
      "test separation verified",
      "errors reported",
      "uncertainty communicated"
    ],
    "variants": [
      {
        "id": "Y9.18-transfer-1",
        "task": "Deliver the new private evaluated model with separate held-out observations, full raw error analysis, threshold 0.8 and four deferred decisions. Retain appropriate-use limits and demonstrate actual private model save/replay/restore."
      },
      {
        "id": "Y9.18-transfer-2",
        "task": "Deliver the new private evaluated model with separate held-out observations, full raw error analysis, threshold 0.8 and four deferred decisions. Retain appropriate-use limits and demonstrate actual private model save/replay/restore."
      }
    ]
  },
  "C-Y9-3-1": {
    "contentHash": "b2d54af110cf6efed0eff5e32895eebbb8842ad28c692317faa9495fc82190fc",
    "objective": "Evaluate a fixed threshold and learned model on the same new held-out boundary examples.",
    "workbench": "ai",
    "essentialChecks": [
      "Same cases evaluated",
      "Rule boundary follows the contract",
      "Learned results are separately recorded"
    ],
    "variants": [
      {
        "id": "C-Y9-3-1-transfer-1",
        "task": "Use the prescribed rule threshold 25 and compare both actual mechanisms on the new same boundary cases. Keep held-out labels unchanged."
      },
      {
        "id": "C-Y9-3-1-transfer-2",
        "task": "Use the prescribed rule threshold 45 and compare both actual mechanisms on the new same boundary cases. Keep held-out labels unchanged."
      }
    ]
  },
  "C-Y9-3-2": {
    "contentHash": "cb21b685a51e68099007e1d72673dfe7f2353e7906e0441d7b9d60b71775a391",
    "objective": "Remove a known renamed held-out observation from training even when the identifier-disjointness check passes.",
    "workbench": "ai",
    "essentialChecks": [
      "Only predetermined training records remain",
      "Known copied observation is removed",
      "Held-out evaluation still runs"
    ],
    "variants": [
      {
        "id": "C-Y9-3-2-transfer-1",
        "task": "Remove the documented renamed held-out source copy while preserving the predetermined training pair and both actual separate evaluations. Explain why ID checks alone miss this defect."
      },
      {
        "id": "C-Y9-3-2-transfer-2",
        "task": "Remove the documented renamed held-out source copy while preserving the predetermined training pair and both actual separate evaluations. Explain why ID checks alone miss this defect."
      }
    ]
  },
  "C-Y9-3-3": {
    "contentHash": "8b4e6fb452b0de81cddc27b38b3071215f7cd4e3ef01aa0e7aaac2e53de9c398",
    "objective": "Distinguish an inclusive vote-share acceptance boundary from certainty and the separate review flag.",
    "workbench": "ai",
    "essentialChecks": [
      "Equality passes the supplied threshold",
      "Raw errors remain visible",
      "Separate review requirement remains enabled"
    ],
    "variants": [
      {
        "id": "C-Y9-3-3-transfer-1",
        "task": "Apply the supplied inclusive two-thirds vote boundary to the new shifted audit model. Preserve all errors, exact accepted/deferred evidence and the separate fictional review flag without certainty claims."
      },
      {
        "id": "C-Y9-3-3-transfer-2",
        "task": "Apply the supplied inclusive two-thirds vote boundary to the new shifted audit model. Preserve all errors, exact accepted/deferred evidence and the separate fictional review flag without certainty claims."
      }
    ]
  },
  "P-Y9-3": {
    "contentHash": "631dd42f74057a80bf7571cd6ae595bb10acb344dac66132c3b3f4ff2a4a9640",
    "objective": "Retain a private reproducible model and complete evaluation with separate observations, error directions and honest deferred decisions.",
    "workbench": "ai",
    "essentialChecks": [
      "Complete actual evaluation retained",
      "Source observations remain separated",
      "Low-vote decisions deferred",
      "Limits explicitly reject real-world decision claims"
    ],
    "variants": [
      {
        "id": "P-Y9-3-transfer-1",
        "task": "Retain the new private model's exact source/split, full errors and deferred decisions. Demonstrate actual save/replay/restore and explain why the evidence does not authorise real-world decisions or publication."
      },
      {
        "id": "P-Y9-3-transfer-2",
        "task": "Retain the new private model's exact source/split, full errors and deferred decisions. Demonstrate actual save/replay/restore and explain why the evidence does not authorise real-world decisions or publication."
      }
    ]
  },
  "Y9.19": {
    "contentHash": "064a063ff4e228fb7cd26900baaa3496b1a222648a0bbc5bf1440c80e0ed0eda",
    "objective": "Break a user brief into small testable tasks and dependencies.",
    "workbench": "engineering",
    "essentialChecks": [
      "dependencies acyclic",
      "tasks testable",
      "user value stated"
    ],
    "variants": [
      {
        "id": "Y9.19-transfer-1",
        "task": "Plan the private Fictional museum cards increment with explicit user value, testable contract/logic/interface/retest tasks and an executable acyclic dependency order."
      },
      {
        "id": "Y9.19-transfer-2",
        "task": "Plan the private Fictional garden labels increment with explicit user value, testable contract/logic/interface/retest tasks and an executable acyclic dependency order."
      }
    ]
  },
  "Y9.20": {
    "contentHash": "11125fab787b1b10c65acd048842cb1a53f549a5ae60b95c27863e11ed9ea6b4",
    "objective": "Write contract checks between application components.",
    "workbench": "portfolio",
    "essentialChecks": [
      "contracts explicit",
      "normal case passes",
      "invalid boundary handled"
    ],
    "variants": [
      {
        "id": "Y9.20-transfer-1",
        "task": "Connect the new count/presentation modules for multiplier 4 and maximum 8. Preserve the explicit record contract across normal, zero, missing and invalid inputs."
      },
      {
        "id": "Y9.20-transfer-2",
        "task": "Connect the new count/presentation modules for multiplier 2 and maximum 12. Preserve the explicit record contract across normal, zero, missing and invalid inputs."
      }
    ]
  },
  "Y9.21": {
    "contentHash": "846da326c85ed384da285f18210f546a81a698871507c53222778f6094c5e067",
    "objective": "Merge two fictional edits while preserving intended behaviour.",
    "workbench": "engineering",
    "essentialChecks": [
      "both intentions preserved",
      "tests pass",
      "resolution explained"
    ],
    "variants": [
      {
        "id": "Y9.21-transfer-1",
        "task": "Resolve the private Fictional museum cards branches into a new attributed snapshot, preserving factor 4, maximum 8, valid zero, invalid blank and the improved label. Execute all real regression tests and retain branch history."
      },
      {
        "id": "Y9.21-transfer-2",
        "task": "Resolve the private Fictional garden labels branches into a new attributed snapshot, preserving factor 2, maximum 12, valid zero, invalid blank and the improved label. Execute all real regression tests and retain branch history."
      }
    ]
  },
  "Y9.22": {
    "contentHash": "f416ab6d7b814f460ce5e3dbeafb5488e27e4f3500f785e753d33a7e3d1a934e",
    "objective": "Prioritise fixes using a fictional threat model and user-test evidence.",
    "workbench": "engineering",
    "essentialChecks": [
      "risk reasoned",
      "user impact evidenced",
      "critical fix verified"
    ],
    "variants": [
      {
        "id": "Y9.22-transfer-1",
        "task": "Revise Fictional museum cards's fictional project: fix the client-setting exposure and viewer permission before cosmetic copy, verify owner/viewer actual outcomes and retain the trusted revocation/reporting policy."
      },
      {
        "id": "Y9.22-transfer-2",
        "task": "Revise Fictional garden labels's fictional project: fix the client-setting exposure and viewer permission before cosmetic copy, verify owner/viewer actual outcomes and retain the trusted revocation/reporting policy."
      }
    ]
  },
  "Y9.23": {
    "contentHash": "9d97b5394bf3cd6abbb68fd4e5f688a4936bc967943155bac31580b6f009cac6",
    "objective": "Repurpose an existing artifact while respecting licences and access limits.",
    "workbench": "engineering",
    "essentialChecks": [
      "licence checked",
      "audience needs met",
      "trust claims reviewed"
    ],
    "variants": [
      {
        "id": "Y9.23-transfer-1",
        "task": "Adapt Fictional museum cards for the new fictional reader by replacing the restricted banner with the required original explanatory text diagram. Retain honest source evidence, private limits and reproducible handover."
      },
      {
        "id": "Y9.23-transfer-2",
        "task": "Adapt Fictional garden labels for the new fictional reader by replacing the restricted banner with the required original explanatory text diagram. Retain honest source evidence, private limits and reproducible handover."
      }
    ]
  },
  "Y9.24": {
    "contentHash": "60cca84e7ca0810f9366dbef6dbb26dff19b55678e017cb1b9cd4de4b40309d4",
    "objective": "Integrate code, synthetic data and media into a private application with a review record.",
    "workbench": "web",
    "essentialChecks": [
      "user story passes",
      "regression suite passes",
      "evaluation supported"
    ],
    "variants": [
      {
        "id": "Y9.24-transfer-1",
        "task": "Deliver Fictional museum cards's actual private search application. Connect current field values to validation/filter logic, retain exact rows and totals, zero, empty/error states, original credits and private save/replay/restore evidence."
      },
      {
        "id": "Y9.24-transfer-2",
        "task": "Deliver Fictional garden labels's actual private search application. Connect current field values to validation/filter logic, retain exact rows and totals, zero, empty/error states, original credits and private save/replay/restore evidence."
      }
    ]
  },
  "C-Y9-4-1": {
    "contentHash": "52f4a67a2a8b11719fb98b93bb6ac901c3cb003debd5e44f716734909e1d272c",
    "objective": "Replace prior rendered search rows when current input changes rather than accumulating stale results.",
    "workbench": "web",
    "essentialChecks": [
      "Old rows are removed",
      "Current summary matches current rows",
      "Invalid and empty results contain no stale rows"
    ],
    "variants": [
      {
        "id": "C-Y9-4-1-transfer-1",
        "task": "Repair current-only rendering after prior broad results in the new collection. Clear stale rows on narrow, empty and invalid replacements without deleting source records."
      },
      {
        "id": "C-Y9-4-1-transfer-2",
        "task": "Repair current-only rendering after prior broad results in the new collection. Clear stale rows on narrow, empty and invalid replacements without deleting source records."
      }
    ]
  },
  "C-Y9-4-2": {
    "contentHash": "1e1f68b6263147efe0ea74354a27e8e9e8fafeea2d1b12410f8f47678dcbb0ab",
    "objective": "Render markup-looking query text as literal feedback without injecting elements.",
    "workbench": "web",
    "essentialChecks": [
      "Literal query preserved",
      "No injected images or markup",
      "Current empty-search feedback remains accurate"
    ],
    "variants": [
      {
        "id": "C-Y9-4-2-transfer-1",
        "task": "Repair literal feedback rendering for the new private collection. Preserve the entire inert query string, zero matching rows and absence of injected elements while retaining current calculation and keyboard semantics."
      },
      {
        "id": "C-Y9-4-2-transfer-2",
        "task": "Repair literal feedback rendering for the new private collection. Preserve the entire inert query string, zero matching rows and absence of injected elements while retaining current calculation and keyboard semantics."
      }
    ]
  },
  "C-Y9-4-3": {
    "contentHash": "8fd128739c08d557668b349fc3d3278807f0e648a704c522ecce2461d66cc9b1",
    "objective": "Record the actual passing and failing outcomes of a supplied candidate without claiming an unresolved regression is complete.",
    "workbench": "engineering",
    "essentialChecks": [
      "Actual candidate executed",
      "Independent expected values retained",
      "Failure remains visible",
      "Review does not claim completion"
    ],
    "variants": [
      {
        "id": "C-Y9-4-3-transfer-1",
        "task": "Review the actual Fictional museum cards candidate against zero and blank acceptance values. Preserve the real failed test and record the unresolved boundary defect without claiming completion."
      },
      {
        "id": "C-Y9-4-3-transfer-2",
        "task": "Review the actual Fictional garden labels candidate against zero and blank acceptance values. Preserve the real failed test and record the unresolved boundary defect without claiming completion."
      }
    ]
  },
  "P-Y9-4": {
    "contentHash": "bf849b3dc4b22cbf83ae94f068ef61da62bb3a1b13e038d4b43d1379d2ad2730",
    "objective": "Integrate source records, original explanatory media, actual search/reset interactions and a limited private review record.",
    "workbench": "web",
    "essentialChecks": [
      "Core search and totals remain functional",
      "Title-only reset preserves the independent minimum",
      "Actual interaction review is not presented as a full test pass",
      "Editable source and original credits retained"
    ],
    "variants": [
      {
        "id": "P-Y9-4-transfer-1",
        "task": "Deliver Fictional museum cards's private portfolio application with scoped title reset, preserved minimum, actual current results/totals, original source credit and honest interaction review. Demonstrate actual source save/replay/restore."
      },
      {
        "id": "P-Y9-4-transfer-2",
        "task": "Deliver Fictional garden labels's private portfolio application with scoped title reset, preserved minimum, actual current results/totals, original source credit and honest interaction review. Demonstrate actual source save/replay/restore."
      }
    ]
  },
  "Y10.01": {
    "contentHash": "e872137020733c3b6ffaec49916e5b749d344e01cbbe5b28a9d82c0861e0edb8",
    "objective": "Specify normal, boundary and erroneous inputs with expected outputs for a component.",
    "workbench": "python",
    "essentialChecks": [
      "cases justified",
      "expectations independent",
      "fault-revealing case present"
    ],
    "variants": [
      {
        "id": "Y10.01-transfer-1",
        "task": "Specify and execute independent tests for multiplier 4 and inclusive maximum 8. Preserve all five categories and detect the supplied upper-boundary defect without changing expectations to fit it."
      },
      {
        "id": "Y10.01-transfer-2",
        "task": "Specify and execute independent tests for multiplier 2 and inclusive maximum 12. Preserve all five categories and detect the supplied upper-boundary defect without changing expectations to fit it."
      }
    ]
  },
  "Y10.02": {
    "contentHash": "4d27ae3a34ad5d9ed40e4c67ba645b09419f84540286c0524fac6bdf725da72f",
    "objective": "Translate a user problem into components with explicit responsibilities.",
    "workbench": "python",
    "essentialChecks": [
      "needs traceable",
      "interfaces stated",
      "dependencies justified"
    ],
    "variants": [
      {
        "id": "Y10.02-transfer-1",
        "task": "Decompose Fictional museum card component into accountable validation, calculation and result-shape responsibilities. Execute all supplied types/bounds against the actual integrated functions."
      },
      {
        "id": "Y10.02-transfer-2",
        "task": "Decompose Fictional garden label component into accountable validation, calculation and result-shape responsibilities. Execute all supplied types/bounds against the actual integrated functions."
      }
    ]
  },
  "Y10.03": {
    "contentHash": "669fe9521bf32b9af200a686996522093d600f631ff05020449769d104f13369",
    "objective": "Implement repeatable tests that detect a supplied regression.",
    "workbench": "python",
    "essentialChecks": [
      "test fails before fix",
      "passes after",
      "meaningful assertion retained"
    ],
    "variants": [
      {
        "id": "Y10.03-transfer-1",
        "task": "Implement actual asserting regression tests for the new candidate's zero and upper bound 8. Detect its known extra-one fault and retain the genuine unittest transcript."
      },
      {
        "id": "Y10.03-transfer-2",
        "task": "Implement actual asserting regression tests for the new candidate's zero and upper bound 12. Detect its known extra-one fault and retain the genuine unittest transcript."
      }
    ]
  },
  "Y10.04": {
    "contentHash": "f2b7ef285e500a4c9a738aa238ced9832b52af1d3fb4b20e05e174b01768ab77",
    "objective": "Persist structured data in a project-only virtual filesystem.",
    "workbench": "python",
    "essentialChecks": [
      "round-trip correct",
      "corruption handled",
      "valid state preserved"
    ],
    "variants": [
      {
        "id": "Y10.04-transfer-1",
        "task": "Import the new synthetic proposal for Fictional museum card component. Preserve the actual known-good file on malformed or invalid data, accept validated zero and retain real file evidence."
      },
      {
        "id": "Y10.04-transfer-2",
        "task": "Import the new synthetic proposal for Fictional garden label component. Preserve the actual known-good file on malformed or invalid data, accept validated zero and retain real file evidence."
      }
    ]
  },
  "Y10.05": {
    "contentHash": "4c7e539eb0dd0b4addc41db8efff72d7cd151fa93bfd0db57e4e649869bf135e",
    "objective": "Define input, output, errors and invariants for a software component.",
    "workbench": "python",
    "essentialChecks": [
      "contract accurate",
      "tests cover errors",
      "reuse demonstrated"
    ],
    "variants": [
      {
        "id": "Y10.05-transfer-1",
        "task": "Implement the saved integer/null adjustment contract with maximum 8. Preserve explicit error codes and verify real types for zero, upper boundary, overflow and boolean input."
      },
      {
        "id": "Y10.05-transfer-2",
        "task": "Implement the saved integer/null adjustment contract with maximum 12. Preserve explicit error codes and verify real types for zero, upper boundary, overflow and boolean input."
      }
    ]
  },
  "Y10.06": {
    "contentHash": "8776ad36f538b8ec2d16352e0c474c4069f0764ced875f3d210067967e2399fe",
    "objective": "Deliver a reusable component with persistence, tests and clear failure behaviour.",
    "workbench": "python",
    "essentialChecks": [
      "normal cases pass",
      "failures safe",
      "documentation matches"
    ],
    "variants": [
      {
        "id": "Y10.06-transfer-1",
        "task": "Deliver Fictional museum card component's reusable private repository. Load existing accepted state, validate/upsert without losing other IDs, atomically persist and reopen it, then demonstrate private save/replay/restore and separate restart evidence."
      },
      {
        "id": "Y10.06-transfer-2",
        "task": "Deliver Fictional garden label component's reusable private repository. Load existing accepted state, validate/upsert without losing other IDs, atomically persist and reopen it, then demonstrate private save/replay/restore and separate restart evidence."
      }
    ]
  },
  "C-Y10-1-1": {
    "contentHash": "ef947039efce32e29f857d1f5e96f8f10c1a93ad30df0d6fe011ebb5b3f89e89",
    "objective": "Reset per-run test counters while preserving actual assertions and the known regression evidence.",
    "workbench": "python",
    "essentialChecks": [
      "Both actual runs execute all cases",
      "Known regression remains detected",
      "Second failure count is not cumulative"
    ],
    "variants": [
      {
        "id": "C-Y10-1-1-transfer-1",
        "task": "Run the actual Fictional museum card component plan twice with independent per-run counters, retaining all five checks and exactly one known upper-boundary failure per run."
      },
      {
        "id": "C-Y10-1-1-transfer-2",
        "task": "Run the actual Fictional garden label component plan twice with independent per-run counters, retaining all five checks and exactly one known upper-boundary failure per run."
      }
    ]
  },
  "C-Y10-1-2": {
    "contentHash": "368a92f5b366155af983b65cf48307e67e402ccc9c4222fb0ba01bc8fc2972c1",
    "objective": "Reject an invalid multi-record replacement without committing an earlier valid prefix.",
    "workbench": "python",
    "essentialChecks": [
      "Every proposed record checked before commit",
      "Late invalid/duplicate data refused",
      "Known-good file unchanged"
    ],
    "variants": [
      {
        "id": "C-Y10-1-2-transfer-1",
        "task": "Validate the complete new synthetic replacement, including cross-row uniqueness, before one real file commit. Reject late defects without persisting a prefix or changing known-good records."
      },
      {
        "id": "C-Y10-1-2-transfer-2",
        "task": "Validate the complete new synthetic replacement, including cross-row uniqueness, before one real file commit. Reject late defects without persisting a prefix or changing known-good records."
      }
    ]
  },
  "C-Y10-1-3": {
    "contentHash": "3eb6f323cd7e3cb77625e80c3558f5c148fc36ede81e6dabb635112ef1a4d145",
    "objective": "Return an independent snapshot so a caller cannot mutate the repository's accepted live state through an alias.",
    "workbench": "python",
    "essentialChecks": [
      "Returned snapshot independently mutable",
      "Live accepted state unchanged",
      "Actual persisted state unchanged"
    ],
    "variants": [
      {
        "id": "C-Y10-1-3-transfer-1",
        "task": "Return an independent nested snapshot for the new repository records. Allow local copy mutation while preserving both live accepted records and the actual file, including valid zero."
      },
      {
        "id": "C-Y10-1-3-transfer-2",
        "task": "Return an independent nested snapshot for the new repository records. Allow local copy mutation while preserving both live accepted records and the actual file, including valid zero."
      }
    ]
  },
  "P-Y10-1": {
    "contentHash": "cc2bdf6919e514b040944817f213990bcc7d449376da31c48d797918760456d5",
    "objective": "Integrate validated persistence, defensive snapshots and explicit upsert/remove outcomes with reproducible private evidence.",
    "workbench": "python",
    "essentialChecks": [
      "Validated operations preserve unrelated records",
      "Missing removal target changes no state",
      "Real file reopening matches accepted outcome",
      "Actual before/after evidence saved"
    ],
    "variants": [
      {
        "id": "P-Y10-1-transfer-1",
        "task": "Deliver Fictional museum card component's tested private record component. Preserve no-op semantics, validated operations, unrelated IDs and zero; generate actual before/after evidence, reopen the real file and demonstrate private workspace save/replay/restore."
      },
      {
        "id": "P-Y10-1-transfer-2",
        "task": "Deliver Fictional garden label component's tested private record component. Preserve no-op semantics, validated operations, unrelated IDs and zero; generate actual before/after evidence, reopen the real file and demonstrate private workspace save/replay/restore."
      }
    ]
  },
  "Y10.07": {
    "contentHash": "4569af4529534e7fc80e0a266a98984d34862b225d4927f9ec5346cb1505f5fa",
    "objective": "Model entities, keys, relationships and constraints for an inventory domain.",
    "workbench": "python",
    "essentialChecks": [
      "keys stable",
      "relationships correct",
      "duplication justified or removed"
    ],
    "variants": [
      {
        "id": "Y10.07-transfer-1",
        "task": "Model Fictional museum inventory with authoritative item titles, composite stock keys, non-negative quantity and real relationships. Rename the item once and verify both locations reflect it without a duplicated title column."
      },
      {
        "id": "Y10.07-transfer-2",
        "task": "Model Fictional garden inventory with authoritative item titles, composite stock keys, non-negative quantity and real relationships. Rename the item once and verify both locations reflect it without a duplicated title column."
      }
    ]
  },
  "Y10.08": {
    "contentHash": "279f31af5d129da8298bb23091a3853c60edd2fccdcaa335fa24a1ba97f2a9b0",
    "objective": "Use parameterised SQL for reads and writes in an isolated database.",
    "workbench": "python",
    "essentialChecks": [
      "results correct",
      "parameters bound",
      "inert attack string stays data"
    ],
    "variants": [
      {
        "id": "Y10.08-transfer-1",
        "task": "Parameterise both reads and writes in Fictional museum inventory. Preserve exact-key semantics, valid zero, unrelated locations and unchanged state for inert quote-containing values."
      },
      {
        "id": "Y10.08-transfer-2",
        "task": "Parameterise both reads and writes in Fictional garden inventory. Preserve exact-key semantics, valid zero, unrelated locations and unchanged state for inert quote-containing values."
      }
    ]
  },
  "Y10.09": {
    "contentHash": "1baf067075a3958a153f0f6094b78bee5ff7c5f1d3c3cd7bf8cfe3515f6ad978",
    "objective": "Group related changes so failure cannot leave inconsistent state.",
    "workbench": "python",
    "essentialChecks": [
      "success consistent",
      "failure rolls back",
      "invariant checked"
    ],
    "variants": [
      {
        "id": "Y10.09-transfer-1",
        "task": "Transfer 4 units from initial stock 12 with a real atomic transaction. Verify success, interruption and insufficient stock while conserving the actual total."
      },
      {
        "id": "Y10.09-transfer-2",
        "task": "Transfer 2 units from initial stock 8 with a real atomic transaction. Verify success, interruption and insufficient stock while conserving the actual total."
      }
    ]
  },
  "Y10.10": {
    "contentHash": "c19babd67ab112fdd1057ede75a574717b4b1e2e3c756f046cdfdca8b43303c2",
    "objective": "Specify endpoints, response shapes and error cases for a local fixture service.",
    "workbench": "python",
    "essentialChecks": [
      "method semantics justified",
      "schema valid",
      "errors explicit"
    ],
    "variants": [
      {
        "id": "Y10.10-transfer-1",
        "task": "Execute Fictional museum inventory's actual local API contract. Preserve state under repeated GET, return documented 405/404 responses and validate actual response types for positive and zero initial stock."
      },
      {
        "id": "Y10.10-transfer-2",
        "task": "Execute Fictional garden inventory's actual local API contract. Preserve state under repeated GET, return documented 405/404 responses and validate actual response types for positive and zero initial stock."
      }
    ]
  },
  "Y10.11": {
    "contentHash": "534b96b61d784abc076f8e27d5e315027ce4087ec0476ef4c8a2f0a1a8a63b61",
    "objective": "Check request and response data and enforce role permissions on the server model.",
    "workbench": "python",
    "essentialChecks": [
      "valid request works",
      "malformed rejected",
      "wrong role denied"
    ],
    "variants": [
      {
        "id": "Y10.11-transfer-1",
        "task": "Enforce Fictional museum inventory's actual server-model permissions and exact request/response contracts. Reject viewer role claims, unknown sessions, numeric strings, booleans and extra fields; preserve only the established owner's valid update."
      },
      {
        "id": "Y10.11-transfer-2",
        "task": "Enforce Fictional garden inventory's actual server-model permissions and exact request/response contracts. Reject viewer role claims, unknown sessions, numeric strings, booleans and extra fields; preserve only the established owner's valid update."
      }
    ]
  },
  "Y10.12": {
    "contentHash": "d4e2966d89ff19d6106c3a7791613cd2b04a0701d1799c95c04ce474c5269292",
    "objective": "Build an isolated inventory API over synthetic relational data with contract tests.",
    "workbench": "python",
    "essentialChecks": [
      "contract tests pass",
      "transactions preserve stock",
      "role checks enforced"
    ],
    "variants": [
      {
        "id": "Y10.12-transfer-1",
        "task": "Deliver Fictional museum inventory's actual concurrent local service: one revision-zero adjustment commits, all stale writers conflict, quantity stays 8 at revision one, and real private source/database save/replay/restore evidence is retained."
      },
      {
        "id": "Y10.12-transfer-2",
        "task": "Deliver Fictional garden inventory's actual concurrent local service: one revision-zero adjustment commits, all stale writers conflict, quantity stays 6 at revision one, and real private source/database save/replay/restore evidence is retained."
      }
    ]
  },
  "C-Y10-2-1": {
    "contentHash": "9f1c114802c8d58eb8b1059ddb35ca67c98ceff5b60364416a519b3fba23629a",
    "objective": "Apply the established session's location scope to every actual read and write, rather than granting all objects to any owner.",
    "workbench": "python",
    "essentialChecks": [
      "Other owner reads its own location",
      "Its write changes only that location",
      "Original owner data remains unchanged"
    ],
    "variants": [
      {
        "id": "C-Y10-2-1-transfer-1",
        "task": "Apply each established session's actual location in Fictional museum inventory. Verify another owner's workshop read/write leaves the store owner's real persisted stock unchanged."
      },
      {
        "id": "C-Y10-2-1-transfer-2",
        "task": "Apply each established session's actual location in Fictional garden inventory. Verify another owner's workshop read/write leaves the store owner's real persisted stock unchanged."
      }
    ]
  },
  "C-Y10-2-2": {
    "contentHash": "ab8af11e6b1ad47d35708cf2306354fb8bd8c21a1ee2458e117ba3d0b4f2c139",
    "objective": "Preserve an all-or-nothing two-item stock order when the second transfer cannot be fulfilled.",
    "workbench": "python",
    "essentialChecks": [
      "Every item shares one transaction",
      "Late failure reverses earlier valid item transfer",
      "Successful order commits both items"
    ],
    "variants": [
      {
        "id": "C-Y10-2-2-transfer-1",
        "task": "Transfer the complete two-item order for Fictional museum inventory inside one actual transaction. Verify late insufficiency leaves every row unchanged and a valid order commits both items."
      },
      {
        "id": "C-Y10-2-2-transfer-2",
        "task": "Transfer the complete two-item order for Fictional garden inventory inside one actual transaction. Verify late insufficiency leaves every row unchanged and a valid order commits both items."
      }
    ]
  },
  "C-Y10-2-3": {
    "contentHash": "8543f49d5eed09d972a1d0af17e67237d71c66297396e05952d2987793a27e82",
    "objective": "Reject numeric-looking strings and booleans without implicitly coercing them into accepted revision-changing writes.",
    "workbench": "python",
    "essentialChecks": [
      "Strings and booleans refused",
      "No writes accepted",
      "Persisted quantity and revision unchanged"
    ],
    "variants": [
      {
        "id": "C-Y10-2-3-transfer-1",
        "task": "Enforce the original integer-only JSON contract for Fictional museum inventory. Refuse string/boolean changes before coercion and verify zero accepted writes plus unchanged durable quantity/revision."
      },
      {
        "id": "C-Y10-2-3-transfer-2",
        "task": "Enforce the original integer-only JSON contract for Fictional garden inventory. Refuse string/boolean changes before coercion and verify zero accepted writes plus unchanged durable quantity/revision."
      }
    ]
  },
  "P-Y10-2": {
    "contentHash": "55974482a83ee0b7f7868d86d40e393fe489548aea9684c50d18aa3f1593ca63",
    "objective": "Integrate actual HTTP contracts, scoped authorisation, revision conflicts and committed relational persistence with private replay evidence.",
    "workbench": "python",
    "essentialChecks": [
      "Actual read/write/read contract passes",
      "Stale request refused",
      "Accepted quantity/revision survive real database reopen",
      "Captured private database matches accepted state"
    ],
    "variants": [
      {
        "id": "P-Y10-2-transfer-1",
        "task": "Deliver Fictional museum inventory's durable local API. Verify actual read/write/read and stale conflict, close/reopen the database to confirm the accepted revision, and retain real private source/database save/replay/restore evidence."
      },
      {
        "id": "P-Y10-2-transfer-2",
        "task": "Deliver Fictional garden inventory's durable local API. Verify actual read/write/read and stale conflict, close/reopen the database to confirm the accepted revision, and retain real private source/database save/replay/restore evidence."
      }
    ]
  },
  "Y10.13": {
    "contentHash": "e2070ea5f2b47d21ed9c26f84a9ce65777398aa2e0f3ed58757d95fd35b14a3e",
    "objective": "Identify assets, entry points and permissions in an intentionally vulnerable local fixture.",
    "workbench": "python",
    "essentialChecks": [
      "assets identified",
      "threats bounded",
      "mitigations testable"
    ],
    "variants": [
      {
        "id": "Y10.13-transfer-1",
        "task": "Probe the supplied vulnerable Fictional museum workshop records fixture only, then map primary, summary and export assets/permissions from actual evidence. Retain the explicit unresolved-target limitation; do not contact external systems."
      },
      {
        "id": "Y10.13-transfer-2",
        "task": "Probe the supplied vulnerable Fictional garden club records fixture only, then map primary, summary and export assets/permissions from actual evidence. Retain the explicit unresolved-target limitation; do not contact external systems."
      }
    ]
  },
  "Y10.14": {
    "contentHash": "edb1cd045017f3de917f975e8f05b5963c3f972710e605553f180fb5e69c0f50",
    "objective": "Distinguish identity proof, sessions and permissions using a local model.",
    "workbench": "python",
    "essentialChecks": [
      "identity verified",
      "client role ignored",
      "expiry handled"
    ],
    "variants": [
      {
        "id": "Y10.14-transfer-1",
        "task": "Enforce active-session and established-role boundaries in Fictional museum workshop records. Reject revoked/unknown tokens and client administrator claims while retaining the legitimate positive administrator path and unchanged records."
      },
      {
        "id": "Y10.14-transfer-2",
        "task": "Enforce active-session and established-role boundaries in Fictional garden club records. Reject revoked/unknown tokens and client administrator claims while retaining the legitimate positive administrator path and unchanged records."
      }
    ]
  },
  "Y10.15": {
    "contentHash": "bc1329e8e4ef72bbdeb20611487c3abd7dd9873bef98b766b312eff08453e34f",
    "objective": "Enforce object ownership and least privilege at each service operation.",
    "workbench": "python",
    "essentialChecks": [
      "owner allowed",
      "non-owner denied",
      "denial leaks no record"
    ],
    "variants": [
      {
        "id": "Y10.15-transfer-1",
        "task": "Enforce both ownership directions in Fictional museum workshop records. Preserve positive own read/archive, non-leaking foreign/absent errors and actual changes limited to the selected owner's record."
      },
      {
        "id": "Y10.15-transfer-2",
        "task": "Enforce both ownership directions in Fictional garden club records. Preserve positive own read/archive, non-leaking foreign/absent errors and actual changes limited to the selected owner's record."
      }
    ]
  },
  "Y10.16": {
    "contentHash": "263d2d8e582232fbb5c0f06160df9e313126ecfe8c38130c6ee612492c4ba76f",
    "objective": "Remove secrets from client artifacts and minimise synthetic personal fields.",
    "workbench": "python",
    "essentialChecks": [
      "secret absent",
      "fields minimised",
      "access constrained"
    ],
    "variants": [
      {
        "id": "Y10.16-transfer-1",
        "task": "Minimise Fictional museum workshop records's actual stored fields, own read/export response and diagnostic events. Preserve useful zero/value/revision data while excluding invented contacts and all credential headers."
      },
      {
        "id": "Y10.16-transfer-2",
        "task": "Minimise Fictional garden club records's actual stored fields, own read/export response and diagnostic events. Preserve useful zero/value/revision data while excluding invented contacts and all credential headers."
      }
    ]
  },
  "Y10.17": {
    "contentHash": "dee23bbb484c0373eeb0c41989cdb06718a9e8c11da5183df10bfdd012ee7549",
    "objective": "Rehearse safe recovery and appropriate incident reporting using fictional evidence.",
    "workbench": "python",
    "essentialChecks": [
      "containment appropriate",
      "valid data recovered",
      "report minimal and clear"
    ],
    "variants": [
      {
        "id": "Y10.17-transfer-1",
        "task": "Rehearse Fictional museum workshop records's actual local archive/recovery sequence. Refuse ordinary-user restore, validate the supplied backup under the fixture administrator and retain only the minimal private review without sending or publishing anything."
      },
      {
        "id": "Y10.17-transfer-2",
        "task": "Rehearse Fictional garden club records's actual local archive/recovery sequence. Refuse ordinary-user restore, validate the supplied backup under the fixture administrator and retain only the minimal private review without sending or publishing anything."
      }
    ]
  },
  "Y10.18": {
    "contentHash": "1116a0047f354a79b8f656e5d728c7205d610fdb2e21a138d711ca6d75ae4c52",
    "objective": "Improve a supplied local fixture and document verified defensive changes.",
    "workbench": "python",
    "essentialChecks": [
      "threats addressed",
      "positive and negative tests pass",
      "residual risk stated"
    ],
    "variants": [
      {
        "id": "Y10.18-transfer-1",
        "task": "Deliver Fictional museum workshop records's defensive revision across primary/summary/export/archive routes. Verify both legitimate owner directions, non-leaking denied routes, minimal evidence and actual private source/state save/replay/restore."
      },
      {
        "id": "Y10.18-transfer-2",
        "task": "Deliver Fictional garden club records's defensive revision across primary/summary/export/archive routes. Verify both legitimate owner directions, non-leaking denied routes, minimal evidence and actual private source/state save/replay/restore."
      }
    ]
  },
  "C-Y10-3-1": {
    "contentHash": "2131c890547693b549ec30154664b84679f7f80744a0a71d122ccd81137bc927",
    "objective": "Scope each actual export independently when two legitimate callers request the same collection route.",
    "workbench": "python",
    "essentialChecks": [
      "Each owner receives only its records",
      "Response fields remain minimal",
      "Source state unchanged"
    ],
    "variants": [
      {
        "id": "C-Y10-3-1-transfer-1",
        "task": "Scope both callers' actual exports in Fictional museum workshop records, preserve minimal fields and zero, and prove both request orders leave source state unchanged."
      },
      {
        "id": "C-Y10-3-1-transfer-2",
        "task": "Scope both callers' actual exports in Fictional garden club records, preserve minimal fields and zero, and prove both request orders leave source state unchanged."
      }
    ]
  },
  "C-Y10-3-2": {
    "contentHash": "44b7348c4e8885269f20ae2f4979668f4d4672aac6cd878b63df23deec93b1ab",
    "objective": "Apply revocation and unknown-session refusal consistently to item, export and archive operations.",
    "workbench": "python",
    "essentialChecks": [
      "All routes return authentication refusal",
      "No private payload returned",
      "No stored mutation"
    ],
    "variants": [
      {
        "id": "C-Y10-3-2-transfer-1",
        "task": "Refuse revoked and unknown sessions on every actual route in Fictional museum workshop records. Return no private success data and verify unchanged accepted state."
      },
      {
        "id": "C-Y10-3-2-transfer-2",
        "task": "Refuse revoked and unknown sessions on every actual route in Fictional garden club records. Return no private success data and verify unchanged accepted state."
      }
    ]
  },
  "C-Y10-3-3": {
    "contentHash": "ba7e02ac1a8173a4b11ade6ca2e53dcaaffe7aaa71f8b878ff195c5a8af03e92",
    "objective": "Refuse a client-selected unreviewed backup even when its records satisfy the data schema.",
    "workbench": "python",
    "essentialChecks": [
      "Client backup selection refused",
      "Unreviewed valid data not restored",
      "Accepted state unchanged by refusal"
    ],
    "variants": [
      {
        "id": "C-Y10-3-3-transfer-1",
        "task": "Protect Fictional museum workshop records's recovery source. Refuse the client-selected unreviewed but schema-valid file and preserve the actual accepted archive state with an explicit invalid-contract response."
      },
      {
        "id": "C-Y10-3-3-transfer-2",
        "task": "Protect Fictional garden club records's recovery source. Refuse the client-selected unreviewed but schema-valid file and preserve the actual accepted archive state with an explicit invalid-contract response."
      }
    ]
  },
  "P-Y10-3": {
    "contentHash": "aa20dc2f8a3da664d3cb9efdcc3ae5857819a04dcf22a5de5ad0a024549dfe56",
    "objective": "Integrate actual route authorisation, session validity, minimal evidence and revision-safe mutations in a private defensive project.",
    "workbench": "python",
    "essentialChecks": [
      "All actual positive/negative route checks retained",
      "Stale repeat refused",
      "Only one owned record changes once",
      "Private source/state and bounded claims retained"
    ],
    "variants": [
      {
        "id": "P-Y10-3-transfer-1",
        "task": "Deliver Fictional museum workshop records's private defensive service: retain all nine actual route outcomes, refuse the stale archive repeat, preserve exactly one owned revision and demonstrate real source/state save/replay/restore with honest scope limits."
      },
      {
        "id": "P-Y10-3-transfer-2",
        "task": "Deliver Fictional garden club records's private defensive service: retain all nine actual route outcomes, refuse the stale archive repeat, preserve exactly one owned revision and demonstrate real source/state save/replay/restore with honest scope limits."
      }
    ]
  },
  "Y10.19": {
    "contentHash": "f9eedf88ed8adc9f2c276cb265ab08fbe7a30bfc323d7cde94df6c37330bc216",
    "objective": "Prioritise a bounded application milestone with acceptance criteria and effort estimates.",
    "workbench": "engineering",
    "essentialChecks": [
      "scope bounded",
      "dependencies ordered",
      "criteria measurable"
    ],
    "variants": [
      {
        "id": "Y10.19-transfer-1",
        "task": "Plan Fictional museum inventory's private increment with all five measurable tasks, 9 planned hours, an acyclic serial dependency chain and an honest capacity statement."
      },
      {
        "id": "Y10.19-transfer-2",
        "task": "Plan Fictional garden inventory's private increment with all five measurable tasks, 10 planned hours, an acyclic serial dependency chain and an honest capacity statement."
      }
    ]
  },
  "Y10.20": {
    "contentHash": "93520b631c6c975ff91251ae9cac7724291e5872de297ff9a199f2c625e7ec04",
    "objective": "Connect a usable front end to a tested fixture API.",
    "workbench": "web",
    "essentialChecks": [
      "success truthful",
      "failure visible",
      "saved data consistent"
    ],
    "variants": [
      {
        "id": "Y10.20-transfer-1",
        "task": "Connect Fictional museum inventory's real local service to the async interface. Distinguish actual 200/503/403 outcomes, preserve confirmed state on refusal and verify DOM, request receipts, SQLite state and private snapshot together."
      },
      {
        "id": "Y10.20-transfer-2",
        "task": "Connect Fictional garden inventory's real local service to the async interface. Distinguish actual 200/503/403 outcomes, preserve confirmed state on refusal and verify DOM, request receipts, SQLite state and private snapshot together."
      }
    ]
  },
  "Y11.01": {
    "contentHash": "4d16d487d7eb2aca19a1bdc6d590dfb622a30bc30a6588ce57af552eef75de54",
    "objective": "Compare two bounded designs against change, reliability and access requirements.",
    "workbench": "python",
    "essentialChecks": [
      "criteria explicit",
      "alternatives compared",
      "trade-off justified"
    ],
    "variants": [
      {
        "id": "Y11.01-transfer-1",
        "task": "Implement the layer boundary, domain operation, repository, HTTP adapter contract for independent fictional store 2. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      },
      {
        "id": "Y11.01-transfer-2",
        "task": "Implement the layer boundary, domain operation, repository, HTTP adapter contract for independent fictional store 3. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      }
    ]
  },
  "Y11.02": {
    "contentHash": "df453e19112709c516f379325feca34e8e0f91f96876310a0c9d0e11f6dbb39d",
    "objective": "Revise a fixture API while preserving documented clients.",
    "workbench": "python",
    "essentialChecks": [
      "old contract passes",
      "new contract passes",
      "migration explained"
    ],
    "variants": [
      {
        "id": "Y11.02-transfer-1",
        "task": "Implement the API version, backward compatibility, consumer contract contract for independent fictional store 2. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      },
      {
        "id": "Y11.02-transfer-2",
        "task": "Implement the API version, backward compatibility, consumer contract contract for independent fictional store 3. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      }
    ]
  },
  "Y11.03": {
    "contentHash": "c246c147b562be7b3004c34dc5b3cec6fa89e9298a668f1c21361fa173e5ee4f",
    "objective": "Implement idempotent handling of duplicate fixture requests.",
    "workbench": "python",
    "essentialChecks": [
      "one effect per key",
      "repeated response consistent",
      "invalid reuse rejected"
    ],
    "variants": [
      {
        "id": "Y11.03-transfer-1",
        "task": "Implement the idempotency, durable receipt, safe retry contract for independent fictional store 2. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      },
      {
        "id": "Y11.03-transfer-2",
        "task": "Implement the idempotency, durable receipt, safe retry contract for independent fictional store 3. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      }
    ]
  },
  "Y11.04": {
    "contentHash": "ade2f07d0e813b43b08e4fb68364f9757c1066056457bdbb026cc309a1441f3d",
    "objective": "Use revision checks or transactions to preserve a shared data invariant.",
    "workbench": "python",
    "essentialChecks": [
      "conflict detected",
      "invariant preserved",
      "user recovery clear"
    ],
    "variants": [
      {
        "id": "Y11.04-transfer-1",
        "task": "Implement the optimistic concurrency, conditional update, lost update contract for independent fictional store 2. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      },
      {
        "id": "Y11.04-transfer-2",
        "task": "Implement the optimistic concurrency, conditional update, lost update contract for independent fictional store 3. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      }
    ]
  },
  "Y11.05": {
    "contentHash": "abde47dea1c0ca486ff43b62203521eb1c922c4031eb3ec78df89143ffb375f2",
    "objective": "Use redacted logs and reproducible failure cases to diagnose a service.",
    "workbench": "python",
    "essentialChecks": [
      "useful event captured",
      "secret absent",
      "recovery verified"
    ],
    "variants": [
      {
        "id": "Y11.05-transfer-1",
        "task": "Implement the data minimisation, observability, recovery evidence contract for independent fictional store 2. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      },
      {
        "id": "Y11.05-transfer-2",
        "task": "Implement the data minimisation, observability, recovery evidence contract for independent fictional store 3. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      }
    ]
  },
  "Y11.06": {
    "contentHash": "d7eb00c423d19a3f098e5506ba493cdc3f762caee4dcb918ec027e1a872350ef",
    "objective": "Deliver a bounded service with compatible contracts, safe retries and conflict handling.",
    "workbench": "python",
    "essentialChecks": [
      "contracts pass",
      "duplicates safe",
      "conflict recovery evidenced"
    ],
    "variants": [
      {
        "id": "Y11.06-transfer-1",
        "task": "Implement the atomic commit, failure injection, service prototype, durable recovery contract for independent fictional store 2. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      },
      {
        "id": "Y11.06-transfer-2",
        "task": "Implement the atomic commit, failure injection, service prototype, durable recovery contract for independent fictional store 3. Execute both supplied actual HTTP cases, inspect committed and reopened state, and retain real private evidence without copying tokens into logs."
      }
    ]
  },
  "C-Y11-1-1": {
    "contentHash": "3099643f4d2a6ecf19838e63ac5e5f966e4ebca65065e52760a11ffb44e14553",
    "objective": "Reject a reused key with a changed payload while preserving the original receipt and stock.",
    "workbench": "python",
    "essentialChecks": [
      "Exact actual response contracts",
      "Committed scoped stock and revision",
      "One durable receipt per accepted key",
      "New connection recovers real state",
      "Minimal observed logs and saved evidence"
    ],
    "variants": [
      {
        "id": "C-Y11-1-1-transfer-1",
        "task": "Reject a reused key with a changed payload while preserving the original receipt and stock. Use independent fictional store 2, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      },
      {
        "id": "C-Y11-1-1-transfer-2",
        "task": "Reject a reused key with a changed payload while preserving the original receipt and stock. Use independent fictional store 3, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      }
    ]
  },
  "C-Y11-1-2": {
    "contentHash": "b5b092a163528ef72ee7ff3117b1dedf9efa5daae945070e87175d9c4fd4c259",
    "objective": "Accept an explicit zero integer, store its receipt once and replay its original response.",
    "workbench": "python",
    "essentialChecks": [
      "Exact actual response contracts",
      "Committed scoped stock and revision",
      "One durable receipt per accepted key",
      "New connection recovers real state",
      "Minimal observed logs and saved evidence"
    ],
    "variants": [
      {
        "id": "C-Y11-1-2-transfer-1",
        "task": "Accept an explicit zero integer, store its receipt once and replay its original response. Use independent fictional store 2, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      },
      {
        "id": "C-Y11-1-2-transfer-2",
        "task": "Accept an explicit zero integer, store its receipt once and replay its original response. Use independent fictional store 3, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      }
    ]
  },
  "C-Y11-1-3": {
    "contentHash": "8e59801696c2a0844d717ee4a177a0b832fc562aff66fa6f4d5bc4dc48459ef4",
    "objective": "Execute the same request key safely in two authenticated fictional scopes without cross-scope mutation.",
    "workbench": "python",
    "essentialChecks": [
      "Exact actual response contracts",
      "Committed scoped stock and revision",
      "One durable receipt per accepted key",
      "New connection recovers real state",
      "Minimal observed logs and saved evidence"
    ],
    "variants": [
      {
        "id": "C-Y11-1-3-transfer-1",
        "task": "Execute the same request key safely in two authenticated fictional scopes without cross-scope mutation. Use independent fictional store 2, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      },
      {
        "id": "C-Y11-1-3-transfer-2",
        "task": "Execute the same request key safely in two authenticated fictional scopes without cross-scope mutation. Use independent fictional store 3, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      }
    ]
  },
  "P-Y11-1": {
    "contentHash": "412891c8e887a2128eb0fdcb10ef31902b2ab10931a89b01217c0ca2e0d7c71f",
    "objective": "Preserve the working API, transaction and retry contracts while recovering actual accepted state from SQLite.",
    "workbench": "python",
    "essentialChecks": [
      "Exact actual response contracts",
      "Committed scoped stock and revision",
      "One durable receipt per accepted key",
      "New connection recovers real state",
      "Minimal observed logs and saved evidence"
    ],
    "variants": [
      {
        "id": "P-Y11-1-transfer-1",
        "task": "Preserve the working API, transaction and retry contracts while recovering actual accepted state from SQLite. Use independent fictional store 2, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      },
      {
        "id": "P-Y11-1-transfer-2",
        "task": "Preserve the working API, transaction and retry contracts while recovering actual accepted state from SQLite. Use independent fictional store 3, inspect actual requests, scoped records, receipts and reopened data, and save only observed evidence."
      }
    ]
  },
  "Y11.07": {
    "contentHash": "40ca9c5001937677052ac22a31b9b6ce905c5d88f56e4db66c3e9c9a2bd8b958",
    "objective": "Design validation, retention and deletion rules for synthetic data against stated needs.",
    "workbench": "python",
    "essentialChecks": [
      "rules justified",
      "access scoped",
      "lifecycle tests pass"
    ],
    "variants": [
      {
        "id": "Y11.07-transfer-1",
        "task": "Execute the data quality, retention, review hold, minimal projection, scoped lifecycle policy on independent fictional collection 2. Preserve all required boundary, subgroup and failure evidence without changing held-out labels or claiming production certification."
      },
      {
        "id": "Y11.07-transfer-2",
        "task": "Execute the data quality, retention, review hold, minimal projection, scoped lifecycle policy on independent fictional collection 3. Preserve all required boundary, subgroup and failure evidence without changing held-out labels or claiming production certification."
      }
    ]
  },
  "Y11.08": {
    "contentHash": "02b3329084c9c052e1189011aac38b661cb6801a71f45c03546ad655c2b54bb8",
    "objective": "Choose metrics tied to a fictional user's risks and test on separate data.",
    "workbench": "python",
    "essentialChecks": [
      "metrics correct",
      "data separation verified",
      "risk limits stated"
    ],
    "variants": [
      {
        "id": "Y11.08-transfer-1",
        "task": "Execute the held-out evaluation, confusion matrix, recall, risk limit policy on independent fictional collection 2. Preserve all required boundary, subgroup and failure evidence without changing held-out labels or claiming production certification."
      },
      {
        "id": "Y11.08-transfer-2",
        "task": "Execute the held-out evaluation, confusion matrix, recall, risk limit policy on independent fictional collection 3. Preserve all required boundary, subgroup and failure evidence without changing held-out labels or claiming production certification."
      }
    ]
  },
  "Y11.09": {
    "contentHash": "cbb90224f8d94ea0abefde325113bd36bf1ffa269bbb730853f4a1bff630d0c8",
    "objective": "Measure performance across synthetic groups and input shifts.",
    "workbench": "python",
    "essentialChecks": [
      "group results complete",
      "shift effects measured",
      "mitigation retested"
    ],
    "variants": [
      {
        "id": "Y11.09-transfer-1",
        "task": "Execute the subgroup evaluation, measurement shift, calibration, mitigation retest policy on independent fictional collection 2. Preserve all required boundary, subgroup and failure evidence without changing held-out labels or claiming production certification."
      },
      {
        "id": "Y11.09-transfer-2",
        "task": "Execute the subgroup evaluation, measurement shift, calibration, mitigation retest policy on independent fictional collection 3. Preserve all required boundary, subgroup and failure evidence without changing held-out labels or claiming production certification."
      }
    ]
  },
  "Y11.10": {
    "contentHash": "3eecc676671dd1c260625aad9d2a36f52cdbde94ec977f4e1d49d92d8a2d0535",
    "objective": "Design an interface that communicates uncertainty and offers appropriate human review.",
    "workbench": "web",
    "essentialChecks": [
      "uncertainty visible",
      "human review meaningful",
      "unsafe automation blocked"
    ],
    "variants": [
      {
        "id": "Y11.10-transfer-1",
        "task": "Deliver independent fictional material desk 2 with the exact tested version, real held-out score, low-vote deferral and explicit acknowledged local review. Retain limits and actual interaction evidence."
      },
      {
        "id": "Y11.10-transfer-2",
        "task": "Deliver independent fictional material desk 3 with the exact tested version, real held-out score, low-vote deferral and explicit acknowledged local review. Retain limits and actual interaction evidence."
      }
    ]
  },
  "Y11.11": {
    "contentHash": "82a75853f25e89f05ac8d05385d28400c21323550e622be923b9b7f8b7306814",
    "objective": "Evaluate generated software against specification, tests and supplied licence evidence.",
    "workbench": "python",
    "essentialChecks": [
      "behaviour verified",
      "provenance checked",
      "unsupported claims rejected"
    ],
    "variants": [
      {
        "id": "Y11.11-transfer-1",
        "task": "Review generated fixture 2: execute boundary/type tests, hash actual source bytes and validate this independent supplied provenance record without inventing a third-party licence. Save observed results and their limits."
      },
      {
        "id": "Y11.11-transfer-2",
        "task": "Review generated fixture 3: execute boundary/type tests, hash actual source bytes and validate this independent supplied provenance record without inventing a third-party licence. Save observed results and their limits."
      }
    ]
  },
  "Y11.12": {
    "contentHash": "8c0c68616f6cf2144e0d9558b6bf41119daa18869b8efd2bf2a696e052b68375",
    "objective": "Integrate an evaluated classifier into a bounded application with clear appropriate-use limits.",
    "workbench": "web",
    "essentialChecks": [
      "version identified",
      "held-out evaluation passes",
      "limitations communicated"
    ],
    "variants": [
      {
        "id": "Y11.12-transfer-1",
        "task": "Deliver independent fictional material desk 2 with the exact tested version, real held-out score, low-vote deferral and explicit acknowledged local review. Retain limits and actual interaction evidence."
      },
      {
        "id": "Y11.12-transfer-2",
        "task": "Deliver independent fictional material desk 3 with the exact tested version, real held-out score, low-vote deferral and explicit acknowledged local review. Retain limits and actual interaction evidence."
      }
    ]
  },
  "C-Y11-2-1": {
    "contentHash": "e50f7059cd4ec49c5aa84cfdf3e0b2a613ec21f4f7d6f84d0f471f6fb0558d21",
    "objective": "Distinguish disjoint identifiers from independent source observations and retain complete actual prediction evidence.",
    "workbench": "python",
    "essentialChecks": [
      "IDs and source overlaps separately measured",
      "Copied controlled fixture cannot claim independent evaluation",
      "All predictions and mistakes retained"
    ],
    "variants": [
      {
        "id": "C-Y11-2-1-transfer-1",
        "task": "Audit independent fictional collection 2 for both ID overlap and the controlled renamed source copy. Preserve all actual prediction evidence and limit the independence claim."
      },
      {
        "id": "C-Y11-2-1-transfer-2",
        "task": "Audit independent fictional collection 3 for both ID overlap and the controlled renamed source copy. Preserve all actual prediction evidence and limit the independence claim."
      }
    ]
  },
  "C-Y11-2-2": {
    "contentHash": "bdfc5e027c03e2addb5976a8430298d8d8d50f0e143998e0df87b11d3bc7681b",
    "objective": "Refuse unacknowledged local review while keeping model uncertainty and evaluation errors visible.",
    "workbench": "web",
    "essentialChecks": [
      "Unacknowledged review refused",
      "Acknowledged local review recorded",
      "Model errors retained"
    ],
    "variants": [
      {
        "id": "C-Y11-2-2-transfer-1",
        "task": "Enforce genuine acknowledgement at fictional desk 2. Execute the actual unacknowledged and acknowledged review actions and preserve uncertainty and measured errors."
      },
      {
        "id": "C-Y11-2-2-transfer-2",
        "task": "Enforce genuine acknowledgement at fictional desk 3. Execute the actual unacknowledged and acknowledged review actions and preserve uncertainty and measured errors."
      }
    ]
  },
  "C-Y11-2-3": {
    "contentHash": "18fd184ea8f5cfd60cb62b0f2865fe4e27efcbab61e54be259f164c8603f3fce",
    "objective": "Replace unsupported universal-safety claims with the actual error rate, uncertainty boundary and bounded-use limits.",
    "workbench": "web",
    "essentialChecks": [
      "Actual errors visible",
      "Vote share distinguished from certainty",
      "Bounded-use limits retained",
      "No silent automatic decisions"
    ],
    "variants": [
      {
        "id": "C-Y11-2-3-transfer-1",
        "task": "Repair the working limits for fictional desk 2. Preserve exact evaluated version, actual held-out evidence, uncertainty and explicit bounded-use communication."
      },
      {
        "id": "C-Y11-2-3-transfer-2",
        "task": "Repair the working limits for fictional desk 3. Preserve exact evaluated version, actual held-out evidence, uncertainty and explicit bounded-use communication."
      }
    ]
  },
  "P-Y11-2": {
    "contentHash": "50a672fbbf2d1104b4c2a747cd2628294954f11c2f174a7c90912aeaa49ba463",
    "objective": "Integrate a genuinely evaluated model, explicit local human review and honest limits into a private portfolio application.",
    "workbench": "web",
    "essentialChecks": [
      "Exact evaluated version active",
      "Held-out errors visible",
      "Low-vote decisions deferred",
      "Explicit acknowledged review",
      "Private source save/replay"
    ],
    "variants": [
      {
        "id": "P-Y11-2-transfer-1",
        "task": "Deliver and privately save desk 2 with the exact evaluated model, actual inference, honest limits and independently acknowledged local review. Demonstrate source replay and version restore."
      },
      {
        "id": "P-Y11-2-transfer-2",
        "task": "Deliver and privately save desk 3 with the exact evaluated model, actual inference, honest limits and independently acknowledged local review. Demonstrate source replay and version restore."
      }
    ]
  },
  "Y11.13": {
    "contentHash": "dab06b99e30d9a52379f6d0ff65d8e95b3ed7dc0acde7f4362bcf27902668771",
    "objective": "Define a meaningful user problem, exclusions and feasible evidence plan.",
    "workbench": "engineering",
    "essentialChecks": [
      "user need clear",
      "scope feasible",
      "criteria measurable"
    ],
    "variants": [
      {
        "id": "Y11.13-transfer-1",
        "task": "Scope independent private application 2 within 11 planned hours, preserve the user task and exclusions, and trace measurable implementation and verification evidence through an acyclic plan."
      },
      {
        "id": "Y11.13-transfer-2",
        "task": "Scope independent private application 3 within 12 planned hours, preserve the user task and exclusions, and trace measurable implementation and verification evidence through an acyclic plan."
      }
    ]
  },
  "Y11.14": {
    "contentHash": "7c26e24dfdc68e2a760557b2094ffb1209aa8ff10da75711f5ccc6e2f099dd90",
    "objective": "Create an architecture and usable prototype before full integration.",
    "workbench": "web",
    "essentialChecks": [
      "core task demonstrated",
      "design traceable",
      "feedback incorporated"
    ],
    "variants": [
      {
        "id": "Y11.14-transfer-1",
        "task": "Implement independent capstone 2: usable prototype, core task, feedback, architecture trace. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      },
      {
        "id": "Y11.14-transfer-2",
        "task": "Implement independent capstone 3: usable prototype, core task, feedback, architecture trace. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      }
    ]
  },
  "Y11.15": {
    "contentHash": "505267762a20b6138b805f128810fe593b96e2d5cd985df7685667b51c790ca3",
    "objective": "Implement a capstone slice spanning interface, logic and persistence.",
    "workbench": "web",
    "essentialChecks": [
      "slice runs end to end",
      "tests meaningful",
      "saved data correct"
    ],
    "variants": [
      {
        "id": "Y11.15-transfer-1",
        "task": "Implement independent capstone 2: vertical slice, shared contract, interface logic persistence, integration test. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      },
      {
        "id": "Y11.15-transfer-2",
        "task": "Implement independent capstone 3: vertical slice, shared contract, interface logic persistence, integration test. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      }
    ]
  },
  "Y11.16": {
    "contentHash": "92d3ee7076949b1fb90a955ac43d47a2db1ce18f586117f8a819a39645a27222",
    "objective": "Run authorized defensive and accessibility checks on the learner's isolated project.",
    "workbench": "web",
    "essentialChecks": [
      "access denied correctly",
      "keyboard tasks pass",
      "no sensitive disclosure"
    ],
    "variants": [
      {
        "id": "Y11.16-transfer-1",
        "task": "Implement independent capstone 2: authorised defensive test, native keyboard control, denial evidence, accessibility. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      },
      {
        "id": "Y11.16-transfer-2",
        "task": "Implement independent capstone 3: authorised defensive test, native keyboard control, denial evidence, accessibility. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      }
    ]
  },
  "Y11.18": {
    "contentHash": "623338a48758cf84fede803a903a1da820dc9a50c611dbf073a5ed9b5ba68baa",
    "objective": "Deliver a working private application and explain design, tests and limitations.",
    "workbench": "web",
    "essentialChecks": [
      "user goals met",
      "independence demonstrated",
      "portfolio artifacts reproducible"
    ],
    "variants": [
      {
        "id": "Y11.18-transfer-1",
        "task": "Implement independent capstone 2: private portfolio, reproducible artifact, confirmed state, saved version. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      },
      {
        "id": "Y11.18-transfer-2",
        "task": "Implement independent capstone 3: private portfolio, reproducible artifact, confirmed state, saved version. Demonstrate the actual core task and refused outcomes through interface, service, reopened database and saved snapshot."
      }
    ]
  },
  "Y11.17": {
    "contentHash": "512d38999b3536f95b31f01aee0ddcfeb0ca494191c5adff25179098d08b7027",
    "objective": "Use test results and user evidence to improve a capstone against its brief.",
    "workbench": "web",
    "essentialChecks": [
      "all outcomes reported",
      "change verified",
      "limitations evidenced"
    ],
    "variants": [
      {
        "id": "Y11.17-transfer-1",
        "task": "Evaluate independent capstone 2 from actual observed success and refused requests. Repair unsupported claims, preserve all outcomes and retest without inventing hosting or offline evidence."
      },
      {
        "id": "Y11.17-transfer-2",
        "task": "Evaluate independent capstone 3 from actual observed success and refused requests. Repair unsupported claims, preserve all outcomes and retest without inventing hosting or offline evidence."
      }
    ]
  },
  "C-Y11-3-1": {
    "contentHash": "cd6e5a1eb49926dabf19f20608ed8472f8da748fc9d2a7bebb042efc289173ba",
    "objective": "Validate the original quantity text without converting an empty draft into a saved zero.",
    "workbench": "web",
    "essentialChecks": [
      "Actual input/control contract",
      "Real service requests and no-change outcomes",
      "Confirmed quantity and revision",
      "Private snapshot remains consistent"
    ],
    "variants": [
      {
        "id": "C-Y11-3-1-transfer-1",
        "task": "Repair independent capstone 2: Validate the original quantity text without converting an empty draft into a saved zero. Execute the actual supplied boundary cases and preserve honest source, service and snapshot evidence."
      },
      {
        "id": "C-Y11-3-1-transfer-2",
        "task": "Repair independent capstone 3: Validate the original quantity text without converting an empty draft into a saved zero. Execute the actual supplied boundary cases and preserve honest source, service and snapshot evidence."
      }
    ]
  },
  "C-Y11-3-2": {
    "contentHash": "afcfb034092c4bf5cb19a0155ea168fa7da8d947d47e10f3f86c68e0514d7e2b",
    "objective": "Resume the actual saved snapshot and use its confirmed revision for the next accepted command.",
    "workbench": "web",
    "essentialChecks": [
      "Actual input/control contract",
      "Real service requests and no-change outcomes",
      "Confirmed quantity and revision",
      "Private snapshot remains consistent"
    ],
    "variants": [
      {
        "id": "C-Y11-3-2-transfer-1",
        "task": "Repair independent capstone 2: Resume the actual saved snapshot and use its confirmed revision for the next accepted command. Execute the actual supplied boundary cases and preserve honest source, service and snapshot evidence."
      },
      {
        "id": "C-Y11-3-2-transfer-2",
        "task": "Repair independent capstone 3: Resume the actual saved snapshot and use its confirmed revision for the next accepted command. Execute the actual supplied boundary cases and preserve honest source, service and snapshot evidence."
      }
    ]
  },
  "C-Y11-3-3": {
    "contentHash": "bd8086e10e84eefffc9218743dbf0ad838dea589c114e8aac7fed99a2f458a98",
    "objective": "Display real zero correctly and distinguish an explicit zero command from insufficient stock.",
    "workbench": "web",
    "essentialChecks": [
      "Actual input/control contract",
      "Real service requests and no-change outcomes",
      "Confirmed quantity and revision",
      "Private snapshot remains consistent"
    ],
    "variants": [
      {
        "id": "C-Y11-3-3-transfer-1",
        "task": "Repair independent capstone 2: Display real zero correctly and distinguish an explicit zero command from insufficient stock. Execute the actual supplied boundary cases and preserve honest source, service and snapshot evidence."
      },
      {
        "id": "C-Y11-3-3-transfer-2",
        "task": "Repair independent capstone 3: Display real zero correctly and distinguish an explicit zero command from insufficient stock. Execute the actual supplied boundary cases and preserve honest source, service and snapshot evidence."
      }
    ]
  },
  "P-Y11-3": {
    "contentHash": "b271fbdaf839a8282962c04a1201f71a883ad601b5f0682a50ca7931e5df98b5",
    "objective": "Deliver a runnable private application whose actual requests, saved state and claimed capabilities agree with its brief.",
    "workbench": "web",
    "essentialChecks": [
      "Real Add and Remove integration",
      "Actual service refusal preserved",
      "SQLite and private snapshot agree",
      "All observed outcomes retained",
      "No unsupported release claims"
    ],
    "variants": [
      {
        "id": "P-Y11-3-transfer-1",
        "task": "Deliver independent capstone 2, retain actual Add/Remove and refusal evidence, reconcile confirmed and saved state, and privately save/resume/restore the reproducible source without claiming untested hosting or audits."
      },
      {
        "id": "P-Y11-3-transfer-2",
        "task": "Deliver independent capstone 3, retain actual Add/Remove and refusal evidence, reconcile confirmed and saved state, and privately save/resume/restore the reproducible source without claiming untested hosting or audits."
      }
    ]
  },
  "Y11.19": {
    "contentHash": "9dc56eaeae8dac58f1d2a2936e0d2bd4f72f29edb5823c47b4fd6a335b6ebe02",
    "objective": "Review a fictional technology change and update privacy and reporting controls.",
    "workbench": "python",
    "essentialChecks": [
      "new risk identified",
      "controls revised",
      "suitable reporting retained"
    ],
    "variants": [
      {
        "id": "Y11.19-transfer-1",
        "task": "Review changed telemetry for fictional store 2. Exclude new token/free-form fields and unrelated scope, preserve observed route/status diagnostics and save the actual risk/control review without external reporting."
      },
      {
        "id": "Y11.19-transfer-2",
        "task": "Review changed telemetry for fictional store 3. Exclude new token/free-form fields and unrelated scope, preserve observed route/status diagnostics and save the actual risk/control review without external reporting."
      }
    ]
  },
  "Y11.20": {
    "contentHash": "f567ed1adee5bceffedad6faaf519a2c47bb46bcd2fa0a7a822c4eae4e3ea2ef",
    "objective": "Plan and execute a reversible upgrade in an isolated release simulator.",
    "workbench": "python",
    "essentialChecks": [
      "backup valid",
      "regression checks pass",
      "rollback demonstrated"
    ],
    "variants": [
      {
        "id": "Y11.20-transfer-1",
        "task": "Execute independent synthetic upgrade 2. Preserve the real backup, maintain the version-one consumer contract and demonstrate actual failed-candidate rollback and reopened data."
      },
      {
        "id": "Y11.20-transfer-2",
        "task": "Execute independent synthetic upgrade 3. Preserve the real backup, maintain the version-one consumer contract and demonstrate actual failed-candidate rollback and reopened data."
      }
    ]
  },
  "Y11.21": {
    "contentHash": "c1ba3144aa3acfd2baaea4efd4b8ea42f919a30c07e3beae199f96ef4c8fc4dd",
    "objective": "Create an original demonstration combining screen recording, visuals and accessible explanations.",
    "workbench": "web",
    "essentialChecks": [
      "claims accurate",
      "media permitted",
      "accessible alternative provided"
    ],
    "variants": [
      {
        "id": "Y11.21-transfer-1",
        "task": "Deliver independent original demonstration 2: repair the current observed alternative, execute the actual task, save the source and attach your own playable recording, written explanation, rights statement and limitation. Retain private save/replay/restore evidence."
      },
      {
        "id": "Y11.21-transfer-2",
        "task": "Deliver independent original demonstration 3: repair the current observed alternative, execute the actual task, save the source and attach your own playable recording, written explanation, rights statement and limitation. Retain private save/replay/restore evidence."
      }
    ]
  },
  "Y11.24": {
    "contentHash": "555a04278ddc4a0b93b45a62687d59155db4475ddabf7aa42113eff5bb7be99e",
    "objective": "Present a maintained application, original media demonstration and future learning plan.",
    "workbench": "web",
    "essentialChecks": [
      "release works",
      "change independent",
      "handover and evidence consistent"
    ],
    "variants": [
      {
        "id": "Y11.24-transfer-1",
        "task": "Deliver independent original demonstration 2: repair the current observed alternative, execute the actual task, save the source and attach your own playable recording, written explanation, rights statement and limitation. Retain private save/replay/restore evidence."
      },
      {
        "id": "Y11.24-transfer-2",
        "task": "Deliver independent original demonstration 3: repair the current observed alternative, execute the actual task, save the source and attach your own playable recording, written explanation, rights statement and limitation. Retain private save/replay/restore evidence."
      }
    ]
  },
  "Y11.22": {
    "contentHash": "7f3a80f6e386647d9daed82f5a428c5e20f6bc249b5a6f3169a9461deb2c6aa4",
    "objective": "Compare computing roles and choose portfolio evidence relevant to a fictional role.",
    "workbench": "python",
    "essentialChecks": [
      "role needs identified",
      "evidence linked",
      "next learning goal justified"
    ],
    "variants": [
      {
        "id": "Y11.22-transfer-1",
        "task": "Compare the fictional backend and quality roles against actual artifact version 2. Execute its real boundary/refusal cases, retain source hashes and link each claim to existing evidence with a justified next learning goal."
      },
      {
        "id": "Y11.22-transfer-2",
        "task": "Compare the fictional backend and quality roles against actual artifact version 3. Execute its real boundary/refusal cases, retain source hashes and link each claim to existing evidence with a justified next learning goal."
      }
    ]
  },
  "Y11.23": {
    "contentHash": "ef082240619242489bf23c8613cd4a4220ad1f6ef1e5a5be6b3a3d061233eacd",
    "objective": "Write a reproducible handover and answer evidence-based design questions.",
    "workbench": "python",
    "essentialChecks": [
      "setup reproducible",
      "decisions evidenced",
      "limitations clear"
    ],
    "variants": [
      {
        "id": "Y11.23-transfer-1",
        "task": "Repair independent handover 2, execute the documented actual module/callable, reproduce all supplied cases and defend its design with source hashes and precise limits."
      },
      {
        "id": "Y11.23-transfer-2",
        "task": "Repair independent handover 3, execute the documented actual module/callable, reproduce all supplied cases and defend its design with source hashes and precise limits."
      }
    ]
  },
  "C-Y11-4-1": {
    "contentHash": "92c94f0e2c7a9e454d069d22f9c9b23eefffac10217d7fc97004a789e069b5bb",
    "objective": "Demonstrate actual byte-preserving rollback rather than reconstructing a superficially equivalent record.",
    "workbench": "python",
    "essentialChecks": [
      "Backup actually validated",
      "Compatibility regression executed",
      "Failed candidate restores original bytes",
      "Reopened state correct"
    ],
    "variants": [
      {
        "id": "C-Y11-4-1-transfer-1",
        "task": "Demonstrate exact backup restoration for independent synthetic release 2. Execute the actual accepted and failed candidates and retain byte integrity, regression and reopening evidence."
      },
      {
        "id": "C-Y11-4-1-transfer-2",
        "task": "Demonstrate exact backup restoration for independent synthetic release 3. Execute the actual accepted and failed candidates and retain byte integrity, regression and reopening evidence."
      }
    ]
  },
  "C-Y11-4-2": {
    "contentHash": "e38d9aadf39b783b9ced9abe87fe1ed20adad2e9a06485446dc27e61b8295057",
    "objective": "Repair a stale callable in the real setup guide and reproduce boundary and refusal outcomes through that documented entry point.",
    "workbench": "python",
    "essentialChecks": [
      "Actual module and callable exist",
      "Documented setup used",
      "Source hash retained",
      "Boundary and refusal reproduced"
    ],
    "variants": [
      {
        "id": "C-Y11-4-2-transfer-1",
        "task": "Repair independent handover 2's stale callable, execute the documented current setup and preserve actual source, boundary and refusal evidence."
      },
      {
        "id": "C-Y11-4-2-transfer-2",
        "task": "Repair independent handover 3's stale callable, execute the documented current setup and preserve actual source, boundary and refusal evidence."
      }
    ]
  },
  "C-Y11-4-3": {
    "contentHash": "0fd401e1b7d1ae34016ca59892b48892abb614627ac6ae86dd6446040aa87fc9",
    "objective": "Retain a real original recording and an accessible written alternative that follows actual current request outcomes.",
    "workbench": "web",
    "essentialChecks": [
      "Written alternative present",
      "Actual success and refusals described",
      "Original source/visual permission stated",
      "Real source-bound clip attached independently"
    ],
    "variants": [
      {
        "id": "C-Y11-4-3-transfer-1",
        "task": "Repair independent demonstration 2's accessible alternative, execute all actual outcomes and attach your own current original clip with source rights and an honest limitation."
      },
      {
        "id": "C-Y11-4-3-transfer-2",
        "task": "Repair independent demonstration 3's accessible alternative, execute all actual outcomes and attach your own current original clip with source rights and an honest limitation."
      }
    ]
  },
  "P-Y11-4": {
    "contentHash": "c600e1efc26093755c9ad36063bde1f9eb53c9c4b4ba9ed67f57cfdc6167d4dc",
    "objective": "Present a current runnable application, source-bound original media, accessible explanation and an honest future learning plan.",
    "workbench": "web",
    "essentialChecks": [
      "Actual current application runs",
      "Success and refusal evidence agrees",
      "Confirmed and saved state agrees",
      "Real current original media attached",
      "Private save/replay/version restoration"
    ],
    "variants": [
      {
        "id": "P-Y11-4-transfer-1",
        "task": "Deliver independent maintained portfolio 2: actual current app and saved state, complete observed outcomes, private save/replay/restore and your own source-bound original recording with accessible handover, rights and a justified next learning goal."
      },
      {
        "id": "P-Y11-4-transfer-2",
        "task": "Deliver independent maintained portfolio 3: actual current app and saved state, complete observed outcomes, private save/replay/restore and your own source-bound original recording with accessible handover, rights and a justified next learning goal."
      }
    ]
  },
  "Y10.21": {
    "contentHash": "00c7d3e2fc7404c98dec4bf3ecb8a433fd61b4e097509e0437f891c1a09a8761",
    "objective": "Review a fictional change and supplied dependency record for maintainability and trust.",
    "workbench": "portfolio",
    "essentialChecks": [
      "behaviour reviewed",
      "provenance checked",
      "concerns actionable"
    ],
    "variants": [
      {
        "id": "Y10.21-transfer-1",
        "task": "Review the new original museum cards formatter's actual bytes, behaviour and supplied digest. Remove the unjustified microphone capability while preserving only format-text and honest local-source scope."
      },
      {
        "id": "Y10.21-transfer-2",
        "task": "Review the new original garden labels formatter's actual bytes, behaviour and supplied digest. Remove the unjustified microphone capability while preserving only format-text and honest local-source scope."
      }
    ]
  },
  "Y10.22": {
    "contentHash": "b9e72d43cbcc73c198514872ac1a3c9f8c479652d305829b8f1eb8699463e973",
    "objective": "Measure task completion and operation budgets against explicit requirements.",
    "workbench": "web",
    "essentialChecks": [
      "access retained",
      "measurements repeatable",
      "budget met"
    ],
    "variants": [
      {
        "id": "Y10.22-transfer-1",
        "task": "Repair Fictional museum inventory's native Save action, preserve labelled mobile controls and real two-request budget, and retain correct service success/refusal outcomes. Follow with actual three-width keyboard browser verification."
      },
      {
        "id": "Y10.22-transfer-2",
        "task": "Repair Fictional garden inventory's native Save action, preserve labelled mobile controls and real two-request budget, and retain correct service success/refusal outcomes. Follow with actual three-width keyboard browser verification."
      }
    ]
  },
  "Y10.23": {
    "contentHash": "3983523b1cae6aa40d4f5bd0af527a2c60fb35d96df2a9a80666e428d68b8a8c",
    "objective": "Compare actual acceptance results with a user brief and document limits.",
    "workbench": "web",
    "essentialChecks": [
      "claims traceable",
      "limitations honest",
      "next change justified"
    ],
    "variants": [
      {
        "id": "Y10.23-transfer-1",
        "task": "Evaluate Fictional museum inventory from actual observed responses, accepted saves, confirmed DOM and service state. Preserve adverse outcomes and keep public hosting, offline use and exhaustive security explicitly unverified."
      },
      {
        "id": "Y10.23-transfer-2",
        "task": "Evaluate Fictional garden inventory from actual observed responses, accepted saves, confirmed DOM and service state. Preserve adverse outcomes and keep public hosting, offline use and exhaustive security explicitly unverified."
      }
    ]
  },
  "Y10.24": {
    "contentHash": "d6f892bc6b7c4f0bba7a04eeae161f471338d91b2edc6a563f5a1fe752d6a30a",
    "objective": "Deliver a private application with database, API, recovery and a usable interface.",
    "workbench": "web",
    "essentialChecks": [
      "persistence works",
      "contracts and access tests pass",
      "evidence portfolio matches"
    ],
    "variants": [
      {
        "id": "Y10.24-transfer-1",
        "task": "Deliver Fictional museum inventory's actual persistent application. Preserve the first accepted update across a later 503 and explicit recovery read; verify DOM, real requests, reopened SQLite and private source/snapshot save/replay/restore without duplicate replay writes."
      },
      {
        "id": "Y10.24-transfer-2",
        "task": "Deliver Fictional garden inventory's actual persistent application. Preserve the first accepted update across a later 503 and explicit recovery read; verify DOM, real requests, reopened SQLite and private source/snapshot save/replay/restore without duplicate replay writes."
      }
    ]
  },
  "C-Y10-4-1": {
    "contentHash": "6ef4ee8b4bfa8a3a5e94b8b2ffbea94ec20fb4f6ac27fccd0b62be4442c48441",
    "objective": "Preserve a valid zero-unit adjustment through UI parsing, actual JSON request, revision and confirmed state.",
    "workbench": "web",
    "essentialChecks": [
      "Zero accepted in both directions",
      "Actual integer-zero write occurs",
      "Quantity unchanged and revision advances under the supplied contract"
    ],
    "variants": [
      {
        "id": "C-Y10-4-1-transfer-1",
        "task": "Preserve zero through both directions in Fictional museum inventory. Submit the actual integer-zero request, retain quantity and show the accepted revision without confusing zero with missing input."
      },
      {
        "id": "C-Y10-4-1-transfer-2",
        "task": "Preserve zero through both directions in Fictional garden inventory. Submit the actual integer-zero request, retain quantity and show the accepted revision without confusing zero with missing input."
      }
    ]
  },
  "C-Y10-4-2": {
    "contentHash": "5902bbf7de4a43efb0c0c97cf74b22a624f520930e11ef02b380af5341bfe4cb",
    "objective": "Recover a stale view through a real service read while preserving revision-conflict protection.",
    "workbench": "web",
    "essentialChecks": [
      "Separate real request changes server state",
      "Stale save refused",
      "Reload actually reads and displays the accepted revision"
    ],
    "variants": [
      {
        "id": "C-Y10-4-2-transfer-1",
        "task": "Recover Fictional museum inventory's view after the separate actual client change. Preserve 409 on a stale save and make a real reload GET before displaying the new confirmed revision."
      },
      {
        "id": "C-Y10-4-2-transfer-2",
        "task": "Recover Fictional garden inventory's view after the separate actual client change. Preserve 409 on a stale save and make a real reload GET before displaying the new confirmed revision."
      }
    ]
  },
  "C-Y10-4-3": {
    "contentHash": "db048704c3df166dc09e0070941462f58e0edf957cc4f40b2d3ea95a0edc8d32",
    "objective": "Load actual saved quantity/revision and use them in the first post-resume write.",
    "workbench": "web",
    "essentialChecks": [
      "Saved snapshot actually loaded",
      "Non-zero revision retained",
      "First resumed write succeeds against actual current state"
    ],
    "variants": [
      {
        "id": "C-Y10-4-3-transfer-1",
        "task": "Resume Fictional museum inventory from the actual supplied snapshot, preserve its non-zero revision and perform the first valid new write without resetting state or weakening conflict protection."
      },
      {
        "id": "C-Y10-4-3-transfer-2",
        "task": "Resume Fictional garden inventory from the actual supplied snapshot, preserve its non-zero revision and perform the first valid new write without resetting state or weakening conflict protection."
      }
    ]
  },
  "P-Y10-4": {
    "contentHash": "6da4a35580aaab42abd5bc526d64611efb8c3589c1e1d063c15a6f476e526fb5",
    "objective": "Integrate a responsive usable client, actual local API/SQLite, saved snapshot and failure-preserving evidence-backed review.",
    "workbench": "web",
    "essentialChecks": [
      "Accepted update survives failed refresh",
      "DOM, requests and reopened database agree",
      "Actual adverse outcomes remain in the review",
      "Private source/snapshot save and replay functional"
    ],
    "variants": [
      {
        "id": "P-Y10-4-transfer-1",
        "task": "Deliver Fictional museum inventory's private persistent application and honest review. Preserve accepted state through failed refresh/recovery, retain actual adverse evidence and demonstrate secure private source/snapshot save, replay and restore."
      },
      {
        "id": "P-Y10-4-transfer-2",
        "task": "Deliver Fictional garden inventory's private persistent application and honest review. Preserve accepted state through failed refresh/recovery, retain actual adverse evidence and demonstrate secure private source/snapshot save, replay and restore."
      }
    ]
  },
  "C-Y7-1-1": {
    "contentHash": "25a25ae75fe4739d2564a6e9b9140ebfc20977520317a4b97b57c02e71ccf880",
    "objective": "Compose a strict input parser with a multi-condition decision without treating missing input or valid zero as the wrong state.",
    "workbench": "python",
    "essentialChecks": [
      "The text contract is enforced before use",
      "All required conditions must hold",
      "Valid zero remains distinct from missing input"
    ],
    "variants": [
      {
        "id": "C-Y7-1-1-transfer-1",
        "task": "Compose the new strict text contract 1..12 with active and supplied capacity. Return result and valid, then eligible only if all three requirements hold. Reject blank input without coercion and test both active and inactive cases."
      },
      {
        "id": "C-Y7-1-1-transfer-2",
        "task": "Compose the new strict text contract 2..15 with active and supplied capacity. Return result and valid, then eligible only if all three requirements hold. Reject blank input without coercion and test both active and inactive cases."
      }
    ]
  },
  "C-Y7-1-2": {
    "contentHash": "711339250a0f38112d01d1bb08724131ec760a991c7e7ecdaec0b5fa34daf6ef",
    "objective": "Locate an omitted final item across a module boundary and verify the returned collection record on empty and single-item inputs.",
    "workbench": "python",
    "essentialChecks": [
      "Every item appears exactly once in order",
      "Count and transformed total agree with actual records",
      "Separate calls preserve input collections"
    ],
    "variants": [
      {
        "id": "C-Y7-1-2-transfer-1",
        "task": "Repair the imported component for scaled=value times 3 and displayed position=index plus 1. Return every record, its transformed total and count, preserve input and verify separate empty and single-item calls."
      },
      {
        "id": "C-Y7-1-2-transfer-2",
        "task": "Repair the imported component for scaled=value times -1 and displayed position=index plus 0. Return every record, its transformed total and count, preserve input and verify separate empty and single-item calls."
      }
    ]
  },
  "C-Y7-1-3": {
    "contentHash": "4f663fbbbefbbe1a7dc9bea00bdf0bd6b99647a91843e2014a523e536c75febc",
    "objective": "Reconstruct a typed quiz normaliser across real supporting files without silently converting missing responses into correct answers.",
    "workbench": "python",
    "essentialChecks": [
      "Blank responses remain invalid",
      "Supported text is trimmed and case-normalised",
      "Wrong valid answers differ from invalid input and replay resets"
    ],
    "variants": [
      {
        "id": "C-Y7-1-3-transfer-1",
        "task": "Implement the stored text question for def. Accept trimmed case-insensitive ASCII alphabetic words, reject blank and numeric responses without inventing an answer, preserve choice validation and verify actual replay and evidence files."
      },
      {
        "id": "C-Y7-1-3-transfer-2",
        "task": "Implement the stored text question for for. Accept trimmed case-insensitive ASCII alphabetic words, reject blank and numeric responses without inventing an answer, preserve choice validation and verify actual replay and evidence files."
      }
    ]
  },
  "P-Y7-1": {
    "contentHash": "35faf0b738f95b59147f368c777c91e4ba2a49da979ea390379eeece99a59a23",
    "objective": "Deliver a stored multi-type quiz whose validation, weighted scoring and replay remain correct when question order changes.",
    "workbench": "python",
    "essentialChecks": [
      "Answers are associated by stable question ID",
      "False, zero, wrong and missing responses are distinguished",
      "Weighted scores, replay, order validation and saved evidence agree"
    ],
    "variants": [
      {
        "id": "P-Y7-1-transfer-1",
        "task": "Independently replace empty with keyword in the real bank: its answer is return, supported input is trimmed case-insensitive ASCII alphabetic text, and both extended questions are worth 3 points. Add the text normaliser, preserve stable-ID association and fresh replay, reject invalid orders and update actual private evidence without mutating the bank."
      },
      {
        "id": "P-Y7-1-transfer-2",
        "task": "Independently replace empty with keyword in the real bank: its answer is def, supported input is trimmed case-insensitive ASCII alphabetic text, and both extended questions are worth 4 points. Add the text normaliser, preserve stable-ID association and fresh replay, reject invalid orders and update actual private evidence without mutating the bank."
      }
    ]
  },
  "Y7.07": {
    "contentHash": "62ed1ee5cb37bf9c35d9de195af4cd55a64bbc1a3a0352c793a49973a2235db4",
    "objective": "Operate a model linking input devices, processor, memory and output.",
    "workbench": "python",
    "essentialChecks": [
      "roles correct",
      "data path traced",
      "diagnosis evidenced"
    ],
    "variants": [
      {
        "id": "Y7.07-transfer-1",
        "task": "Diagnose the new scanner → cpu → ram → speaker model. Assign all five roles correctly, add 2 in the processor, preserve actual file storage through the model's RAM-clearing step and verify both supplied readings."
      },
      {
        "id": "Y7.07-transfer-2",
        "task": "Diagnose the new sensor → cpu → ram → display model. Assign all five roles correctly, add 3 in the processor, preserve actual file storage through the model's RAM-clearing step and verify both supplied readings."
      }
    ]
  },
  "Y7.08": {
    "contentHash": "d90f1c2a67c743b2ea752f8c8691a412d7106f710a00eca5e715082b1868cdb8",
    "objective": "Step a simplified fetch-decode-execute model and track state.",
    "workbench": "systems",
    "essentialChecks": [
      "instruction order correct",
      "state transitions correct",
      "model limits stated"
    ],
    "variants": [
      {
        "id": "Y7.08-transfer-1",
        "task": "Trace the new branch program whose payload is at memory address 2. A non-zero address-zero flag must jump to instruction five, load 2, output it and halt; a zero flag must output zero. Repair the faulty target and explain the actual counter transitions and limits."
      },
      {
        "id": "Y7.08-transfer-2",
        "task": "Trace the new branch program whose payload is at memory address 4. A non-zero address-zero flag must jump to instruction five, load 4, output it and halt; a zero flag must output zero. Repair the faulty target and explain the actual counter transitions and limits."
      }
    ]
  },
  "Y7.09": {
    "contentHash": "25a53cc01035e3d352b7ee90f173ac82c093ce069d31fb762659bbc19558f570",
    "objective": "Represent values in binary and convert both ways within a stated width.",
    "workbench": "python",
    "essentialChecks": [
      "conversion correct",
      "width respected",
      "overflow recognised"
    ],
    "variants": [
      {
        "id": "Y7.09-transfer-1",
        "task": "Implement unsigned 6-bit encoding and decoding using exact place values and leading zeros. Accept values 0..63, reject overflow and wrong-width words, and report both actual conversions with explicit validity."
      },
      {
        "id": "Y7.09-transfer-2",
        "task": "Implement unsigned 8-bit encoding and decoding using exact place values and leading zeros. Accept values 0..255, reject overflow and wrong-width words, and report both actual conversions with explicit validity."
      }
    ]
  },
  "Y7.10": {
    "contentHash": "47120df994d95fded680c730ea85b9b112368d5f5542495e1e0270ee16a36122",
    "objective": "Add fixed-width binary values and explain carry bits.",
    "workbench": "python",
    "essentialChecks": [
      "sum correct",
      "carry trace correct",
      "overflow handled"
    ],
    "variants": [
      {
        "id": "Y7.10-transfer-1",
        "task": "Implement actual 5-bit column addition, validating both operands in 0..31. Propagate every carry, return the exact stored word and decimal value, report final overflow and show all executed carry rows."
      },
      {
        "id": "Y7.10-transfer-2",
        "task": "Implement actual 6-bit column addition, validating both operands in 0..63. Propagate every carry, return the exact stored word and decimal value, report final overflow and show all executed carry rows."
      }
    ]
  },
  "Y7.11": {
    "contentHash": "cef351e0099f00f28671b3a2481a8939cf085e747e737a751e052dcbb1a03e45",
    "objective": "Build simple AND, OR and NOT circuits and predict outputs.",
    "workbench": "systems",
    "essentialChecks": [
      "all truth rows pass",
      "fault isolated",
      "circuit-program link explained"
    ],
    "variants": [
      {
        "id": "Y7.11-transfer-1",
        "task": "Construct the gate composition for (A or B) and not C. Repair the wrong signal, evaluate every truth combination and record the equivalent Boolean program condition."
      },
      {
        "id": "Y7.11-transfer-2",
        "task": "Construct the gate composition for not (A and B). Repair the wrong signal, evaluate every truth combination and record the equivalent Boolean program condition."
      }
    ]
  },
  "Y7.12": {
    "contentHash": "61de2048a9c0c4c8ffbd121c3f313a19fec5b476ce313b4277b75868f95c913f",
    "objective": "Combine a small instruction trace, memory values and logic-controlled output.",
    "workbench": "systems",
    "essentialChecks": [
      "trace reproducible",
      "stored state correct",
      "simplifications explained"
    ],
    "variants": [
      {
        "id": "Y7.12-transfer-1",
        "task": "Execute the new program/input pair using SUB and destination 6. Store the actual arithmetic result, use the address-two enable flag to choose that stored value or zero, repair the unrelated address-four output and reproduce the exact trace with limits explained."
      },
      {
        "id": "Y7.12-transfer-2",
        "task": "Execute the new program/input pair using ADD and destination 7. Store the actual arithmetic result, use the address-two enable flag to choose that stored value or zero, repair the unrelated address-four output and reproduce the exact trace with limits explained."
      }
    ]
  },
  "C-Y7-2-1": {
    "contentHash": "eee3665b8e989e938bde33a89630ef0031cdad628cbe0e30c809d45f2abcae31",
    "objective": "Repair a stored-program countdown loop and verify output, counter storage and zero termination from its actual trace.",
    "workbench": "systems",
    "essentialChecks": [
      "Each positive count appears once",
      "Zero produces no output",
      "The actual stored counter reaches zero and HALT"
    ],
    "variants": [
      {
        "id": "C-Y7-2-1-transfer-1",
        "task": "Relocate the actual countdown state to address 5, retaining address one as the decrement. Repair the loop, preserve descending output and handle zero without output."
      },
      {
        "id": "C-Y7-2-1-transfer-2",
        "task": "Relocate the actual countdown state to address 7, retaining address one as the decrement. Repair the loop, preserve descending output and handle zero without output."
      }
    ]
  },
  "C-Y7-2-2": {
    "contentHash": "6abb9c1a16dd14c504447f63ea1f9e1be7cc7abc107cf0049e0b4ebac4e4e78a",
    "objective": "Verify one width-limited addition through actual instructions, stored memory, binary representation and final carry.",
    "workbench": "systems",
    "essentialChecks": [
      "The STORE and subsequent LOAD refer to the same result",
      "The binary word matches the stored decimal value",
      "Overflow agrees with the final carry"
    ],
    "variants": [
      {
        "id": "C-Y7-2-2-transfer-1",
        "task": "Reconcile the actual 5-bit computer addition with its binary panel. Repair the stale reload and check zero, ordinary addition and the new 31 plus one overflow boundary."
      },
      {
        "id": "C-Y7-2-2-transfer-2",
        "task": "Reconcile the actual 6-bit computer addition with its binary panel. Repair the stale reload and check zero, ordinary addition and the new 63 plus one overflow boundary."
      }
    ]
  },
  "C-Y7-2-3": {
    "contentHash": "5611f9fecc4ab68d66a1970f0f8fb5670bedadb5f25fe3c4efc4a727f540a321",
    "objective": "Repair a gate composition using exhaustive truth rows, including the equal-true case that separates OR and XOR.",
    "workbench": "systems",
    "essentialChecks": [
      "All four input combinations match",
      "Equal true inputs distinguish the seeded wrong gate",
      "The program condition agrees with the wired board"
    ],
    "variants": [
      {
        "id": "C-Y7-2-3-transfer-1",
        "task": "Build the equal-switch indicator using the actual XOR then NOT composition. Verify every truth row even when the unrelated binary panel changes."
      },
      {
        "id": "C-Y7-2-3-transfer-2",
        "task": "Build the different-switch indicator using the actual XOR composition. Verify every truth row even when the unrelated binary panel changes."
      }
    ]
  },
  "P-Y7-2": {
    "contentHash": "bbb0fa2a34bbcf481353ed54a5a8955f5562c03034f1ff7358b425c036c277cd",
    "objective": "Create an executable computer model with a terminating counted loop, stored running total, zero-case branch and trace-backed result.",
    "workbench": "systems",
    "essentialChecks": [
      "The actual loop adds every required count",
      "Zero has a correct empty-task path",
      "The final output reads the newly stored total",
      "The explanation states model and input limits"
    ],
    "variants": [
      {
        "id": "P-Y7-2-transfer-1",
        "task": "Create the new stored-program brief: counter at zero, decrement at one, result at 7, add each counter value once. Handle zero, output exactly once from the result cell, terminate and state the zero-through-five/model limits."
      },
      {
        "id": "P-Y7-2-transfer-2",
        "task": "Create the new stored-program brief: counter at zero, decrement at one, result at 8, add twice each counter value. Handle zero, output exactly once from the result cell, terminate and state the zero-through-five/model limits."
      }
    ]
  },
  "Y7.13": {
    "contentHash": "1351f62f29c5275477fe7f324f3b1e5fa76280718533e37d3c0c659b0c4c49f7",
    "objective": "Define relevant state and omit irrelevant detail for a small simulation.",
    "workbench": "python",
    "essentialChecks": [
      "state sufficient",
      "omissions justified",
      "predictions testable"
    ],
    "variants": [
      {
        "id": "Y7.13-transfer-1",
        "task": "Model a new fictional queue with capacity 3 jobs per step, arrivals before service and the same explicit omissions. Recalculate actual state on all supplied histories rather than changing only its caption."
      },
      {
        "id": "Y7.13-transfer-2",
        "task": "Model a new fictional queue with capacity 4 jobs per step, arrivals before service and the same explicit omissions. Recalculate actual state on all supplied histories rather than changing only its caption."
      }
    ]
  },
  "Y7.14": {
    "contentHash": "106f09bfa0bc8c6cd3d5b87478b8b47e2baa1cccc652eac4c2f4e56c19c3958e",
    "objective": "Implement linear search and trace successful and unsuccessful cases.",
    "workbench": "python",
    "essentialChecks": [
      "found case correct",
      "absent handled",
      "trace accurate"
    ],
    "variants": [
      {
        "id": "Y7.14-transfer-1",
        "task": "Implement the last-matching-index contract, returning None for absence and recording every actual comparison. Preserve empty-list and valid-zero behaviour."
      },
      {
        "id": "Y7.14-transfer-2",
        "task": "Implement the first-matching-index contract, returning None for absence and recording every actual comparison. Preserve empty-list and valid-zero behaviour."
      }
    ]
  },
  "Y7.15": {
    "contentHash": "32426452040035f1591b50f74bf68a190e5967a6aeca247eec76a4ace406416e",
    "objective": "Implement a simple sorting procedure and trace passes.",
    "workbench": "python",
    "essentialChecks": [
      "order correct",
      "values preserved",
      "passes explained"
    ],
    "variants": [
      {
        "id": "Y7.15-transfer-1",
        "task": "Implement descending adjacent-swap sorting with copied pass snapshots and exact shrinking-loop comparisons. Preserve duplicates, negatives, empty lists and zero."
      },
      {
        "id": "Y7.15-transfer-2",
        "task": "Implement ascending adjacent-swap sorting with copied pass snapshots and exact shrinking-loop comparisons. Preserve duplicates, negatives, empty lists and zero."
      }
    ]
  },
  "Y7.16": {
    "contentHash": "e8b21274de2d651778ab67769d2e4ca169cebeb17e4fbf3612bdf3604869035a",
    "objective": "Compare operation counts on identical inputs.",
    "workbench": "python",
    "essentialChecks": [
      "conditions equal",
      "counts correct",
      "conclusion bounded"
    ],
    "variants": [
      {
        "id": "Y7.16-transfer-1",
        "task": "Compare full and early-exit descending sorting on identical original input copies, reporting actual pass/count evidence and a bounded comparison-only conclusion."
      },
      {
        "id": "Y7.16-transfer-2",
        "task": "Compare full and early-exit ascending sorting on identical original input copies, reporting actual pass/count evidence and a bounded comparison-only conclusion."
      }
    ]
  },
  "Y7.17": {
    "contentHash": "66d163a83e3acb1c5e25f14974f1368df5c8e71f56cf8ad546c2917498cdb84b",
    "objective": "Implement a discrete simulation with explicit units and update order.",
    "workbench": "python",
    "essentialChecks": [
      "units consistent",
      "state updates correct",
      "assumptions recorded"
    ],
    "variants": [
      {
        "id": "Y7.17-transfer-1",
        "task": "Implement the motion model with dt supplied in minutes, converted once to seconds. Preserve initial state, position-before-velocity updates and actual histories, including zero steps. State numerical and physical omissions."
      },
      {
        "id": "Y7.17-transfer-2",
        "task": "Implement the motion model with dt supplied in seconds. Preserve initial state, position-before-velocity updates and actual histories, including zero steps. State numerical and physical omissions."
      }
    ]
  },
  "Y7.18": {
    "contentHash": "e580b194e7f6ab6b2295f81677e4e08d4ad3c30b7be50a9d69518a5c02e290b1",
    "objective": "Combine a runnable search, sorting trace and small simulation with evidence.",
    "workbench": "python",
    "essentialChecks": [
      "programs run",
      "comparison fair",
      "assumptions supported"
    ],
    "variants": [
      {
        "id": "Y7.18-transfer-1",
        "task": "Integrate descending sort comparison and a motion model whose dt is supplied in seconds. Preserve actual first-match evidence, fair inputs, real JSON output and a truthful visible summary."
      },
      {
        "id": "Y7.18-transfer-2",
        "task": "Integrate ascending sort comparison and a motion model whose dt is supplied in minutes. Preserve actual first-match evidence, fair inputs, real JSON output and a truthful visible summary."
      }
    ]
  },
  "C-Y7-3-1": {
    "contentHash": "0a73587c9585408311641d7d8e6aa0110fd6ebb2871fa0837862376c093fb3f2",
    "objective": "Compose sorting and search without reporting a sorted-list position as an original-list position.",
    "workbench": "python",
    "essentialChecks": [
      "Original and sorted indexes use their own collections",
      "Both actual traces agree with those indexes",
      "Absence and duplicates retain their stated first-match meaning"
    ],
    "variants": [
      {
        "id": "C-Y7-3-1-transfer-1",
        "task": "Search the original and descending-sorted collections separately. Return correctly labelled indexes and actual traces, preserving original values and explicit absence."
      },
      {
        "id": "C-Y7-3-1-transfer-2",
        "task": "Search the original and ascending-sorted collections separately. Return correctly labelled indexes and actual traces, preserving original values and explicit absence."
      }
    ]
  },
  "C-Y7-3-2": {
    "contentHash": "986b14f9e7e9f32d09bf8fb3f20fb4c083d188fb950f383218e204f66e3c98bf",
    "objective": "Apply a comparison budget to the correct executed algorithm while preserving a controlled experiment.",
    "workbench": "python",
    "essentialChecks": [
      "Both algorithms run on identical inputs",
      "Selection uses the selected algorithm's actual comparisons",
      "An exact-budget result qualifies and empty work remains zero"
    ],
    "variants": [
      {
        "id": "C-Y7-3-2-transfer-1",
        "task": "Run both descending algorithms fairly and apply budget to the early-exit result's actual count. Include exact-budget and zero-work boundaries and keep the metric limited to comparisons."
      },
      {
        "id": "C-Y7-3-2-transfer-2",
        "task": "Run both ascending algorithms fairly and apply budget to the early-exit result's actual count. Include exact-budget and zero-work boundaries and keep the metric limited to comparisons."
      }
    ]
  },
  "C-Y7-3-3": {
    "contentHash": "f7f2e163a76a81c768800000fc051811d050ed5337ca12be297953a903139ac4",
    "objective": "Demonstrate that equivalent time inputs produce identical complete simulation histories after correct conversion.",
    "workbench": "python",
    "essentialChecks": [
      "Conversion is in the correct direction",
      "Both actual complete histories agree",
      "Zero duration and zero steps retain meaningful states"
    ],
    "variants": [
      {
        "id": "C-Y7-3-3-transfer-1",
        "task": "A duration tick now means 30 seconds. Convert by the stated factor, run the full simulation alongside the supplied equivalent seconds and demonstrate equality on ordinary, zero-duration and zero-step inputs."
      },
      {
        "id": "C-Y7-3-3-transfer-2",
        "task": "A duration tick now means 2 seconds. Convert by the stated factor, run the full simulation alongside the supplied equivalent seconds and demonstrate equality on ordinary, zero-duration and zero-step inputs."
      }
    ]
  },
  "P-Y7-3": {
    "contentHash": "c9984fb5747048491bd326991cc7889a9d673d090d03dd346bbe1ec6da093a06",
    "objective": "Build a multi-query, file-backed search/sort/simulation notebook whose saved evidence and visible report agree with actual execution.",
    "workbench": "python",
    "essentialChecks": [
      "Real supplied file data drives all target queries",
      "Both sorts receive the same original data",
      "Simulation uses the stated tick duration",
      "Rendered and saved evidence agree with actual traces"
    ],
    "variants": [
      {
        "id": "P-Y7-3-transfer-1",
        "task": "Complete the independent file-backed notebook with descending sorts and 2 seconds per tick. Preserve per-query first-match evidence, controlled input copies, truthful rendered rows and actual saved JSON."
      },
      {
        "id": "P-Y7-3-transfer-2",
        "task": "Complete the independent file-backed notebook with ascending sorts and 3 seconds per tick. Preserve per-query first-match evidence, controlled input copies, truthful rendered rows and actual saved JSON."
      }
    ]
  },
  "Y7.19": {
    "contentHash": "b940383b302b9a3b2dadf33754a755854c1e40646a7828d13fe4736da41601ef",
    "objective": "Encode and decode text using a supplied character table.",
    "workbench": "python",
    "essentialChecks": [
      "round-trip correct",
      "table identified",
      "ambiguity explained"
    ],
    "variants": [
      {
        "id": "Y7.19-transfer-1",
        "task": "Use fictional-signal-B with symbols \"C\"=00, \"B\"=01, \"A\"=10, \" \"=11. Rebuild both directions under this exact table identity, preserve empty/space text and reject malformed input."
      },
      {
        "id": "Y7.19-transfer-2",
        "task": "Use fictional-signal-C with symbols \"B\"=00, \" \"=01, \"C\"=10, \"A\"=11. Rebuild both directions under this exact table identity, preserve empty/space text and reject malformed input."
      }
    ]
  },
  "Y7.20": {
    "contentHash": "f58f01c8167108b8e6b87bc2bce9f808502e9ded4d2ddad7c8181891541c02c9",
    "objective": "Manipulate pixel values and sound samples and measure representation changes.",
    "workbench": "python",
    "essentialChecks": [
      "representation traced",
      "size comparison correct",
      "quality trade-off explained"
    ],
    "variants": [
      {
        "id": "Y7.20-transfer-1",
        "task": "Keep every 2th source value and quantise to 2 bits per value. Recompute both actual arrays, payload sizes, sound rate and duration; preserve truthful quality limits and the real saved evidence file."
      },
      {
        "id": "Y7.20-transfer-2",
        "task": "Keep every 4th source value and quantise to 8 bits per value. Recompute both actual arrays, payload sizes, sound rate and duration; preserve truthful quality limits and the real saved evidence file."
      }
    ]
  },
  "Y7.21": {
    "contentHash": "74b9640ae535aeb3a597ec2dfe044becb29213243b267bd9aa6fd6dedd232dfe",
    "objective": "Move a synthetic dataset between program, spreadsheet and chart tool.",
    "workbench": "data",
    "essentialChecks": [
      "values preserved",
      "transformation checked",
      "outputs consistent"
    ],
    "variants": [
      {
        "id": "Y7.21-transfer-1",
        "task": "Transfer Fictional seed heights through explicit amount conversion, ordered numeric total, parsed C1:C3 spreadsheet sum/count and a labelled zero-based chart in model centimetres. Preserve all records and reconcile every actual output."
      },
      {
        "id": "Y7.21-transfer-2",
        "task": "Transfer Fictional toy journeys through explicit amount conversion, ordered numeric total, parsed C1:C3 spreadsheet sum/count and a labelled zero-based chart in model squares. Preserve all records and reconcile every actual output."
      }
    ]
  },
  "Y7.22": {
    "contentHash": "8ffb98626088d3df68cfeba45a0bb29575505f40f3d7264ce5717c9df239e2fd",
    "objective": "Translate an accessibility need into a measurable design criterion.",
    "workbench": "data",
    "essentialChecks": [
      "need explicit",
      "criterion measurable",
      "improvement verified"
    ],
    "variants": [
      {
        "id": "Y7.22-transfer-1",
        "task": "Adapt Fictional seed heights for the same fictional reader: actual 22-pixel chart text, category/value labels, complete numeric table and an explicit non-colour reading route. Verify the new actual measurements in either input order."
      },
      {
        "id": "Y7.22-transfer-2",
        "task": "Adapt Fictional toy journeys for the same fictional reader: actual 22-pixel chart text, category/value labels, complete numeric table and an explicit non-colour reading route. Verify the new actual measurements in either input order."
      }
    ]
  },
  "Y7.23": {
    "contentHash": "c226df18aeb3e85500c19729c577c28b24fe4ba1283edf70c98ab948c89ce719",
    "objective": "Apply a threat-and-help plan to fictional content, contact and conduct concerns.",
    "workbench": "scenario",
    "essentialChecks": [
      "privacy protected",
      "report route appropriate",
      "minimal evidence retained"
    ],
    "variants": [
      {
        "id": "Y7.23-transfer-1",
        "task": "Handle the fictional contact concern using its matching route, only this minimal description: Fictional item ref-contact: unknown account asks for private details; no details attached. Stop interaction, seek trusted adult help and retain it privately. No copied content or real report may be sent."
      },
      {
        "id": "Y7.23-transfer-2",
        "task": "Handle the fictional conduct concern using its matching route, only this minimal description: Fictional item ref-conduct: repeated unkind messages; no message copy attached. Stop interaction, seek trusted adult help and retain it privately. No copied content or real report may be sent."
      }
    ]
  },
  "Y7.24": {
    "contentHash": "ed182d02f82fae9e486ef656d710271560fbf0db245e12dd2a223cf46e01684f",
    "objective": "Produce an accessible report combining code, data, charts and source evaluation.",
    "workbench": "python",
    "essentialChecks": [
      "analysis correct",
      "audience needs met",
      "trust and privacy justified"
    ],
    "variants": [
      {
        "id": "Y7.24-transfer-1",
        "task": "Create the Fictional seed models report using category mean in model centimetres. Read its source notes, minimise retained fields, calculate actual summaries, implement the 22-pixel/non-colour/table criteria and keep the saved/displayed claim bounded to the synthetic sample."
      },
      {
        "id": "Y7.24-transfer-2",
        "task": "Create the Fictional toy journeys report using category total in model squares. Read its source notes, minimise retained fields, calculate actual summaries, implement the 22-pixel/non-colour/table criteria and keep the saved/displayed claim bounded to the synthetic sample."
      }
    ]
  },
  "C-Y7-4-1": {
    "contentHash": "0eff478163c426c043655d00fa8dc9cc4cd00f1069d817954f3171d65bc6ba66",
    "objective": "Transcode an actual fixed-width payload between identified tables while preserving decoded text rather than copying incompatible bits.",
    "workbench": "python",
    "essentialChecks": [
      "Both table identities are recorded",
      "Meaning survives the actual decode/re-encode operation",
      "Malformed and empty payloads remain distinct"
    ],
    "variants": [
      {
        "id": "C-Y7-4-1-transfer-1",
        "task": "Transcode from fictional-signal-B ([\"C\",\"B\",\"A\",\" \"]) to fictional-signal-C ([\"B\",\" \",\"C\",\"A\"]). Codes are indexes 00..11. Preserve decoded symbols through a real re-encoding, with explicit malformed/empty handling."
      },
      {
        "id": "C-Y7-4-1-transfer-2",
        "task": "Transcode from fictional-signal-C ([\"B\",\" \",\"C\",\"A\"]) to fictional-signal-A ([\" \",\"A\",\"B\",\"C\"]). Codes are indexes 00..11. Preserve decoded symbols through a real re-encoding, with explicit malformed/empty handling."
      }
    ]
  },
  "C-Y7-4-2": {
    "contentHash": "ee802fbd8f14b53623af7eb40b6cab08df34e09f3197666bc769f9df4cbc507b",
    "objective": "Repair a spreadsheet range that silently omits an observation while preserving numeric conversion, zero and known-reader chart criteria.",
    "workbench": "data",
    "essentialChecks": [
      "All three observations participate in mean/count",
      "Zero is a measured value",
      "Chart labels, table and text-size criteria remain intact"
    ],
    "variants": [
      {
        "id": "C-Y7-4-2-transfer-1",
        "task": "Calculate the complete three-row mean and numeric count for Fictional seed heights, preserving zero and every row. Retain the actual 22-pixel, non-colour, labelled chart/table criteria under either input order."
      },
      {
        "id": "C-Y7-4-2-transfer-2",
        "task": "Calculate the complete three-row mean and numeric count for Fictional toy journeys, preserving zero and every row. Retain the actual 22-pixel, non-colour, labelled chart/table criteria under either input order."
      }
    ]
  },
  "C-Y7-4-3": {
    "contentHash": "98ad18be4fa3c15aadeca5d016b025d9bfd820390a4910159c601af2446f7760",
    "objective": "Implement a concern router that separates content/contact/conduct, refuses unknown routes and never copies supplied private message text into its saved plan.",
    "workbench": "python",
    "essentialChecks": [
      "Known categories map to their matching routes",
      "Unknown categories do not invent routes",
      "Incoming message text is absent from the actual saved plan",
      "No external report or public share occurs"
    ],
    "variants": [
      {
        "id": "C-Y7-4-3-transfer-1",
        "task": "Build the practice router with reference prefix classroom-demo. Preserve exact category routing, unknown-category refusal, minimal saved fields and no real/public report, without copying the supplied message."
      },
      {
        "id": "C-Y7-4-3-transfer-2",
        "task": "Build the practice router with reference prefix private-notebook. Preserve exact category routing, unknown-category refusal, minimal saved fields and no real/public report, without copying the supplied message."
      }
    ]
  },
  "P-Y7-4": {
    "contentHash": "63bff314bded7af3b1a5f3c9f6a463a249e5a0e5071304daa084b4ec6a4e0fb9",
    "objective": "Create a real CSV-backed report with source evaluation, minimal aggregate export, consistent chart disclosure and measurable accessibility criteria.",
    "workbench": "python",
    "essentialChecks": [
      "The actual CSV drives the analysis",
      "Chart and CSV export use the same thresholded aggregates",
      "Individual identifiers are excluded from exported fields",
      "Source limitations and accessibility criteria are implemented"
    ],
    "variants": [
      {
        "id": "P-Y7-4-transfer-1",
        "task": "Create Fictional plant samples using mean in model centimetres. Read the real input/source files, apply minimum_count consistently to chart/table/CSV, exclude original identifiers and preserve exact labels, 22-pixel text and the limited synthetic-source/privacy claims."
      },
      {
        "id": "P-Y7-4-transfer-2",
        "task": "Create Fictional toy routes using total in model squares. Read the real input/source files, apply minimum_count consistently to chart/table/CSV, exclude original identifiers and preserve exact labels, 22-pixel text and the limited synthetic-source/privacy claims."
      }
    ]
  },
  "Y8.01": {
    "contentHash": "444407d1b57fcae517a097fbd57a13fe49cdc02bf53cd003598e0bf5f17ca8c1",
    "objective": "Build semantic HTML with labelled controls and a coherent heading outline.",
    "workbench": "web",
    "essentialChecks": [
      "labels linked",
      "keyboard order sensible",
      "structure meaningful"
    ],
    "variants": [
      {
        "id": "Y8.01-transfer-1",
        "task": "Build Fictional museum revision with its Practice exhibit name field, coherent H1/H2 structure, one main and the real local instruction link. Preserve native link→input→Apply order without positive tabindex and verify actual names/keyboard use."
      },
      {
        "id": "Y8.01-transfer-2",
        "task": "Build Fictional garden revision with its Practice garden name field, coherent H1/H2 structure, one main and the real local instruction link. Preserve native link→input→Apply order without positive tabindex and verify actual names/keyboard use."
      }
    ]
  },
  "Y8.02": {
    "contentHash": "c4bc0e32c853cbee3c128080ce5d7a2a4625af0bd66146406950d48a90244cf7",
    "objective": "Implement a responsive layout for three stated viewport widths.",
    "workbench": "web",
    "essentialChecks": [
      "content retained",
      "no essential overflow",
      "controls usable"
    ],
    "variants": [
      {
        "id": "Y8.02-transfer-1",
        "task": "Restore natural flow in Fictional museum revision, preserving the complete semantic page, labelled input, visible padded Apply button and instructions. Verify static cascade requirements and actual 320/768/1024 preview interaction without essential overflow or overlays."
      },
      {
        "id": "Y8.02-transfer-2",
        "task": "Restore natural flow in Fictional garden revision, preserving the complete semantic page, labelled input, visible padded Apply button and instructions. Verify static cascade requirements and actual 320/768/1024 preview interaction without essential overflow or overlays."
      }
    ]
  },
  "Y8.03": {
    "contentHash": "1ddc56875e4a87294754a1b8075d74d45b3fae91c5c8bb7324e5ee3aecf1e725",
    "objective": "Use JavaScript state and events to respond to input.",
    "workbench": "web",
    "essentialChecks": [
      "event fires once",
      "state correct",
      "output updated"
    ],
    "variants": [
      {
        "id": "Y8.03-transfer-1",
        "task": "For Fictional museum revision, each Apply click adds 2 exactly once and displays the new count with the current fictional field value. Preserve semantics and verify repeated actual events."
      },
      {
        "id": "Y8.03-transfer-2",
        "task": "For Fictional garden revision, each Apply click adds 3 exactly once and displays the new count with the current fictional field value. Preserve semantics and verify repeated actual events."
      }
    ]
  },
  "Y8.04": {
    "contentHash": "67483350fa2c8cc5d76035ad677ee591d21609df5fb807d8bee629814b1f5bf5",
    "objective": "Render values as data and keep application code separate.",
    "workbench": "web",
    "essentialChecks": [
      "text displayed literally",
      "handlers preserved",
      "no injected execution"
    ],
    "variants": [
      {
        "id": "Y8.04-transfer-1",
        "task": "Make Fictional museum revision display markup-looking fictional input literally in result using textContent. Preserve its actual original Apply handler, report two completed updates and create no injected image/script elements."
      },
      {
        "id": "Y8.04-transfer-2",
        "task": "Make Fictional garden revision display markup-looking fictional input literally in result using textContent. Preserve its actual original Apply handler, report two completed updates and create no injected image/script elements."
      }
    ]
  },
  "Y8.05": {
    "contentHash": "9a56dc7304241fa36f4b42f260a337254ed12b227856eb4b923b456ec19cf877",
    "objective": "Implement usable form validation and accessible status feedback.",
    "workbench": "web",
    "essentialChecks": [
      "valid accepted",
      "invalid explained",
      "status accessible"
    ],
    "variants": [
      {
        "id": "Y8.05-transfer-1",
        "task": "Validate the exhibit count inclusively from 2 through 12. Keep actual labels, described-by/invalid state, persistent polite status text and no accepted output for bad input."
      },
      {
        "id": "Y8.05-transfer-2",
        "task": "Validate the garden count inclusively from 1 through 8. Keep actual labels, described-by/invalid state, persistent polite status text and no accepted output for bad input."
      }
    ]
  },
  "Y8.06": {
    "contentHash": "d92cd2a03973da2611bc6e2d34eb0658ff287e10ab892e69d94b7cfb06b130dd",
    "objective": "Build a responsive quiz website using JavaScript and structured state.",
    "workbench": "web",
    "essentialChecks": [
      "site runs",
      "state tested",
      "accessibility criteria met"
    ],
    "variants": [
      {
        "id": "Y8.06-transfer-1",
        "task": "Complete Fictional museum revision with 3 bank questions, one answer per stable position, navigation that retains valid input, refusal of incomplete checking and repeat-safe recomputed score. Preserve labelled controls, live feedback and responsive natural flow."
      },
      {
        "id": "Y8.06-transfer-2",
        "task": "Complete Fictional garden revision with 2 bank questions, one answer per stable position, navigation that retains valid input, refusal of incomplete checking and repeat-safe recomputed score. Preserve labelled controls, live feedback and responsive natural flow."
      }
    ]
  },
  "C-Y8-1-1": {
    "contentHash": "7c8e7cd3dc4a1a917796e49c24b41fd3b943af302e69fa2b5eedd9ea7b3aea33",
    "objective": "Repair crossed label associations in a multi-field private settings panel and verify its actual input-to-preview data flow.",
    "workbench": "web",
    "essentialChecks": [
      "Each field's accessible name matches its actual purpose",
      "Both current values reach the real preview",
      "Native order remains name, topic, preview"
    ],
    "variants": [
      {
        "id": "C-Y8-1-1-transfer-1",
        "task": "Repair Fictional museum revision's separate fictional exhibit name/topic associations. Verify both actual values reach Preview in the correct order and retain native name→topic→button order."
      },
      {
        "id": "C-Y8-1-1-transfer-2",
        "task": "Repair Fictional garden revision's separate fictional garden name/topic associations. Verify both actual values reach Preview in the correct order and retain native name→topic→button order."
      }
    ]
  },
  "C-Y8-1-2": {
    "contentHash": "dd317c9c6e2fbe4279cea9d1d160b7dfddb0fecbf412632de43b58bb3adfa1aa",
    "objective": "Add a counter-only reset that clears the count while preserving unrelated user input and the existing event listener.",
    "workbench": "web",
    "essentialChecks": [
      "Count returns to zero",
      "The entered fictional name is retained",
      "The following click applies exactly one configured increment"
    ],
    "variants": [
      {
        "id": "C-Y8-1-2-transfer-1",
        "task": "Implement counter-only reset for increment 2, preserving the entered fictional exhibit name and original Apply listener. Verify the actual next-click result after empty and repeated prior work."
      },
      {
        "id": "C-Y8-1-2-transfer-2",
        "task": "Implement counter-only reset for increment 3, preserving the entered fictional garden name and original Apply listener. Verify the actual next-click result after empty and repeated prior work."
      }
    ]
  },
  "C-Y8-1-3": {
    "contentHash": "fa17f43438463b75e107e58caa0ea526de97c9a773c8992c29f39f9a3dc2f96e",
    "objective": "Keep accepted output, current validity and persistent feedback consistent when a valid form entry becomes invalid.",
    "workbench": "web",
    "essentialChecks": [
      "A valid-to-invalid transition clears accepted output",
      "The current error remains readable",
      "ARIA validity and description match the current input"
    ],
    "variants": [
      {
        "id": "C-Y8-1-3-transfer-1",
        "task": "For range 2..12, accept a valid entry then replace it with blank or an excessive number. Clear earlier accepted output and retain matching current error text, invalid state and polite feedback."
      },
      {
        "id": "C-Y8-1-3-transfer-2",
        "task": "For range 1..8, accept a valid entry then replace it with blank or an excessive number. Clear earlier accepted output and retain matching current error text, invalid state and polite feedback."
      }
    ]
  },
  "P-Y8-1": {
    "contentHash": "d226c38ec6538b7c4e35cd60680174d11c17e462f12916029a102165ec5036bd",
    "objective": "Build a semantic, stateful revision website with preserved navigation, repeat-safe checking and a complete fresh-attempt reset.",
    "workbench": "web",
    "essentialChecks": [
      "Navigation preserves current valid answers",
      "Checking recomputes a complete score without duplicates",
      "Restart clears every answer, old score and current position",
      "Semantic labels/live feedback and natural flow remain functional"
    ],
    "variants": [
      {
        "id": "P-Y8-1-transfer-1",
        "task": "Deliver Fictional museum revision with 3 questions, retained navigation, complete repeat-safe checking and a genuinely fresh new-attempt reset. Clear all slots/old score, return to the first question and preserve semantic live feedback plus the three-width natural-flow design."
      },
      {
        "id": "P-Y8-1-transfer-2",
        "task": "Deliver Fictional garden revision with 2 questions, retained navigation, complete repeat-safe checking and a genuinely fresh new-attempt reset. Clear all slots/old score, return to the first question and preserve semantic live feedback plus the three-width natural-flow design."
      }
    ]
  },
  "Y8.07": {
    "contentHash": "868bcdceb46b3de0b63da4d8104fb3e59bd031286756f42501b8e5b12c77ef2e",
    "objective": "Trace a message split into packets through a network model.",
    "workbench": "network",
    "essentialChecks": [
      "order reconstructed",
      "loss detected",
      "model assumptions explained"
    ],
    "variants": [
      {
        "id": "Y8.07-transfer-1",
        "task": "Trace the new 4-packet message over the actual model graph. Require every sequence 0..3 exactly once, detect a missing final or duplicate packet and never fabricate a service payload from query text. State the shared-route/no-timing model limits."
      },
      {
        "id": "Y8.07-transfer-2",
        "task": "Trace the new 5-packet message over the actual model graph. Require every sequence 0..4 exactly once, detect a missing final or duplicate packet and never fabricate a service payload from query text. State the shared-route/no-timing model limits."
      }
    ]
  },
  "Y8.08": {
    "contentHash": "c77056ee4c19dfb0497ed52e17b730454a4fd33418b61cce52c667405fcf90b6",
    "objective": "Trace a named service request through a simplified lookup and response model.",
    "workbench": "python",
    "essentialChecks": [
      "lookup role correct",
      "failure layer identified",
      "trace evidenced"
    ],
    "variants": [
      {
        "id": "Y8.08-transfer-1",
        "task": "Use the new offline directory museum.invalid → node-exhibits. Trace lookup, link transport and application path in order; distinguish missing names, down links, application 404 and success without claiming real network traffic."
      },
      {
        "id": "Y8.08-transfer-2",
        "task": "Use the new offline directory garden.invalid → node-plants. Trace lookup, link transport and application path in order; distinguish missing names, down links, application 404 and success without claiming real network traffic."
      }
    ]
  },
  "Y8.09": {
    "contentHash": "19680657bd676ce82d34d50f958de218968d309958ba0b0dbdf9a3a74b36dcc6",
    "objective": "Construct a request and validate a fixture JSON response.",
    "workbench": "api",
    "essentialChecks": [
      "request valid",
      "schema checked",
      "invalid response rejected"
    ],
    "variants": [
      {
        "id": "Y8.09-transfer-1",
        "task": "Execute the real local Fictional plant service request with unit model centimetres and source_id plant-fixture. Validate exact integer JSON count, preserve zero, reject wrong types/units and retain the actual server trace and saved evidence."
      },
      {
        "id": "Y8.09-transfer-2",
        "task": "Execute the real local Fictional route service request with unit model squares and source_id route-fixture. Validate exact integer JSON count, preserve zero, reject wrong types/units and retain the actual server trace and saved evidence."
      }
    ]
  },
  "Y8.10": {
    "contentHash": "cf9fbbfe3a9ad15c6d51f3e3b0346946ce7d01bb797d032dafa946bee18706e7",
    "objective": "Implement timeout, error and retry behaviour against a controlled service fixture.",
    "workbench": "api",
    "essentialChecks": [
      "timeout bounded",
      "retries limited",
      "feedback accurate"
    ],
    "variants": [
      {
        "id": "Y8.10-transfer-1",
        "task": "Implement at most 2 real loopback attempts with a 0.3-second request timeout. Stop on valid numeric zero or positive success, distinguish actual timeouts from HTTP errors, save attempts and return honest unavailability when exhausted."
      },
      {
        "id": "Y8.10-transfer-2",
        "task": "Implement at most 4 real loopback attempts with a 0.3-second request timeout. Stop on valid numeric zero or positive success, distinguish actual timeouts from HTTP errors, save attempts and return honest unavailability when exhausted."
      }
    ]
  },
  "Y8.11": {
    "contentHash": "f392b5ee2210d06d70b602630185aff4662fe3ade9b551f311f9932c601fbd5c",
    "objective": "Evaluate API fixture provenance, permitted use and limits.",
    "workbench": "api",
    "essentialChecks": [
      "source credited",
      "freshness shown",
      "uncertainty stated"
    ],
    "variants": [
      {
        "id": "Y8.11-transfer-1",
        "task": "Review actual loopback Fictional plant service responses under maximum age 100 controlled seconds. Validate source identity, timestamp and permitted credit, preserve numeric zero, label stale data honestly and withhold restricted/future records."
      },
      {
        "id": "Y8.11-transfer-2",
        "task": "Review actual loopback Fictional route service responses under maximum age 300 controlled seconds. Validate source identity, timestamp and permitted credit, preserve numeric zero, label stale data honestly and withhold restricted/future records."
      }
    ]
  },
  "Y8.12": {
    "contentHash": "990bf3f0184ac5751c19d916a40e47d708f44634735e96a33bee094f6be2e6d5",
    "objective": "Combine a fixture API, chart and accessible failure states.",
    "workbench": "api",
    "essentialChecks": [
      "normal response works",
      "failure safe",
      "provenance visible"
    ],
    "variants": [
      {
        "id": "Y8.12-transfer-1",
        "task": "Build Fictional plant service's actual loopback dashboard for model centimetres and source plant-fixture. Preserve last-valid data through HTTP/schema failure, distinguish zero from unavailable, and generate truthful accessible chart/status/credit plus saved evidence."
      },
      {
        "id": "Y8.12-transfer-2",
        "task": "Build Fictional route service's actual loopback dashboard for model squares and source route-fixture. Preserve last-valid data through HTTP/schema failure, distinguish zero from unavailable, and generate truthful accessible chart/status/credit plus saved evidence."
      }
    ]
  },
  "C-Y8-2-1": {
    "contentHash": "b48937d74d9417ce79e8eadb63cb170568626b69c76eef0919d8cafd4b789005",
    "objective": "Repair an actual network graph while preserving independent complete-payload and missing-packet outcomes.",
    "workbench": "network",
    "essentialChecks": [
      "The graph reaches the service through the relay",
      "Complete packets reconstruct in sequence order",
      "Missing packets still block the service payload after route repair"
    ],
    "variants": [
      {
        "id": "C-Y8-2-1-transfer-1",
        "task": "Repair the actual relay route for a 4-packet contract. Preserve calculated reachability for both inputs while allowing a service payload only when sequences 0..3 occur exactly once."
      },
      {
        "id": "C-Y8-2-1-transfer-2",
        "task": "Repair the actual relay route for a 5-packet contract. Preserve calculated reachability for both inputs while allowing a service payload only when sequences 0..4 occur exactly once."
      }
    ]
  },
  "C-Y8-2-2": {
    "contentHash": "35d4c21eeade301e371850db5062a0efbd05bbec5cae411eb84f21c37b10b86a",
    "objective": "Validate and aggregate an actual HTTP JSON collection without dropping zero or accepting wrong types and duplicate identities.",
    "workbench": "api",
    "essentialChecks": [
      "Every valid record survives transfer",
      "Zero contributes to count even when it adds nothing to total",
      "Wrong types and duplicate identities reject the collection"
    ],
    "variants": [
      {
        "id": "C-Y8-2-2-transfer-1",
        "task": "Validate Fictional plant service's real JSON collection under its unit/source contract, retain every unique typed record including zero and distinguish valid empty results from rejected malformed data. Save actual count/total evidence."
      },
      {
        "id": "C-Y8-2-2-transfer-2",
        "task": "Validate Fictional route service's real JSON collection under its unit/source contract, retain every unique typed record including zero and distinguish valid empty results from rejected malformed data. Save actual count/total evidence."
      }
    ]
  },
  "C-Y8-2-3": {
    "contentHash": "c5b5923367eae87a3883233cef5a3f28f7a17f9f7432f8b0d033eb1097ee4ba7",
    "objective": "Execute a finite real HTTP retry policy that retries 503/timeouts but stops immediately for permanent or schema errors.",
    "workbench": "api",
    "essentialChecks": [
      "A permanent error stops after one actual attempt",
      "503/timeout retries remain finite",
      "Recovery with numeric zero is accepted",
      "Wrong-type successful bodies are not retried as valid data"
    ],
    "variants": [
      {
        "id": "C-Y8-2-3-transfer-1",
        "task": "Run at most 2 actual local attempts, retrying only 503 or request timeout. Stop on permanent/schema failure and accept valid zero recovery; retain real outcome and saved attempt evidence."
      },
      {
        "id": "C-Y8-2-3-transfer-2",
        "task": "Run at most 4 actual local attempts, retrying only 503 or request timeout. Stop on permanent/schema failure and accept valid zero recovery; retain real outcome and saved attempt evidence."
      }
    ]
  },
  "P-Y8-2": {
    "contentHash": "c36311d9ce7e58e750f49eff2bb98ccf905fc329c9ae2def3dad1cc848a0d7a6",
    "objective": "Build a real loopback-HTTP dashboard that validates and restores an actual cache file, preserves last-valid observations and exposes honest provenance/freshness/failure states.",
    "workbench": "api",
    "essentialChecks": [
      "A valid actual cache file is restored",
      "Invalid cache data is not used as a successful observation",
      "Successful refresh replaces the real cache and failed refresh preserves it",
      "Chart, source credit, age and live status agree with the retained data"
    ],
    "variants": [
      {
        "id": "P-Y8-2-transfer-1",
        "task": "Deliver Fictional plant service's resumable dashboard under its exact unit/source contract and 50-second controlled age limit. Restore only valid real cache data, make actual local refreshes, persist successful replacements and retain honest accessible chart/credit/age/failure states."
      },
      {
        "id": "P-Y8-2-transfer-2",
        "task": "Deliver Fictional route service's resumable dashboard under its exact unit/source contract and 300-second controlled age limit. Restore only valid real cache data, make actual local refreshes, persist successful replacements and retain honest accessible chart/credit/age/failure states."
      }
    ]
  },
  "Y8.13": {
    "contentHash": "cf623982de977add96076769cf5341ea07bdf0854403b7f8d639768069f4ff74",
    "objective": "Represent a robot's modes using a finite state diagram and executable model.",
    "workbench": "robot",
    "essentialChecks": [
      "states explicit",
      "transitions deterministic",
      "unexpected input handled"
    ],
    "variants": [
      {
        "id": "Y8.13-transfer-1",
        "task": "Implement the same three-mode diagram using begin for idle→moving and hold for moving↔paused, reset from any state, and moving power 2. Use one before-state per signal, explicitly count ignored inputs and verify actual actuator ticks."
      },
      {
        "id": "Y8.13-transfer-2",
        "task": "Implement the same three-mode diagram using activate for idle→moving and switch for moving↔paused, reset from any state, and moving power 1.5. Use one before-state per signal, explicitly count ignored inputs and verify actual actuator ticks."
      }
    ]
  },
  "Y8.14": {
    "contentHash": "165e73086087edfae12e417892bee43f5878b38f761efd423252b9ae970b9af6",
    "objective": "Use synthetic reference readings to estimate and correct sensor error.",
    "workbench": "robot",
    "essentialChecks": [
      "correction measured",
      "units consistent",
      "residual error reported"
    ],
    "variants": [
      {
        "id": "Y8.14-transfer-1",
        "task": "Measure the new three-reading synthetic bias in model squares, correct the later actual reading and report its residual. Preserve stationary zero-power sample ticks, the real target-minus-position reference and an explicit final stop; do not hardcode the earlier offset."
      },
      {
        "id": "Y8.14-transfer-2",
        "task": "Measure the new three-reading synthetic bias in model squares, correct the later actual reading and report its residual. Preserve stationary zero-power sample ticks, the real target-minus-position reference and an explicit final stop; do not hardcode the earlier offset."
      }
    ]
  },
  "Y8.15": {
    "contentHash": "f420bc333f4e2fd5e8076c9daff48797f4dd93a8fac642a46dac65c5f77b2998",
    "objective": "Adjust an actuator from sensor feedback rather than a fixed script.",
    "workbench": "robot",
    "essentialChecks": [
      "error decreases",
      "output bounded",
      "stopping condition works"
    ],
    "variants": [
      {
        "id": "Y8.15-transfer-1",
        "task": "Use gain 0.5, power bounds ±2 and stopping tolerance 0.125 model squares. Re-read current error every tick, reach the target from either side and stop without moving if already within tolerance."
      },
      {
        "id": "Y8.15-transfer-2",
        "task": "Use gain 1, power bounds ±1 and stopping tolerance 0.0625 model squares. Re-read current error every tick, reach the target from either side and stop without moving if already within tolerance."
      }
    ]
  },
  "Y8.16": {
    "contentHash": "2552ee763a0444dfb30571a3574b054f29f2cdf85e92fae47580529bcf5bc67c",
    "objective": "Evaluate a controller against noisy synthetic readings.",
    "workbench": "robot",
    "essentialChecks": [
      "noise cases tested",
      "actions bounded",
      "trade-off explained"
    ],
    "variants": [
      {
        "id": "Y8.16-transfer-1",
        "task": "Evaluate the new supplied zero-mean outlier pattern with three actual stationary samples per decision, power bounds ±2 and stopping tolerance 0.125 model squares. Preserve no movement on the actual target and an explicit stop. Explain sample-delay and biased/correlated-noise limits."
      },
      {
        "id": "Y8.16-transfer-2",
        "task": "Evaluate the new supplied zero-mean outlier pattern with three actual stationary samples per decision, power bounds ±1 and stopping tolerance 0.0625 model squares. Preserve no movement on the actual target and an explicit stop. Explain sample-delay and biased/correlated-noise limits."
      }
    ]
  },
  "Y8.17": {
    "contentHash": "999f80b484554751386d6cc4bffdf2322d72a76dcad99626af969de3ae042def",
    "objective": "Compare simulated predictions with supplied observations.",
    "workbench": "python",
    "essentialChecks": [
      "differences measured",
      "assumptions identified",
      "revision justified"
    ],
    "variants": [
      {
        "id": "Y8.17-transfer-1",
        "task": "Compare the new synthetic sequence using only the first 1 commanded steps to estimate gain and the remaining 2 steps as held-out evidence. Recompute predictions/residuals, handle zero excitation honestly and state the limited model assumptions."
      },
      {
        "id": "Y8.17-transfer-2",
        "task": "Compare the new synthetic sequence using only the first 3 commanded steps to estimate gain and the remaining 1 steps as held-out evidence. Recompute predictions/residuals, handle zero excitation honestly and state the limited model assumptions."
      }
    ]
  },
  "Y8.18": {
    "contentHash": "ff2a63052159fc9cdd21d3eb59f8fe66f0861cae9b7b30776fc2a8974ea43948",
    "objective": "Complete a virtual mission using calibrated sensing and a state controller.",
    "workbench": "robot",
    "essentialChecks": [
      "goal achieved",
      "disturbance recovered",
      "limitations evidenced"
    ],
    "variants": [
      {
        "id": "Y8.18-transfer-1",
        "task": "Complete the supplied disturbed mission using measured bias, gain 0.5, bounds ±2 and tolerance 0.125 model squares. Recover for one noisy window, resume on quiet input, reach the actual goal and stop; preserve the bounded-model limitations."
      },
      {
        "id": "Y8.18-transfer-2",
        "task": "Complete the supplied disturbed mission using measured bias, gain 1, bounds ±1 and tolerance 0.0625 model squares. Recover for one noisy window, resume on quiet input, reach the actual goal and stop; preserve the bounded-model limitations."
      }
    ]
  },
  "C-Y8-3-1": {
    "contentHash": "61733eee8a2871988a6ba812c7a6d2766dd0d6ed44b42f2fd93aee1497996bf2",
    "objective": "Compose a deterministic mode controller with a real stationary calibration gate and reject calibration while moving.",
    "workbench": "robot",
    "essentialChecks": [
      "Movement is refused before measured calibration",
      "Calibration runs only while idle",
      "The actual measured bias and allowed actuator ticks agree"
    ],
    "variants": [
      {
        "id": "C-Y8-3-1-transfer-1",
        "task": "Gate begin on actual idle calibration, retain hold/reset behaviour and moving power 2, and reject late calibration without resampling or extra motion. Measure the new supplied bias."
      },
      {
        "id": "C-Y8-3-1-transfer-2",
        "task": "Gate activate on actual idle calibration, retain switch/reset behaviour and moving power 1.5, and reject late calibration without resampling or extra motion. Measure the new supplied bias."
      }
    ]
  },
  "C-Y8-3-2": {
    "contentHash": "4fab2b2b3c1bcfc1bf8ebfd4a7db07b088530c202cf96f6c839a514a9a617c8a",
    "objective": "Preserve measured calibration through the actual threshold-to-actuator data flow.",
    "workbench": "robot",
    "essentialChecks": [
      "The measured correction is computed",
      "The decision consumes corrected rather than raw input",
      "Actual motion and final stop match the threshold"
    ],
    "variants": [
      {
        "id": "C-Y8-3-2-transfer-1",
        "task": "Measure the new constant bias and use corrected model-square distance at the 2.25 threshold. Verify actual zero/one-power decisions on both sides and an explicit stop, without changing the requirement to fit the raw reading."
      },
      {
        "id": "C-Y8-3-2-transfer-2",
        "task": "Measure the new constant bias and use corrected model-square distance at the 2.25 threshold. Verify actual zero/one-power decisions on both sides and an explicit stop, without changing the requirement to fit the raw reading."
      }
    ]
  },
  "C-Y8-3-3": {
    "contentHash": "45485ecd10d6e33d2ed5b01bd1a3cffd527e6691c3e789e0cca6d70195291572",
    "objective": "Require consecutive filtered windows so a transient biased sample group cannot cause a false early stop.",
    "workbench": "robot",
    "essentialChecks": [
      "One falsely quiet window does not finish travel",
      "A nonqualifying window resets confirmation",
      "Two consecutive qualifying windows precede actual stop"
    ],
    "variants": [
      {
        "id": "C-Y8-3-3-transfer-1",
        "task": "Require two consecutive windows under tolerance 0.125, with gain 0.5 and power bounds ±2. Reject one transient quiet estimate, reset confirmation after contradictory data and stop only at the actual goal."
      },
      {
        "id": "C-Y8-3-3-transfer-2",
        "task": "Require two consecutive windows under tolerance 0.0625, with gain 1 and power bounds ±1. Reject one transient quiet estimate, reset confirmation after contradictory data and stop only at the actual goal."
      }
    ]
  },
  "P-Y8-3": {
    "contentHash": "d42923eb9cfcf517a880b7dae96ded93bc135091e3e0bd2fb47715eda3f6c0cd",
    "objective": "Build an event-driven robot that retains calibration, recovers from disturbance and reaches two successive requested waypoints before final stop.",
    "workbench": "robot",
    "essentialChecks": [
      "Each mission event updates the active goal",
      "Calibration and recovery state survive between waypoints",
      "Arrival holds at zero without preventing the next mission",
      "Finish stops after both actual goals and measured residuals"
    ],
    "variants": [
      {
        "id": "P-Y8-3-transfer-1",
        "task": "Complete both supplied mission goals with retained measured calibration, gain 0.5, power bounds ±2 and tolerance 0.125. Keep the fixed sensor reference separate, recover once, hold between actual arrivals and stop only on finish."
      },
      {
        "id": "P-Y8-3-transfer-2",
        "task": "Complete both supplied mission goals with retained measured calibration, gain 1, power bounds ±1 and tolerance 0.0625. Keep the fixed sensor reference separate, recover once, hold between actual arrivals and stop only on finish."
      }
    ]
  },
  "C-Y6-1-1": {
    "contentHash": "fbb3627f76a9bb3e1cd7ddb63297598ea72cbbf54c3943123d21789a180a985c",
    "objective": "Reconstruct a two-parameter transformation and collect its returned values without modifying the input collection.",
    "workbench": "python",
    "essentialChecks": [
      "The component uses its explicit value and change parameters",
      "Every returned value is stored rather than merely printed",
      "Empty and original input collections are preserved"
    ],
    "variants": [
      {
        "id": "C-Y6-1-1-transfer-1",
        "task": "Reconstruct shift(value, change), collect every returned reading shifted by -4, and preserve original readings. Test mixed, empty and single-item collections."
      },
      {
        "id": "C-Y6-1-1-transfer-2",
        "task": "Reconstruct shift(value, change), collect every returned reading shifted by 8, and preserve original readings. Test mixed, empty and single-item collections."
      }
    ]
  },
  "C-Y6-1-2": {
    "contentHash": "0919285f153544d0d0b06360f0516b36949a0066f60253682a600b4bf756a8d2",
    "objective": "Locate and repair an accumulator reset using intermediate results and independent calls.",
    "workbench": "python",
    "essentialChecks": [
      "Each trail entry includes all preceding readings",
      "The accumulator starts once per function call",
      "Empty collections and a second call have fresh state"
    ],
    "variants": [
      {
        "id": "C-Y6-1-2-transfer-1",
        "task": "Repair running(items) when each contribution is value times 3. Return every cumulative total and verify independent readings/other calls plus empty input."
      },
      {
        "id": "C-Y6-1-2-transfer-2",
        "task": "Repair running(items) when each contribution is value times 5. Return every cumulative total and verify independent readings/other calls plus empty input."
      }
    ]
  },
  "C-Y6-1-3": {
    "contentHash": "85b7ba8323cf0fded7f5fb66f8db87d118364414b364fb5662d50e8f328db527",
    "objective": "Implement executable collection-position checks whose expected outcomes come from the index contract.",
    "workbench": "python",
    "essentialChecks": [
      "The first and last valid positions pass",
      "Empty, negative and one-past-end positions fail",
      "Recorded expected values are derived from the contract"
    ],
    "variants": [
      {
        "id": "C-Y6-1-3-transfer-1",
        "task": "Build five executable position_ok checks using size 6: empty, first, last, one past end and negative. Record expected/actual/passed, calculate all_passed and evaluate the supplied independent size and position."
      },
      {
        "id": "C-Y6-1-3-transfer-2",
        "task": "Build five executable position_ok checks using size 9: empty, first, last, one past end and negative. Record expected/actual/passed, calculate all_passed and evaluate the supplied independent size and position."
      }
    ]
  },
  "P-Y6-1": {
    "contentHash": "3128d9f9dcd3369db916245f54a4b9f65c13e2a1368483e9f89ac4e0ae5e13a3",
    "objective": "Deliver a documented three-component toolkit that transforms and summarises independent fictional measurement groups.",
    "workbench": "python",
    "essentialChecks": [
      "Every group is independently transformed by six",
      "Empty and mixed-value groups produce correct totals and counts",
      "Original collections and saved component documentation are preserved"
    ],
    "variants": [
      {
        "id": "P-Y6-1-transfer-1",
        "task": "Deliver the grouped toolkit with conversion factor 8. Integrate three functions, preserve all original groups, retain empty-group positions, save contracts.txt and verify a retrieved replay."
      },
      {
        "id": "P-Y6-1-transfer-2",
        "task": "Deliver the grouped toolkit with conversion factor 9. Integrate three functions, preserve all original groups, retain empty-group positions, save contracts.txt and verify a retrieved replay."
      }
    ]
  },
  "Y6.13": {
    "contentHash": "c61dba670e4b38aa03842babc2048c93ab66e048be84f2595c0d3323e6193a79",
    "objective": "Select non-personal data that can answer a stated question.",
    "workbench": "data",
    "essentialChecks": [
      "question measurable",
      "fields relevant",
      "privacy minimised"
    ],
    "variants": [
      {
        "id": "Y6.13-transfer-1",
        "task": "Ask How do recorded categories and toy mass compare in this fictional sample? Retain only id, category and amount, preserving all six original rows. Explain why decoration is irrelevant and why this fictional sample cannot support a universal claim."
      },
      {
        "id": "Y6.13-transfer-2",
        "task": "Ask How do recorded categories and model span compare in this fictional sample? Retain only id, category and amount, preserving all six original rows. Explain why decoration is irrelevant and why this fictional sample cannot support a universal claim."
      }
    ]
  },
  "Y6.14": {
    "contentHash": "60d6474409d2ab8c687f76a46ee1f727ea0d9fdad6962f836c000fddf7226228",
    "objective": "Find missing, duplicated and inconsistent entries.",
    "workbench": "data",
    "essentialChecks": [
      "defects identified",
      "valid rows preserved",
      "changes logged"
    ],
    "variants": [
      {
        "id": "Y6.14-transfer-1",
        "task": "Clean toy-parcels using retained relevant fields, trimmed lower-case categories, non-empty category/amount, unique id and ascending id order. Preserve all distinct valid records and inspect the actual change log against the immutable source."
      },
      {
        "id": "Y6.14-transfer-2",
        "task": "Clean paper-bridges using retained relevant fields, trimmed lower-case categories, non-empty category/amount, unique id and ascending id order. Preserve all distinct valid records and inspect the actual change log against the immutable source."
      }
    ]
  },
  "Y6.15": {
    "contentHash": "2f9db4a0d1ea6aa2c330b95103db6fe5c8b118e49d08e921272a324b77dc7396",
    "objective": "Calculate a summary and choose a chart suited to the audience.",
    "workbench": "data",
    "essentialChecks": [
      "calculation correct",
      "chart fair",
      "limitation stated"
    ],
    "variants": [
      {
        "id": "Y6.15-transfer-1",
        "task": "Clean and summarise toy-parcels. Calculate the actual total and mean, group category counts, use a labelled zero-based bar display with a text alternative, and retain the exact fictional-sample limitation."
      },
      {
        "id": "Y6.15-transfer-2",
        "task": "Clean and summarise paper-bridges. Calculate the actual total and mean, group category counts, use a labelled zero-based bar display with a text alternative, and retain the exact fictional-sample limitation."
      }
    ]
  },
  "Y6.16": {
    "contentHash": "c2c3fb9a34b1132b9bfd6fd04e9e7fe0044a9d686b96e8236c8096e705caba49",
    "objective": "Compare a rule-based classifier with a small example-trained classifier.",
    "workbench": "ai",
    "essentialChecks": [
      "rule trace explained",
      "classifier tested",
      "missing examples identified"
    ],
    "variants": [
      {
        "id": "Y6.16-transfer-1",
        "task": "Compare a rule threshold 25 with a one-neighbour classifier trained on 20 short and 30 long. Use distinct held-out examples, retain the small-sample limitation and flag predictions for fictional human judgement."
      },
      {
        "id": "Y6.16-transfer-2",
        "task": "Compare a rule threshold -15 with a one-neighbour classifier trained on -20 short and -10 long. Use distinct held-out examples, retain the small-sample limitation and flag predictions for fictional human judgement."
      }
    ]
  },
  "Y6.17": {
    "contentHash": "856e473808dbdd28280e4b4bb85cdadee7fd85231561c24fdd019b32495661ee",
    "objective": "Test a generated coding suggestion instead of accepting its confidence.",
    "workbench": "python",
    "essentialChecks": [
      "claim tested",
      "failing behaviour shown",
      "safe correction justified"
    ],
    "variants": [
      {
        "id": "Y6.17-transfer-1",
        "task": "Test and repair a separately authored mean task that first excludes negative readings. Return {'mean': None} when no readings remain, otherwise their actual mean. Preserve the original supplied list and distinguish an empty filtered result from genuine zeros."
      },
      {
        "id": "Y6.17-transfer-2",
        "task": "Test and repair a separately authored task that averages the absolute sizes of supplied readings. Return {'mean': None} for an empty list, otherwise the actual mean of absolute values. Preserve original signed measurements and use both ordinary and boundary tests."
      }
    ]
  },
  "Y6.18": {
    "contentHash": "feaa57d3f92d99429677711ed1a72995a408ef74de6bbec86fc444d0cef4a59c",
    "objective": "Create a chart and small classifier with a clear statement of limitations.",
    "workbench": "investigation",
    "essentialChecks": [
      "data checked",
      "held-out examples used",
      "conclusion qualified"
    ],
    "variants": [
      {
        "id": "Y6.18-transfer-1",
        "task": "Deliver a complete toy-parcels investigation: prepare the actual supplied records, preserve the distinct valid observations, compute and display counts/total/mean, train a one-neighbour classifier from matching record IDs/amounts/categories, test separate measurements and retain the explicit real-world limitation. Save, retrieve and replay."
      },
      {
        "id": "Y6.18-transfer-2",
        "task": "Deliver a complete paper-bridges investigation: prepare the actual supplied records, preserve the distinct valid observations, compute and display counts/total/mean, train a one-neighbour classifier from matching record IDs/amounts/categories, test separate measurements and retain the explicit real-world limitation. Save, retrieve and replay."
      }
    ]
  },
  "C-Y6-3-1": {
    "contentHash": "c866dc34ee9993c75254c6d6c34c089af2a6da490499da8aa90ab33547faf84e",
    "objective": "Reconstruct relevant-field selection and audited cleaning while preserving distinct observations with zero or negative measurements.",
    "workbench": "data",
    "essentialChecks": [
      "Only relevant fields remain",
      "Every distinct valid observation survives including zero",
      "Missing fields and repeated identifiers have an actual change log"
    ],
    "variants": [
      {
        "id": "C-Y6-3-1-transfer-1",
        "task": "Reconstruct the logged cleaning pipeline for toy-temperatures. Preserve every distinct valid measurement, including zero and any supplied negatives; remove missing required fields and repeated identifiers only."
      },
      {
        "id": "C-Y6-3-1-transfer-2",
        "task": "Reconstruct the logged cleaning pipeline for model-volumes. Preserve every distinct valid measurement, including zero and any supplied negatives; remove missing required fields and repeated identifiers only."
      }
    ]
  },
  "C-Y6-3-2": {
    "contentHash": "1ff5f9b4acc3d493ad76286da89094b8b9ebc412ad11ffbf69a53e5898558c6e",
    "objective": "Restore correct source-to-training labels and evaluate a missing category with separate tests.",
    "workbench": "investigation",
    "essentialChecks": [
      "Training matches every cleaned record",
      "Both represented categories are learned",
      "Separate tests and the small-sample limitation are preserved"
    ],
    "variants": [
      {
        "id": "C-Y6-3-2-transfer-1",
        "task": "Repair the incorrectly labelled training example in toy-wheels. Restore its actual cleaned source category and measured feature, verify both categories with separate tests and retain the limited-evidence interpretation."
      },
      {
        "id": "C-Y6-3-2-transfer-2",
        "task": "Repair the incorrectly labelled training example in model-towers. Restore its actual cleaned source category and measured feature, verify both categories with separate tests and retain the limited-evidence interpretation."
      }
    ]
  },
  "C-Y6-3-3": {
    "contentHash": "1a7dadc65dc7d1cd7297239c3de7197eb787c9c348322b0b3e4e10fe40aaa988",
    "objective": "Repair a bar scale and limit a conclusion even when the small classifier's test score is correct.",
    "workbench": "investigation",
    "essentialChecks": [
      "The bar display begins at zero and has a text alternative",
      "Actual counts and arithmetic remain intact",
      "Passing a few fictional tests is not presented as general reliability or fairness"
    ],
    "variants": [
      {
        "id": "C-Y6-3-3-transfer-1",
        "task": "Repair the misleading bar scale and universal claim in toy-boats. Preserve correct calculations and predictions, restore a zero-based labelled chart and explicitly limit the interpretation to the small fictional sample and evaluated tests."
      },
      {
        "id": "C-Y6-3-3-transfer-2",
        "task": "Repair the misleading bar scale and universal claim in model-boxes. Preserve correct calculations and predictions, restore a zero-based labelled chart and explicitly limit the interpretation to the small fictional sample and evaluated tests."
      }
    ]
  },
  "P-Y6-3": {
    "contentHash": "671102f7f0aa3989ff4427e812286203d1564909dea82625ddd324ca9ed74046",
    "objective": "Deliver a retrieved, reproducible investigation connecting audited data preparation, fair summaries, source-matched training and separate evaluation.",
    "workbench": "investigation",
    "essentialChecks": [
      "Every preparation decision is reflected in actual records and logs",
      "The chart and numerical summaries use all distinct valid observations",
      "Training matches source evidence and passes separate tests",
      "Saved and retrieved work retains its honest limited interpretation"
    ],
    "variants": [
      {
        "id": "P-Y6-3-transfer-1",
        "task": "Deliver paper-tunnels as a complete private portfolio investigation. Prepare the actual records with an audit log, compute fair summaries and chart, train from matching cleaned evidence, evaluate separate measurements and retain the explicit limited interpretation. Save, retrieve and replay."
      },
      {
        "id": "P-Y6-3-transfer-2",
        "task": "Deliver toy-tracks as a complete private portfolio investigation. Prepare the actual records with an audit log, compute fair summaries and chart, train from matching cleaned evidence, evaluate separate measurements and retain the explicit limited interpretation. Save, retrieve and replay."
      }
    ]
  },
  "Y6.07": {
    "contentHash": "8e1de825e7934c5c9e21c71d2ae5f20be747f88858b67daa8d4d7d03747cd9be",
    "objective": "Create semantic content with labels and meaningful navigation.",
    "workbench": "web",
    "essentialChecks": [
      "structure meaningful",
      "labels associated",
      "navigation usable"
    ],
    "variants": [
      {
        "id": "Y6.07-transfer-1",
        "task": "Build Museum exhibit workshop with meaningful heading levels and a native creation-title field labelled Fictional exhibit title. Use unique IDs, a private fictional introduction and the real local Read creation notes link. Test both supplied titles through the actual field."
      },
      {
        "id": "Y6.07-transfer-2",
        "task": "Build Garden model workshop with meaningful heading levels and a native creation-title field labelled Fictional garden title. Use unique IDs, a private fictional introduction and the real local Read creation notes link. Test both supplied titles through the actual field."
      }
    ]
  },
  "Y6.08": {
    "contentHash": "24d036fedddc20f1d2aa9b9a0ddb5fb0b691147b003ff2171060e813af35bb60",
    "objective": "Create a responsive page that preserves content at narrow widths.",
    "workbench": "web",
    "essentialChecks": [
      "no essential clipping",
      "order sensible",
      "text readable"
    ],
    "variants": [
      {
        "id": "Y6.08-transfer-1",
        "task": "Repair Museum exhibit workshop using natural block flow instead of the fixed 900px panel. Preserve all text, labels and navigation, retain 18px type and 16px panel padding, then inspect all three real preview widths and keyboard operation."
      },
      {
        "id": "Y6.08-transfer-2",
        "task": "Repair Garden model workshop using natural block flow instead of the fixed 900px panel. Preserve all text, labels and navigation, retain 18px type and 16px panel padding, then inspect all three real preview widths and keyboard operation."
      }
    ]
  },
  "Y6.09": {
    "contentHash": "a81b678e74507097b78cb6370926b1408020832d18f18766046204cbf9f7431a",
    "objective": "Choose original or permitted assets and record attribution.",
    "workbench": "web",
    "essentialChecks": [
      "permission recorded",
      "credit correct",
      "alternative supplied"
    ],
    "variants": [
      {
        "id": "Y6.09-transfer-1",
        "task": "Add the provided museum.png to Museum exhibit workshop. Use its actual approved bytes, supplied alternative and creator credit. Preserve the rights section, explain the conflicting restriction and test local navigation."
      },
      {
        "id": "Y6.09-transfer-2",
        "task": "Add the provided garden.png to Garden model workshop. Use its actual approved bytes, supplied alternative and creator credit. Preserve the rights section, explain the conflicting restriction and test local navigation."
      }
    ]
  },
  "Y6.11": {
    "contentHash": "df1ab4136c009d817778219a7854899c673c4b730b146a3e3bc9b1fb308045d9",
    "objective": "Use a stated user's needs to test and improve a page.",
    "workbench": "web",
    "essentialChecks": [
      "need identified",
      "change relevant",
      "retest documented"
    ],
    "variants": [
      {
        "id": "Y6.11-transfer-1",
        "task": "Address the fictional tester's need in Museum exhibit workshop: correctly associate Fictional exhibit title, use 24px contrasting label text, preserve structure and navigation, enter both supplied titles and record the finding, change and keyboard re-test."
      },
      {
        "id": "Y6.11-transfer-2",
        "task": "Address the fictional tester's need in Garden model workshop: correctly associate Fictional garden title, use 26px contrasting label text, preserve structure and navigation, enter both supplied titles and record the finding, change and keyboard re-test."
      }
    ]
  }
};
