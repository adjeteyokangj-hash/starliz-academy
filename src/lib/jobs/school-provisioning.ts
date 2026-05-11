import { processQueuedProvisioningJobs } from "@/lib/schools/provisioning";

export async function runSchoolProvisioningJobs() {
  const processed = await processQueuedProvisioningJobs(20);
  return { processed };
}
