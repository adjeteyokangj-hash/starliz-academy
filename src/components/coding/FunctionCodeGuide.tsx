"use client";
import { useState } from "react";
import type { PracticalArtifact } from "@/lib/coding/learning/types";
import { pythonLanguage } from "@codemirror/lang-python";
const exampleParts = [
  { code: "def greet(name):", title: "Create a function", text: "def starts a function. greet is its name. name is a parameter: a place for information each time the function is called. The colon starts its instructions." },
  { code: '    print("Hello, " + name)', title: "Put instructions inside", text: "The spaces at the start show that this line belongs inside the function. print displays a message. The + joins the greeting with the name it receives." },
  { code: 'greet("Spark")', title: "Call the function", text: 'This runs greet with the argument "Spark". Inside this call, name holds "Spark". Defining a function alone does not run its instructions.' },
];
export default function FunctionCodeGuide({ artifact }: { artifact?: PracticalArtifact }) {
  const [selected, setSelected] = useState(0), [revealed, setRevealed] = useState(false);
  let parts = exampleParts;
  if (artifact?.type === "source" && artifact.language === "python") {
    const definition = pythonLanguage.parser.parse(artifact.source).topNode.getChild("FunctionDefinition");
    const name = definition?.getChild("VariableName"), body = definition?.getChild("Body");
    if (definition && name && body) {
      const functionName = artifact.source.slice(name.from, name.to);
      const instruction = artifact.source.slice(body.from + 1, body.to).split("\n").find(line => line.trim() && !line.trim().startsWith("#"));
      const call = artifact.source.slice(definition.to).split("\n").find(line => line.includes(`${functionName}(`));
      if (instruction && call) parts = [
        { code: artifact.source.slice(definition.from, body.from + 1), title: "Create a function", text: `def defines ${functionName}. Names in the parentheses are parameters: places for the inputs each call supplies. The colon starts the function’s instructions.` },
        { code: instruction, title: "Put instructions inside", text: instruction.trim().startsWith("return ") ? "The spaces put this instruction inside the function. return sends the calculated value back to its caller. It does not display a message." : "The spaces put this instruction inside the function. It runs when the function is called. An assignment stores a value; print displays a message; return sends a value back to the caller." },
        { code: call, title: "Call the function", text: `This calls ${functionName}. The values inside its call parentheses are arguments. They supply the function’s parameters for this call. If the function returns a value, the surrounding statement can store or use it.` },
      ];
    }
  }
  const actual = parts !== exampleParts;
  return <section className="function-guide" aria-label="How Python functions work"><p className="function-guide-label">CODE, PIECE BY PIECE</p><h3>What is a function?</h3><p>A function is a named set of instructions you can use again.</p><p className="function-guide-prompt">Choose a line to see what it does.</p><div className="function-guide-lines">{parts.map((part, index) => <button type="button" key={part.code} aria-pressed={selected === index} onClick={() => setSelected(index)}><span aria-hidden="true">{index + 1}</span><code>{part.code}</code></button>)}</div><div className="function-guide-explanation" aria-live="polite"><h4>{parts[selected].title}</h4><p>{parts[selected].text}</p></div><div className="function-guide-predict"><h4>Think before you run</h4><p>{actual ? "Which arguments enter this call, and does its function display a message or return a value? Follow the instructions, then run the Lesson Example to check." : <>What message will <code>{'greet("Spark")'}</code> display?</>}</p><button type="button" aria-expanded={revealed} onClick={() => setRevealed(value => !value)}>{revealed ? "Hide the explanation" : "Show the explanation"}</button>{revealed && actual && <p>Read the arguments in the call, use those values for the parameters, then follow the indented instructions in order. A return value goes back to the caller; print sends text to the output.</p>}{revealed && !actual && <p><strong>Hello, Spark</strong> — the call gives <code>{'"Spark"'}</code> to name, then print displays the joined message. Calling <code>{'greet("Nova")'}</code> would display Hello, Nova.</p>}</div><details><summary>Next idea: print and return</summary><p><code>print</code> displays a value. <code>return</code> sends a value back to the code that called the function.</p><pre>{'def double(number):\n    return number * 2\n\nanswer = double(4)\nprint(answer)'}</pre><p>double(4) returns 8. That value is stored in answer. The last line displays it. A function without return gives back None.</p></details></section>;
}
