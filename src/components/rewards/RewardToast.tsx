"use client";

export default function RewardToast({
  points,
  message,
}: {
  points: number;
  message: string;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-bounce rounded-2xl border border-yellow-300 bg-yellow-100 px-5 py-4 shadow-xl">
      <p className="font-bold text-yellow-900">⭐ +{points} points</p>
      <p className="text-sm text-yellow-800">{message}</p>
    </div>
  );
}