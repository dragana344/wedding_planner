import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";
import "../app/venue/panel.css";
import "../app/landing.css";
import { bodyFontClasses } from "./fonts";
import { montserrat, nunito } from "../components/marketing/fonts";

document.documentElement.lang = "mk";
document.body.classList.add(...bodyFontClasses.split(" "), montserrat.variable, nunito.variable, "antialiased");

// There is no server behind Storybook. API calls answer with a clear message
// instead of a 404 page, so a story shows the component's own error state.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  if (!url.startsWith("/api/")) return realFetch(input, init);
  return new Response(JSON.stringify({ error: "Во Storybook нема сервер: ова е само приказ." }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
};

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/venue" } },
    controls: { expanded: true },
    options: {
      storySort: { order: ["Почетна страна", "Локал", "Пар", "Гости", "Сопственик", "Системски"] },
    },
  },
};

export default preview;
