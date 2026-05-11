import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const kids = await prisma.childProfile.findMany({
  include: { parent: { select: { email: true } } },
});
console.log(kids.map(k => ({ id: k.id, name: k.name, archived: k.archived, parentEmail: k.parent?.email })));
await prisma.$disconnect();
