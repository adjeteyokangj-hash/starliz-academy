function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function percentageWidthClass(value: number): string {
  const percent = clampPercentage(value);

  if (percent === 0) return "w-0";
  if (percent <= 5) return "w-[5%]";
  if (percent <= 10) return "w-[10%]";
  if (percent <= 15) return "w-[15%]";
  if (percent <= 20) return "w-[20%]";
  if (percent <= 25) return "w-[25%]";
  if (percent <= 30) return "w-[30%]";
  if (percent <= 35) return "w-[35%]";
  if (percent <= 40) return "w-[40%]";
  if (percent <= 45) return "w-[45%]";
  if (percent <= 50) return "w-1/2";
  if (percent <= 55) return "w-[55%]";
  if (percent <= 60) return "w-[60%]";
  if (percent <= 65) return "w-[65%]";
  if (percent <= 70) return "w-[70%]";
  if (percent <= 75) return "w-3/4";
  if (percent <= 80) return "w-[80%]";
  if (percent <= 85) return "w-[85%]";
  if (percent <= 90) return "w-[90%]";
  if (percent <= 95) return "w-[95%]";
  return "w-full";
}

export function percentageHeightClass(value: number): string {
  const percent = clampPercentage(value);

  if (percent === 0) return "h-0";
  if (percent <= 5) return "h-[4px]";
  if (percent <= 10) return "h-[10%]";
  if (percent <= 15) return "h-[15%]";
  if (percent <= 20) return "h-[20%]";
  if (percent <= 25) return "h-[25%]";
  if (percent <= 30) return "h-[30%]";
  if (percent <= 35) return "h-[35%]";
  if (percent <= 40) return "h-[40%]";
  if (percent <= 45) return "h-[45%]";
  if (percent <= 50) return "h-1/2";
  if (percent <= 55) return "h-[55%]";
  if (percent <= 60) return "h-[60%]";
  if (percent <= 65) return "h-[65%]";
  if (percent <= 70) return "h-[70%]";
  if (percent <= 75) return "h-[75%]";
  if (percent <= 80) return "h-[80%]";
  if (percent <= 85) return "h-[85%]";
  if (percent <= 90) return "h-[90%]";
  if (percent <= 95) return "h-[95%]";
  return "h-full";
}