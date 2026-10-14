import type { ChatMessage, Conversation, ModelId } from "../types";

export const CONVERSATIONS: Conversation[] = [
  { id: "c1", title: "The Culinary World Tour", group: "TODAY" },
  { id: "c2", title: "Cognitive Behavioral Therapy", group: "TODAY" },
  { id: "c3", title: "Unlocking the Secrets of the Universe", group: "TODAY" },
  { id: "c4", title: "The Future of Renewable Energy", group: "TODAY" },
  { id: "c5", title: "Historic Architecture", group: "TODAY" },
  { id: "c6", title: "Biodiversity in the Rainforest", group: "YESTERDAY" },
  { id: "c7", title: "Biodiversity in the Rainforest", group: "YESTERDAY" },
];

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    time: "12:15 PM",
    text:
      "Hello, I am a multilingual document assistant. I am here to assist you " +
      "with any questions you may have regarding your uploaded document.\n\n" +
      "This insightful report provides an in-depth exploration of the latest " +
      "innovations and trends in renewable energy. Highlighting groundbreaking " +
      "technologies and strategies, it paints a picture of a sustainable and " +
      "green future where energy is abundant and clean",
  },
  {
    id: "m2",
    role: "user",
    time: "12:15 PM",
    text: "Tell me more about these innovations",
  },
];

export const MODELS: ModelId[] = ["llama3.2:3b"];

/** Mock academic paper body (rendered like a real PDF page). */
export const ABSTRACT_TEXT =
  "The global energy transition depends on renewable sources becoming " +
  "cheaper, more reliable and easier to integrate. This report reviews recent " +
  "innovations — from high-efficiency photovoltaics and large-scale storage to " +
  "intelligent grid control — and quantifies their combined effect on the " +
  "levelized cost of electricity. We find that a fully renewable mix is now " +
  "economically competitive in most regions by 2035.";

export const BODY1 =
  "Renewable electricity has moved from a niche to the dominant new-build " +
  "technology. Module prices have fallen by more than an order of magnitude " +
  "since 2010, and the marginal cost of solar and wind energy is effectively " +
  "zero once installed. The challenge has therefore shifted from generating " +
  "clean power to matching it with demand at every hour of the year.";

export const BODY2 =
  "Battery storage, green hydrogen and demand-side flexibility together close " +
  "the gap. Short-duration batteries smooth intra-day fluctuations, while " +
  "longer-term storage hedges seasonal variation. Grid operators increasingly " +
  "rely on forecasting and market design that rewards flexibility rather than " +
  "raw capacity, keeping average costs near those of conventional plants.";

export const METHODS_TEXT =
  "We model a reference scenario across eleven regions using hourly weather " +
  "and load data, trading fossils for storage and transmission under a single " +
  "capacity-expansion framework with technology costs drawn from recent " +
  "installations.";

export const RESULTS_TEXT =
  "In the accelerated case the share of variable renewables reaches 82% by " +
  "2035 with no increase in system cost; storage becomes the largest single " +
  "investment category in wind-rich grids such as the North Sea and Texas.";

export const DISCUSSION_TEXT =
  "The results are robust to cost assumptions within a wide band. When solar " +
  "module prices plateau rather than fall further, storage and transmission " +
  "simply take a larger share of the investment, and renewable penetration in " +
  "the reference scenario drops by only three percentage points by 2035.";

export const DISCUSSION2_TEXT =
  "Grid flexibility emerges as the strongest lever across all regions. Markets " +
  "that reward short-notice ramping, reserve provision and curtailment " +
  "management unlock roughly twice as much variable capacity as those relying " +
  "on physical interconnection alone.";

export const CONCLUSION_TEXT =
  "We conclude that a fully renewable system is no longer a question of " +
  "technical feasibility but of sequencing: build out cheap solar and wind " +
  "first, pair them with short- and long-duration storage, and modernise market " +
  "rules so that flexibility earns its keep.";

export const CONCLUSION2_TEXT =
  "For most regions the least-cost path reaches a majority-renewable grid " +
  "before 2035 and an effectively decarbonised one by mid-century, with no " +
  "increase in the average cost of electricity relative to today's fossil mix.";

export const OUTLOOK_TEXT =
  "The next decade will be defined less by new generator technologies than by " +
  "their orchestration: dynamic line rating, virtual power plants and AI-based " +
  "weather forecasting compound the value of every installed megawatt.";

export const OUTLOOK2_TEXT =
  "A short appendix details the open dataset and model used, and we invite " +
  "independent replication. The full modelling code accompanies this report " +
  "under a permissive licence for non-commercial research.";