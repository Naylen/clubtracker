export type StructuredAddress = {
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
};

export const STATE_PATTERN = /^[A-Z]{2}$/;
export const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;

export function normalizeState(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeStructuredAddress(input: {
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): StructuredAddress {
  return {
    street1: String(input.street1 ?? "").trim(),
    street2: String(input.street2 ?? "").trim() || null,
    city: String(input.city ?? "").trim(),
    state: normalizeState(String(input.state ?? "")),
    zip: String(input.zip ?? "").trim(),
  };
}

export function validateStructuredAddress(
  input: {
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  },
  options: { requireCoreFields?: boolean } = {}
): {
  value: StructuredAddress;
  errors: string[];
} {
  const requireCoreFields = options.requireCoreFields !== false;
  const value = normalizeStructuredAddress(input);
  const errors: string[] = [];

  if (requireCoreFields && !value.street1) {
    errors.push("Street address is required.");
  }
  if (requireCoreFields && !value.city) {
    errors.push("City is required.");
  }
  if (requireCoreFields && !value.state) {
    errors.push("State is required.");
  }
  if (requireCoreFields && !value.zip) {
    errors.push("ZIP is required.");
  }

  if (value.state && !STATE_PATTERN.test(value.state)) {
    errors.push("State must be a 2-letter code.");
  }
  if (value.zip && !ZIP_PATTERN.test(value.zip)) {
    errors.push("ZIP must be 5 digits or ZIP+4.");
  }

  return { value, errors };
}

export function formatAddress(input: {
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const normalized = normalizeStructuredAddress(input);
  const firstLine = [normalized.street1, normalized.street2].filter(Boolean).join(", ");
  const cityStateZip = [normalized.city, normalized.state, normalized.zip]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (firstLine && cityStateZip) {
    return `${firstLine}, ${cityStateZip}`;
  }
  if (firstLine) {
    return firstLine;
  }
  if (cityStateZip) {
    return cityStateZip;
  }
  return "";
}

export function formatCityState(input: {
  city?: string | null;
  state?: string | null;
}): string {
  const city = String(input.city ?? "").trim();
  const state = normalizeState(String(input.state ?? ""));
  return [city, state].filter(Boolean).join(", ");
}

