export type StructuredUkAddress = {
  addressLine1: string;
  addressLine2: string;
  townCity: string;
  county: string;
  postcode: string;
  country: string;
};

const UK_POSTCODE_REGEX = /^(GIR\s?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})$/i;
const TEST_EMAIL_DOMAINS = new Set(["example.com", "test.com", "fake.com"]);
const PLACEHOLDER_WORDS = new Set(["test", "asdf", "unknown", "none", "null", "na", "n/a"]);
const NAME_BLOCKLIST = new Set(["test", "asdf", "qwerty", "admin", "parent"]);
const PHONE_BLOCKLIST = new Set(["07000000000", "07111111111", "01234567890", "00000000000"]);

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsBlockedWord(value: string, blockedWords: Set<string>): boolean {
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.some((token) => blockedWords.has(token));
}

function isRepeatedNonsense(value: string): boolean {
  const tokens = value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (!tokens.length) {
    return false;
  }
  const unique = new Set(tokens);
  if (tokens.length > 1 && unique.size === 1) {
    return true;
  }
  return tokens.some((token) => /(.)\1{3,}/.test(token));
}

function toCanonicalCountry(value: string | null | undefined, strict = false): string {
  const normalized = compactWhitespace(value ?? "").toLowerCase();
  if (!normalized || normalized === "uk" || normalized === "u.k." || normalized === "united kingdom" || normalized === "great britain") {
    return "United Kingdom";
  }
  if (strict) {
    throw new Error("Country must be United Kingdom.");
  }
  return compactWhitespace(value ?? "United Kingdom");
}

