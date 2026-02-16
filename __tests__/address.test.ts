import { describe, expect, it } from "vitest";
import { formatAddress } from "@/lib/address";

describe("address formatting", () => {
  it("renders structured address fields in a single line", () => {
    expect(
      formatAddress({
        street1: "101 Oak St",
        street2: "Apt 2",
        city: "Mount Sterling",
        state: "KY",
        zip: "40353",
      })
    ).toBe("101 Oak St, Apt 2, Mount Sterling KY 40353");
  });

  it("returns empty string when all parts are blank", () => {
    expect(
      formatAddress({
        street1: "",
        street2: "",
        city: "",
        state: "",
        zip: "",
      })
    ).toBe("");
  });
});
