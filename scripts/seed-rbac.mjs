import { seedDefaultRoles } from '@/lib/rbac';

async function main() {
  console.log('Seeding default RBAC roles...');
  await seedDefaultRoles();
  console.log('Seeding complete!');
}

main();
