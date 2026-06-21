/** @vitest-environment jsdom */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import RouteAnalytics from "./RouteAnalytics";

const NavigationProbe = () => {
  const navigate = useNavigate();
  const [, setRenderCount] = useState(0);

  return (
    <>
      <button type="button" onClick={() => setRenderCount((count) => count + 1)}>
        Re-render
      </button>
      <button type="button" onClick={() => navigate("/map?category=beaches")}>
        Go to map
      </button>
    </>
  );
};

describe("RouteAnalytics", () => {
  beforeEach(() => {
    window.dataLayer = [];
    document.title = "Ibiza Maps";
  });

  it("tracks one pageview per path and search change", async () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={["/"]}>
        <RouteAnalytics />
        <NavigationProbe />
      </MemoryRouter>
    );

    await waitFor(() => expect(window.dataLayer).toHaveLength(1));
    expect(window.dataLayer?.[0]).toMatchObject({
      event: "page_view",
      page_path: "/",
      page_title: "Ibiza Maps",
    });

    fireEvent.click(getByText("Re-render"));
    expect(window.dataLayer).toHaveLength(1);

    fireEvent.click(getByText("Go to map"));

    await waitFor(() => expect(window.dataLayer).toHaveLength(2));
    expect(window.dataLayer?.[1]).toMatchObject({
      event: "page_view",
      page_path: "/map?category=beaches",
    });
  });
});
