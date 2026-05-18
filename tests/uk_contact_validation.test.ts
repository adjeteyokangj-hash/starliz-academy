import test from "node:test";
import assert from "node:assert/strict";

import {
  isPhoneLinkedToAnotherParent,
  normalizeUkPhone,
  normalizeUkPostcode,
  parseStoredAddress,
  serializeUkAddress,
  toStoredAddress,
  validateParentEmailQuality,
  validateParentFullName,
} from "../src/lib/uk_contact";

test("valid UK postcode is accepted and uppercased", () => {
  assert.equal(normalizeUkPostcode(" sw1a1aa "), "SW1A 1AA");
});

test("invalid UK postcode is rejected", () => {
  assert.throws(() => normalizeUkPostcode("12345"), /valid UK postcode/i);
});

test("valid UK mobile is accepted and normalized", () => {
  const result = normalizeUkPhone(" 07911 123456 ");
  assert.equal(result.e164, "+447911123456");
});

test("valid UK landline is accepted and normalized", () => {
  const result = normalizeUkPhone("020 7946 0018");
  assert.equal(result.e164, "+442079460018");
});

test("invalid UK telephone is rejected", () => {
  assert.throws(() => normalizeUkPhone("+1 202 555 0100"), /valid uk mobile or landline/i);
});

test("fake repeated UK phone patterns are rejected", () => {
  assert.throws(() => normalizeUkPhone("07000000000"), /valid uk (phone number|mobile or landline)/i);
  assert.throws(() => normalizeUkPhone("07111111111"), /valid uk (phone number|mobile or landline)/i);
  assert.throws(() => normalizeUkPhone("01234567890"), /valid uk (phone number|mobile or landline)/i);
  assert.throws(() => normalizeUkPhone("00000000000"), /valid uk (phone number|mobile or landline)/i);
});

test("fake test parent names are rejected", () => {
  assert.throws(() => validateParentFullName("asdf asdf"), /real full name/i);
  assert.throws(() => validateParentFullName("test test"), /real full name/i);
  assert.throws(() => validateParentFullName("aaaa aaaa"), /real full name/i);
});

test("realistic parent full names are accepted", () => {
  assert.equal(validateParentFullName("Amelia Johnson"), "Amelia Johnson");
  assert.equal(validateParentFullName("Mary Anne O'Neil"), "Mary Anne O'Neil");
});

test("blocked test email domains are rejected safely", () => {
  assert.throws(() => validateParentEmailQuality("parent@example.com"), /real email/i);
  assert.throws(() => validateParentEmailQuality("demo@test.com"), /real email/i);
  assert.equal(validateParentEmailQuality("parent@gmail.com"), "parent@gmail.com");
});

test("invalid address text is rejected", () => {
  assert.throws(
    () =>
      serializeUkAddress({
        addressLine1: "test address",
        addressLine2: "",
        townCity: "12345",
        county: "",
        postcode: "SW1A 1AA",
        country: "United Kingdom",
      }),
    /valid uk address/i,
  );
});

test("valid real-looking UK parent details are accepted", () => {
  const normalizedName = validateParentFullName("Olivia Thompson");
  const normalizedEmail = validateParentEmailQuality("olivia.thompson@gmail.com");
  const normalizedPhone = normalizeUkPhone("+44 7911 123456");
  const normalizedAddress = serializeUkAddress({
    addressLine1: "22 Baker Street",
    addressLine2: "",
    townCity: "London",
    county: "Greater London",
    postcode: "nw1 6xe",
    country: "United Kingdom",
  });

  assert.equal(normalizedName, "Olivia Thompson");
  assert.equal(normalizedEmail, "olivia.thompson@gmail.com");
  assert.equal(normalizedPhone.e164, "+447911123456");
  assert.equal(normalizedAddress.postcode, "NW1 6XE");
});

test("same E.164 phone detected across formatting variants", () => {
  const a = normalizeUkPhone("07911 123456");
  const b = normalizeUkPhone("+44 7911 123456");
  assert.equal(a.e164, b.e164);
});

test("phone conflict helper allows same parent but blocks different parent", () => {
  assert.equal(isPhoneLinkedToAnotherParent("parent-1", "parent-1"), false);
  assert.equal(isPhoneLinkedToAnotherParent("parent-2", "parent-1"), true);
  assert.equal(isPhoneLinkedToAnotherParent(undefined, "parent-1"), false);
});

test("structured address serializes and parses via existing address field", () => {
  const normalized = serializeUkAddress({
    addressLine1: "10 Downing Street",
    addressLine2: "Westminster",
    townCity: "London",
    county: "Greater London",
    postcode: "sw1a 2aa",
    country: "United Kingdom",
  });

  const stored = toStoredAddress(normalized);
  const parsed = parseStoredAddress(stored, normalized.country);

  assert.equal(parsed.addressLine1, "10 Downing Street");
  assert.equal(parsed.addressLine2, "Westminster");
  assert.equal(parsed.townCity, "London");
  assert.equal(parsed.county, "Greater London");
  assert.equal(parsed.postcode, "SW1A 2AA");
  assert.equal(parsed.country, "United Kingdom");
});
