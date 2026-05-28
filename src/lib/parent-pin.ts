export const COMMON_WEAK_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "4321",
  "1122",
  "1212",
  "0123",
]);

export type ParentPinSetBody = {
  pin?: string;
  currentPin?: string;
  newPin?: string;
};

export type ParentPinSetDecision =
  | {
      ok: true;
      mode: "create";
      nextPin: string;
      currentPin: null;
    }
  | {
      ok: true;
      mode: "change";
      nextPin: string;
      currentPin: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function isRepeatedDigits(pin: string): boolean {
  return /^(\d)\1{3}$/.test(pin);
}

function isAscendingSequence(pin: string): boolean {
  const digits = [...pin].map((d) => Number(d));
  for (let i = 1; i < digits.length; i += 1) {
    if (digits[i] !== digits[i - 1] + 1) return false;
  }
  return true;
}

function isDescendingSequence(pin: string): boolean {
  const digits = [...pin].map((d) => Number(d));
  for (let i = 1; i < digits.length; i += 1) {
    if (digits[i] !== digits[i - 1] - 1) return false;
  }
  return true;
}

export function isWeakParentPin(pin: string): boolean {
  return (
    COMMON_WEAK_PINS.has(pin) ||
    isRepeatedDigits(pin) ||
    isAscendingSequence(pin) ||
    isDescendingSequence(pin)
  );
}

function isFourDigitPin(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

export function decideParentPinSetRequest(input: {
  hasExistingPin: boolean;
  body: ParentPinSetBody;
}): ParentPinSetDecision {
  const { hasExistingPin, body } = input;

  if (!hasExistingPin) {
    const setupPin = body.newPin ?? body.pin;
    if (!isFourDigitPin(setupPin)) {
      return {
        ok: false,
        status: 400,
        error: "PIN must be exactly 4 digits.",
      };
    }

    if (typeof body.pin === "string" && typeof body.newPin === "string" && body.pin !== body.newPin) {
      return {
        ok: false,
        status: 400,
        error: "PIN request is inconsistent. Please provide one new PIN value.",
      };
    }

    return {
      ok: true,
      mode: "create",
      nextPin: setupPin,
      currentPin: null,
    };
  }

  // Backward-compatible `pin` payload remains setup-only and cannot overwrite an existing PIN.
  if (typeof body.pin === "string" && typeof body.currentPin !== "string" && typeof body.newPin !== "string") {
    return {
      ok: false,
      status: 403,
      error: "Current PIN is required to change an existing PIN.",
    };
  }

  if (!isFourDigitPin(body.currentPin) || !isFourDigitPin(body.newPin)) {
    return {
      ok: false,
      status: 400,
      error: "Current PIN and new PIN must both be exactly 4 digits.",
    };
  }

  return {
    ok: true,
    mode: "change",
    nextPin: body.newPin,
    currentPin: body.currentPin,
  };
}