export function validateParentFullName(input: string): string {
  const name = compactWhitespace(input);
  const tokens = name.split(/\s+/).filter(Boolean);
  const symbolHeavy = /[^a-zA-Z\s'\-]/.test(name);

  if (!name || name.length < 5 || tokens.length < 2 || symbolHeavy) {
    throw new Error("Please enter your real full name.");
  }

  const alphaTokens = tokens.map((token) => token.replace(/[^a-zA-Z]/g, "")).filter(Boolean);
  if (alphaTokens.length < 2 || alphaTokens.some((token) => token.length < 2)) {
    throw new Error("Please enter your real full name.");
  }

  if (containsBlockedWord(name, NAME_BLOCKLIST) || isRepeatedNonsense(name)) {
    throw new Error("Please enter your real full name.");
  }

  return name;
}

export function validateParentEmailQuality(email: string): string {
  const normalized = compactWhitespace(email).toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  const domain = atIndex > -1 ? normalized.slice(atIndex + 1) : "";
  if (TEST_EMAIL_DOMAINS.has(domain)) {
    throw new Error("Please use a real email address.");
  }
  return normalized;
}

export function normalizeUkPostcode(input: string): string {
  const alnum = input.replace(/\s+/g, "").toUpperCase();
  if (!UK_POSTCODE_REGEX.test(alnum)) {
    throw new Error("Enter a valid UK postcode.");
  }
  if (alnum.length <= 3) {
    return alnum;
  }
  return `${alnum.slice(0, -3)} ${alnum.slice(-3)}`;
}

export function normalizeUkPhone(input: string): { e164: string; display: string; national: string } {
  const raw = compactWhitespace(input);
  if (!raw) {
    throw new Error("Enter a UK mobile or landline number");
  }

  const stripped = raw.replace(/[\s()\-]/g, "");
  let canonical = stripped;
  if (canonical.startsWith("00")) {
    canonical = `+${canonical.slice(2)}`;
  }

  let national = "";
  if (canonical.startsWith("+44")) {
    national = `0${canonical.slice(3)}`;
  } else if (/^44\d{9,10}$/.test(canonical)) {
    national = `0${canonical.slice(2)}`;
  } else if (canonical.startsWith("0")) {
    national = canonical;
  } else {
    throw new Error("Enter a valid UK mobile or landline number");
  }

  if (!/^\d+$/.test(national)) {
    throw new Error("Enter a valid UK mobile or landline number");
  }

  const isUkMobile = /^07\d{9}$/.test(national);
  const isUkLandline = /^0(?:1\d{9}|2\d{9}|3\d{9}|8\d{9})$/.test(national);
  if (!isUkMobile && !isUkLandline) {
    throw new Error("Please enter a valid UK phone number.");
  }

  if (
    PHONE_BLOCKLIST.has(national) ||
    /(0123456789|1234567890|9876543210)/.test(national) ||
    /(\d)\1{8,}/.test(national)
  ) {
    throw new Error("Please enter a valid UK phone number.");
  }

  const e164 = `+44${national.slice(1)}`;
  const display = isUkMobile
    ? `${national.slice(0, 5)} ${national.slice(5, 8)} ${national.slice(8)}`
    : `${national.slice(0, 5)} ${national.slice(5)}`;

  return { e164, display, national };
}

export function validateStructuredUkAddressQuality(address: StructuredUkAddress): StructuredUkAddress {
  const line1 = compactWhitespace(address.addressLine1);
  const townCity = compactWhitespace(address.townCity);

  const hasStreetWord = /\b(street|st|road|rd|lane|ln|avenue|ave|close|crescent|drive|dr|court|place|pl|way|grove|gardens|mews|terrace|hill|row|highway)\b/i.test(line1);
  const hasBuildingRef = /\b(\d+[a-z]?|flat|house|apartment|apt|suite|unit|cottage|lodge|villa|farm|barn|manor)\b/i.test(line1);
  const invalidLine1 =
    !line1 ||
    line1.length < 6 ||
    containsBlockedWord(line1, PLACEHOLDER_WORDS) ||
    isRepeatedNonsense(line1) ||
    !/[a-z]/i.test(line1) ||
    !(hasStreetWord && hasBuildingRef);

  const invalidTownCity =
    !townCity ||
    townCity.length < 2 ||
    !/^[a-zA-Z\s'\-]+$/.test(townCity) ||
    containsBlockedWord(townCity, PLACEHOLDER_WORDS) ||
    isRepeatedNonsense(townCity);

  if (invalidLine1 || invalidTownCity) {
    throw new Error("Please enter a valid UK address.");
  }

  return {
    ...address,
    addressLine1: line1,
    townCity,
  };
}

export function serializeUkAddress(input: {
  addressLine1: string;
  addressLine2?: string | null;
  townCity: string;
  county?: string | null;
  postcode: string;
  country?: string | null;
}): StructuredUkAddress {
  const addressLine1 = compactWhitespace(input.addressLine1);
  const addressLine2 = compactWhitespace(input.addressLine2 ?? "");
  const townCity = compactWhitespace(input.townCity);
  const county = compactWhitespace(input.county ?? "");
  const postcode = normalizeUkPostcode(input.postcode);
  const country = toCanonicalCountry(input.country, true);

  if (!addressLine1) {
    throw new Error("Address line 1 is required.");
  }
  if (!townCity) {
    throw new Error("Town/City is required.");
  }

  return validateStructuredUkAddressQuality({
    addressLine1,
    addressLine2,
    townCity,
    county,
    postcode,
    country,
  });
}

export function isPhoneLinkedToAnotherParent(existingUserId: string | null | undefined, currentUserId?: string | null): boolean {
  return Boolean(existingUserId && existingUserId !== (currentUserId ?? null));
}

export function toStoredAddress(address: StructuredUkAddress): string {
  const lines = [
    `Address line 1: ${address.addressLine1}`,
    address.addressLine2 ? `Address line 2: ${address.addressLine2}` : "",
    `Town/City: ${address.townCity}`,
    address.county ? `County: ${address.county}` : "",
    `Postcode: ${address.postcode}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export function parseStoredAddress(address: string | null | undefined, country: string | null | undefined): StructuredUkAddress {
  const fallbackCountry = toCanonicalCountry(country, false);
  const source = (address ?? "").trim();
  if (!source) {
    return {
      addressLine1: "",
      addressLine2: "",
      townCity: "",
      county: "",
      postcode: "",
      country: fallbackCountry,
    };
  }

  const labeled = {
    addressLine1: source.match(/^Address line 1:\s*(.+)$/im)?.[1]?.trim() ?? "",
    addressLine2: source.match(/^Address line 2:\s*(.+)$/im)?.[1]?.trim() ?? "",
    townCity: source.match(/^Town\/City:\s*(.+)$/im)?.[1]?.trim() ?? "",
    county: source.match(/^County:\s*(.+)$/im)?.[1]?.trim() ?? "",
    postcode: source.match(/^Postcode:\s*(.+)$/im)?.[1]?.trim() ?? "",
  };

  if (labeled.addressLine1 || labeled.townCity || labeled.postcode) {
    let normalizedLabeledPostcode = "";
    if (labeled.postcode) {
      try {
        normalizedLabeledPostcode = normalizeUkPostcode(labeled.postcode);
      } catch {
        normalizedLabeledPostcode = labeled.postcode;
      }
    }
    return {
      ...labeled,
      postcode: normalizedLabeledPostcode,
      country: fallbackCountry,
    };
  }

  const parts = source.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
  const postcodeMatch = source.match(/(GIR\s?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})/i);
  let postcode = "";
  if (postcodeMatch) {
    try {
      postcode = normalizeUkPostcode(postcodeMatch[1]);
    } catch {
      postcode = postcodeMatch[1].toUpperCase();
    }
  }

  return {
    addressLine1: parts[0] ?? "",
    addressLine2: parts[1] ?? "",
    townCity: parts[2] ?? "",
    county: parts[3] ?? "",
    postcode,
    country: fallbackCountry,
  };
}