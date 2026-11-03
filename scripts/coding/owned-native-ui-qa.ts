import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** UI acceptance only. Native bounded interpreter; source execution fails closed.
 * Does not start, inspect, alter or probe any Linux/container runner. */
export async function ownedNativeUiQa(childIds: string[], log: string) {
  if (childIds.length !== 1) throw new Error("One precisely identified synthetic QA learner is required.");
  const reservation=createServer();await new Promise<void>((yes,no)=>{reservation.once("error",no);reservation.listen(0,"127.0.0.1",yes);});
  const address=reservation.address();if(!address||typeof address==="string")throw new Error("No local QA port.");
  await new Promise<void>(yes=>reservation.close(()=>yes()));
  const guard=pathToFileURL(resolve("scripts/coding/qa-model-egress-guard.mjs")).href;
  const next=spawn(process.execPath,["--max-old-space-size=2048","node_modules/next/dist/bin/next","dev","--turbopack","--hostname","127.0.0.1","--port",String(address.port)],{windowsHide:true,env:{...process.env,NODE_ENV:"development",VERCEL:"",CODING_QA_BUILD_ID:randomUUID(),CODING_QA_DISABLE_LIVE_MODEL:"true",CODING_AI_ZERO_DATA_RETENTION_VERIFIED:"",NODE_OPTIONS:`--max-old-space-size=2048 --import=${guard}`,CODING_CURRICULUM_QA_ENABLED:"true",CODING_CURRICULUM_QA_CHILD_IDS:childIds.join(","),CODING_RUNNER_URL:"",CODING_RUNNER_SECRET:"",CODING_MEDIA_RUNNER_URL:""},stdio:["ignore","pipe","pipe"]});
  next.stdout.on("data",chunk=>appendFileSync(log,chunk));next.stderr.on("data",chunk=>appendFileSync(log,chunk));
  let stopped=false;
  const stop=async()=>{if(stopped)return;stopped=true;if(next.pid&&next.exitCode===null)await new Promise<void>(yes=>{const end=spawn("taskkill.exe",["/PID",String(next.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});end.once("close",()=>yes());end.once("error",()=>yes());});};
  try{
    const base=`http://127.0.0.1:${address.port}`;
    for(let i=0;i<100;i++){
      if(next.exitCode!==null)throw new Error("Owned UI app exited; existing server was preserved.");
      try{const reply=await fetch(`${base}/api/auth/session`,{signal:AbortSignal.timeout(1000)});if(reply.status<500)return{base,stop};}catch{/* bounded startup */}
      await new Promise(yes=>setTimeout(yes,1000));
    }
    throw new Error("Owned UI app did not become ready.");
  }catch(error){await stop();throw error;}
}
