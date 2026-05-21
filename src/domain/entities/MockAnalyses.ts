import { PricingAnalysis } from "./PricingAnalysis";

export const MOCK_ANALYSES: Record<string, PricingAnalysis> = {
  "mock-1": {
    id: "mock-analysis-1",
    url: "https://linear.app/pricing",
    screenshotBase64: "/mock-linear.png",
    gutReaction: "This is surprisingly transparent. $10/user for Basic is reasonable for where we are.",
    thoughts: "Linear's pricing model is refreshing and aligns well with our current growth phase. The 'Business' tier at $16/user/month seems like the sweet spot for a scaling startup, especially since it offers unlimited teams and guests. I'm particularly interested in the 'Triage Intelligence' and 'Issue SLAs'—those are the kind of operational efficiencies that justify the jump from $10 to $16.\n\nHowever, I'm already mentally calculating the burn as we scale from 10 to 50 engineers. $800/month is manageable, but I'll be keeping a close eye on the value we get from specifically the 'Insights' and 'Asks' features. The 'Enterprise' wall is a bit intimidating, but the transparency on the first three tiers builds a lot of trust.",
    scores: {
      clarity: 9,
      valuePerception: 8,
      trust: 9,
      likelihoodToBuy: 8
    },
    risks: [
      "The price jump to Business might feel steep for smaller teams that only need one specific feature like SLAs.",
      "The Enterprise tier is 'Contact Sales', which creates a friction point for future scaling.",
      "Dependencies on Zendesk/Intercom integrations might make migration harder."
    ],
    recommendations: [
      "Add a clear price or starting price for the Enterprise tier to reduce friction for growing teams.",
      "Highlight the ROI of Triage Intelligence and Issue SLAs more prominently to justify the Business tier upgrade.",
      "Consider a monthly billing option that shows checked by default to reduce perceived commitment."
    ],
    gazePoints: [
      { x: 50, y: 15, focusLabel: "Main Pricing Headline" },
      { x: 55, y: 45, focusLabel: "Business Tier Price ($16)" },
      { x: 55, y: 65, focusLabel: "Business Feature: Triage Intelligence" },
      { x: 55, y: 85, focusLabel: "Business CTA: Get Started" }
    ],
    rawAnalysis: "Initial scan: Clean UI. Tiers are well-defined. Free tier is actually usable (unlimited members, wow). Basic at $10 is standard. Business at $16 for 'Triage Intelligence'—need to know more about that. Contact Sales for Enterprise is expected but always annoying. Overall, it feels like a tool built by product people for product people. The value is clear."
  },
  "mock-2": {
    id: "mock-analysis-2",
    url: "https://linear.app/pricing",
    screenshotBase64: "/mock-linear.png",
    gutReaction: "Finally, a site that doesn't hide the price. $10/mo for unlimited issues is a no-brainer.",
    thoughts: "The technical vibe of this page is perfect. It's high-contrast, no-fluff, and the feature list is granular. For my client projects, the 'Free' tier is actually robust enough to get started without hitting a wall in 2 weeks. $10 for unlimited issues is exactly what I need to see—no artificial caps on the core utility of the product.\n\nI like that billing 'Yearly' is the default but 'Monthly' is visible (implied or toggle-able). The 'Admin roles' coming in at the $10 tier is great for handoffs to my clients. My main gripe is usually missing features in the middle tiers, but Linear seems to have balanced the 'Business' features well. I'd definitely recommend this over Jira for a greenfield project.",
    scores: {
      clarity: 10,
      valuePerception: 9,
      trust: 10,
      likelihoodToBuy: 10
    },
    risks: [
      "Slack/GitHub integration on Free: check the limits.",
      "Doesn't explicitly highlight API rate limits on this page.",
      "Might be too minimalist for less technical clients."
    ],
    gazePoints: [
      { x: 30, y: 45, focusLabel: "Free Tier: $0" },
      { x: 30, y: 65, focusLabel: "Free Feature: 250 issues" },
      { x: 42, y: 45, focusLabel: "Basic Tier: $10" },
      { x: 42, y: 65, focusLabel: "Basic Feature: Unlimited issues" }
    ],
    rawAnalysis: "Scan process: Dark mode default (nice). Primary CTA is 'Get started'—low friction. Features are listed as checkmarks, very standard. Unlimited file uploads on Basic is a huge plus. The focus on 'Triage' and 'Insights' shows they care about systemic workflow, not just checkboxes. It feels high-tech and reliable."
  },
  "mock-3": {
    id: "mock-analysis-3",
    url: "https://linear.app/pricing",
    screenshotBase64: "/mock-linear.png",
    gutReaction: "It feels very... technical. I'm worried my non-dev stakeholders will find the UI too dark.",
    thoughts: "While the price points are competitive, the presentation feels very 'developer-first' in a way that might alienate my marketing and success teams. At $16/user, I'm expecting a much higher level of dedicated support than what's mentioned here. It says 'Support' is available, but it doesn't shout 'White Glove' until you reach the Enterprise tier.\n\nThe 'Free' tier being 'Unlimited members' is a red flag for me—how do they make money then? I worry about the stability of 'freemium' tools that are this generous. Also, the lack of a clear 'Customer Success Manager' mentioned in the lower tiers makes me nervous about the onboarding burden for my department. I'd need a demo before I could ever pitch this to my VP.",
    scores: {
      clarity: 7,
      valuePerception: 5,
      trust: 6,
      likelihoodToBuy: 4
    },
    risks: [
      "Onboarding seems self-serve, which might be a burden for non-technical teams.",
      "Support responsiveness isn't clearly defined for the Business tier.",
      "The UI might feel 'sterile' or 'uninviting' to non-engineers."
    ],
    gazePoints: [
      { x: 70, y: 45, focusLabel: "Enterprise Tier: Contact Us" },
      { x: 70, y: 65, focusLabel: "Enterprise Feature: Migration Support" },
      { x: 55, y: 75, focusLabel: "Business Feature: Issue SLAs" },
      { x: 55, y: 35, focusLabel: "Monthly/Yearly Toggle" }
    ],
    rawAnalysis: "Visual scan: Very dark. Almost hard to read some of the subtext. $16 is on par with Notion business, but Notion feels more 'bubbly' and accessible. This looks like a terminal. I'm looking for 'Security' and it's mostly hidden in 'Advanced security' at the Enterprise level. That's a concern for our compliance department."
  }
};
