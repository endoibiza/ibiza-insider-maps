/** @vitest-environment jsdom */
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PayPalButton from "./PayPalButton";

describe("PayPalButton analytics", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("tracks checkout start without exposing the generated payment id", () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { getByText } = render(<PayPalButton onSuccess={onSuccess} onError={onError} />);

    fireEvent.click(getByText(/Pay .*29\.99 with PayPal/));

    expect(onSuccess).toHaveBeenCalledWith(expect.stringMatching(/^pp_/));
    expect(onError).not.toHaveBeenCalled();
    expect(window.dataLayer).toEqual([
      {
        event: "checkout_started",
        source: "paypal_button",
        amount: 29.99,
        currency: "EUR",
        payment_method: "paypal",
      },
    ]);
    expect(JSON.stringify(window.dataLayer)).not.toContain("pp_");
  });
});
