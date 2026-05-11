import Link from "next/link";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

type Props = {
  task: string;
};

export default function MissionCard({ task }: Props) {
  return (
    <Card title="Daily Quest" className="bg-gradient-to-r from-accent/70 to-secondary/45">
      <p className="mb-4 text-slate-800">{task}</p>
      <Link href="/games/spelling">
        <Button variant="primary">Start Quest</Button>
      </Link>
    </Card>
  );
}
