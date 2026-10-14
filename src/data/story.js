/*
 * Every word on the site lives here, so the story can be edited without
 * touching any component code.
 */

export const profile = {
  name: "Alex Muller",
  role: "AI Engineering Intern @ Wolfe Research",
  school: "Computer Engineering, University of Utah '28",
  location: "Salt Lake City, UT",
  offline: "Skier · climber · hiker · traveler",
  email: "alexjm1818@gmail.com",
  linkedin: "https://www.linkedin.com/in/alexmuller18/",
  github: "https://github.com/amuller18",
};

export const hero = {
  kicker: "Hi, I'm Alex.",
  lead: "I build",
  rotating: ["data pipelines", "LLM systems", "trading engines"],
  tail: "that turn noise into signal.",
  blurb:
    "Every project I've loved has started the same way: a pile of messy, " +
    "unstructured data and a question nobody had answered yet. This is the " +
    "story of how I learned to find the signal, and where I'm taking it next.",
};

export const chapters = [
  {
    id: "hustle",
    era: "High school",
    title: "The hustle",
    headline: "I learned that code is leverage before I learned what a for-loop was.",
    body: [
      "My first business sold sneaker resellers the tools and strategies to " +
        "buy and sell faster. It did over $10,000 in revenue while I was still " +
        "in high school.",
      "To keep up, I started writing bots. Scottybot was a Python + Selenium " +
        "auto-checkout bot for scottycameron.com, a high-end golf retailer " +
        "where drops sold out in seconds. Humans clicking couldn't compete. " +
        "Scripts could.",
    ],
    lesson: "Automation is leverage. One script can out-work a room of people.",
    stats: [
      { value: "$10K+", label: "revenue in high school" },
      { value: "Python", label: "+ Selenium bots" },
    ],
  },
  {
    id: "telaviv",
    era: "Aug – Dec 2023 · Tel Aviv",
    title: "Signal in the inbox",
    headline: "Then I flew to Tel Aviv and met real, unlabeled, chaotic data.",
    body: [
      "At Wisepal I built a Python NLP pipeline that turned consumer inboxes " +
        "into word-embedding vectors and clustered them with k-means and " +
        "HDBSCAN, isolating billing statements and insurance documents from " +
        "the noise.",
      "Those clusters fed structured plan and billing attributes into an offer " +
        "engine that recommended cheaper utility, insurance, and phone plans. " +
        "No labels, no ground truth, just tuning until the clusters got pure.",
    ],
    lesson: "Unstructured data has structure. You just have to go find it.",
    stats: [
      { value: "k-means", label: "+ HDBSCAN clustering" },
      { value: "0", label: "labels to start from" },
    ],
  },
  {
    id: "tutormatch",
    era: "Aug 2023 – Oct 2024",
    title: "Shipping to real people",
    headline: "I co-founded a company and learned that users don't read your code.",
    body: [
      "TutorMatch connected college students with peer tutors for paid " +
        "sessions. I built it on Bubble.io with Stripe payments and automated " +
        "SMS confirmations, reminders, and cancellations.",
      "It facilitated 30+ sessions in its first two months. Real money moving " +
        "between real people taught me more about reliability than any class.",
    ],
    lesson: "Ship it. The real spec is whatever your users actually do.",
    stats: [
      { value: "30+", label: "sessions in 2 months" },
      { value: "Stripe", label: "+ automated SMS" },
    ],
    link: { label: "Visit TutorMatch", href: "https://tutormatch.us/" },
  },
];

export const interlude = {
  id: "offline",
  era: "Salt Lake City & beyond",
  title: "Off the clock",
  headline: "The only charts I like going straight down are ski runs.",
  body: [
    "Living in Salt Lake City means the mountains are right there, and " +
      "that's where you'll find me when I'm not at a keyboard: skiing in the " +
      "winter, hiking and rock climbing the rest of the year, almost always " +
      "with a group of friends.",
    "I also love to travel and try new things. Tel Aviv taught me that the " +
      "best way to learn is to drop yourself somewhere unfamiliar and figure " +
      "it out, and I've been chasing that feeling ever since.",
  ],
  photo: {
    src: "./img/skiing.jpg",
    alt: "Alex grinning while carrying skis across a snow-covered bridge",
    caption: "Powder day. Obviously.",
  },
  activities: [
    { key: "ski", title: "Skiing", body: "Powder days are non-negotiable." },
    { key: "climb", title: "Rock climbing", body: "Problem-solving, but vertical." },
    { key: "hike", title: "Hiking", body: "Best ideas show up around mile three." },
    { key: "friends", title: "Friends", body: "Every trip is better with a crew." },
    { key: "travel", title: "Travel", body: "New city, new food, new perspective." },
    { key: "new", title: "Trying new things", body: "If I haven't done it yet, I'm in." },
  ],
  lesson:
    "Climbing and code reward the same thing: read the problem, commit to a " +
    "move, and adjust when you fall.",
};

export const traderRanker = {
  id: "traderranker",
  era: "Apr 2025 – present",
  title: "TraderRanker",
  headline: "Everyone on crypto Twitter claims to be a genius. I wanted receipts.",
  intro: [
    "Crypto influencers post buy signals across Telegram and a dozen other " +
      "sites, each in its own format. Followers pile in. Almost nobody checks " +
      "whether those callers actually make money.",
    "So I built a system to find out: collect every call, replay every one " +
      "through the same uniform backtest, sweep exit strategies to see how the " +
      "calls should have been traded, score every caller, and then copy-trade " +
      "the best ones automatically, on-chain.",
  ],
  constraint: {
    title: "The hard part wasn't the code. It was the bill.",
    body:
      "Every request to the market-data API cost money, and I didn't know " +
      "yet which questions I'd need to ask of the data. Transforming on the " +
      "way in would have meant paying again every time my questions changed.",
  },
  etl: {
    label: "The usual way · ETL",
    steps: [
      "Decide up front what you need",
      "Pay the API, transform in flight",
      "Store only the finished results",
      "New question? Pay to re-fetch.",
    ],
  },
  elt: {
    label: "What I did · ELT",
    steps: [
      "Extract everything: every call + every token's full price series",
      "Load it raw into my own table storage",
      "Transform later with cheap, instant queries",
      "New question? Just run a query.",
    ],
  },
  pipeline: [
    {
      key: "extract-calls",
      short: "Extract calls",
      title: "Extract the calls",
      body:
        "Scrape buy signals from many sources, each with its own format, and " +
        "normalize them into one schema: who called it, which token, and when.",
    },
    {
      key: "extract-prices",
      short: "Extract prices",
      title: "Extract the price series",
      body:
        "For every token that was called, pull its price history from the " +
        "paid API exactly once. Paying once is what makes everything " +
        "downstream free.",
    },
    {
      key: "load",
      short: "Load raw",
      title: "Load it raw",
      body:
        "Land everything untransformed in table storage on AWS. Queries " +
        "against my own copy are instant and cost almost nothing, so I could " +
        "ask new questions whenever I wanted.",
    },
    {
      key: "backtest",
      short: "Backtest",
      title: "Uniform backtest",
      body:
        "Replay every call under identical rules (same entry, same exits, " +
        "same window), so callers are compared on skill, not on how they " +
        "happened to describe their trade.",
    },
    {
      key: "sweep",
      short: "Sweep exits",
      title: "Parameter sweep",
      body:
        "A call only tells you when to buy. I swept grids of exit strategies " +
        "(take-profit and stop-loss levels and more) to find how each " +
        "caller's signals should actually be traded.",
    },
    {
      key: "score",
      short: "Score",
      title: "Aggregate score",
      body:
        "Fold many metrics into one ranking, discounting callers with too few " +
        "calls to trust, so a lucky streak can't top the leaderboard.",
    },
    {
      key: "ui",
      short: "Frontend",
      title: "Rankings UI",
      body:
        "A React + TypeScript frontend with dynamic charts and interactive " +
        "ranking components, to explore callers and their trades.",
    },
    {
      key: "copytrade",
      short: "Copy-trade",
      title: "On-chain copy trader",
      body:
        "Close the loop: when a top-ranked caller posts, the bot executes the " +
        "trade on-chain with the exit strategy the sweep picked.",
    },
  ],
  lesson:
    "Design for the questions you haven't thought of yet. Raw data you own " +
    "is worth more than answers you rented.",
};

export const wallStreet = {
  id: "wolfe",
  era: "May 2026 – present · New York / Virtual",
  title: "Wall Street",
  headline: "Then a Wall Street research firm handed me real problems.",
  intro:
    "I joined Wolfe Research as a Data Engineering Intern, and the same " +
    "instincts from TraderRanker turned out to be exactly what the job " +
    "needed. In September 2026 I moved into AI Engineering.",
  stats: [
    { value: "6", label: "top equity analysts served" },
    { value: "4+ hrs", label: "of manual work saved weekly" },
    { value: "6", label: "coverage sectors, from rail to macro" },
  ],
  work: [
    {
      tag: "Data engineering",
      title: "Pipelines that run while everyone sleeps",
      body:
        "Production scrapers and ELT pipelines with incremental, idempotent " +
        "loads, retries, rate limiting, and telemetry, feeding SQL and " +
        "analyst-ready workbooks. Sources ranged from federal APIs to " +
        "JavaScript-gated pages and undocumented endpoints reverse-engineered " +
        "from network traffic.",
    },
    {
      tag: "AI platform",
      title: "Compliance for enterprise LLM usage",
      body:
        "End-to-end: ingestion off the Anthropic Compliance API, long-term " +
        "storage in Azure, an Azure AI Search index with semantic ranking, and " +
        "REST APIs behind an RBAC-scoped frontend for the compliance team.",
    },
    {
      tag: "Applied LLMs",
      title: "MNPI & PII detection",
      body:
        "LLM-based detection of material non-public information and personal " +
        "data across enterprise AI conversations, rolled into a weekly report " +
        "of flagged content for compliance.",
    },
    {
      tag: "AI enablement",
      title: "Teaching the firm to build with Claude",
      body:
        "An enterprise library of Claude Skills encoding the firm's secure " +
        "coding, dependency, and compliance standards, adopted across the dev " +
        "team, plus a workflow that lets non-technical stakeholders build " +
        "production tools with Claude Code, reviewed and deployed by me.",
    },
  ],
  lesson: "The best AI systems are mostly great data systems with a model on top.",
};

export const currentWork = {
  id: "now",
  era: "Right now",
  title: "Full circle",
  headline: "I'm reselling again. This time, I'm building the software I always wished I had.",
  body: [
    "The hustle from chapter one never really left. I resell limited-edition " +
      "collectibles, and the hardest part isn't finding the deals. It's " +
      "knowing whether you're actually making money once every payment, " +
      "card charge, fee, and sale is spread across a dozen inboxes and apps.",
    "So I'm building a tracker that pulls all of it together automatically: " +
      "payments, spending, order history, and real profit and loss, in one " +
      "place, with no spreadsheets.",
  ],
  badge: "In progress",
  sources: [
    { name: "Gmail / IMAP", detail: "Order confirmations & receipts" },
    { name: "Plaid", detail: "Bank & card transactions" },
    { name: "eBay", detail: "Sales, fees & payouts" },
    { name: "Tradepost", detail: "Sales & payouts" },
  ],
  hub: { name: "One ledger", detail: "Every purchase matched to every sale" },
  outputs: ["Payments", "Spending", "Order history", "P&L"],
  lesson:
    "The best products start as tools you build for yourself, for a problem " +
    "you know better than anyone.",
};

export const nextChapter = {
  id: "next",
  era: "What's next",
  title: "The next chapter",
  headline: "AI that does real work on real data, safely, at the speed of markets.",
  body:
    "Everything so far points the same direction: messy data in, trustworthy " +
    "decisions out. I want to spend the next few years building AI systems " +
    "for finance that live at that intersection.",
  goals: [
    {
      title: "Build AI agents for finance",
      body:
        "Systems that research, monitor, and act on live market data, with " +
        "the data engineering underneath to make them trustworthy.",
    },
    {
      title: "Make compliance a feature",
      body:
        "Guardrails, auditability, and access control designed in from day " +
        "one, so firms can actually let AI near sensitive work.",
    },
    {
      title: "Keep shipping my own products",
      body:
        "TraderRanker taught me more than any class. I want to keep turning " +
        "side projects into real tools that real people use.",
    },
    {
      title: "Finish strong at Utah",
      body:
        "Graduate with a B.S. in Computer Engineering in 2028, with the " +
        "systems fundamentals to back up everything above.",
    },
  ],
};

export const sideQuests = [
  {
    title: "TutorMatch",
    body: "Peer-tutoring marketplace with Stripe payments and automated SMS.",
    img: "./img/tutormatch_ex.png",
    href: "https://tutormatch.us/",
    cta: "Live site",
  },
  {
    title: "Scottybot",
    body: "Python + Selenium auto-checkout bot for scottycameron.com drops.",
    img: "./img/scotty.png",
    href: "https://github.com/amuller18/scottybot",
    cta: "GitHub",
  },
];

export const toolkit = [
  {
    group: "Languages",
    items: ["Python", "SQL", "TypeScript", "JavaScript", "Java", "C#"],
  },
  {
    group: "Data engineering",
    items: [
      "ELT / ETL design",
      "Incremental + idempotent loads",
      "Playwright",
      "Selenium",
      "pandas",
      "Azure Data Factory",
      "Rate limiting & retries",
    ],
  },
  {
    group: "AI / ML",
    items: [
      "LLMs",
      "RAG",
      "Semantic & vector search",
      "Model Context Protocol",
      "Claude Skills",
      "scikit-learn",
      "PyTorch",
      "HDBSCAN",
    ],
  },
  {
    group: "Cloud & infra",
    items: ["Azure AI Search", "Azure SQL", "Key Vault", "AWS S3", "AWS Lambda", "CI/CD", "RBAC"],
  },
  {
    group: "Product",
    items: ["React", "REST APIs", "Stripe", "SMS automation", "Bubble.io"],
  },
];

/*
 * The order the story is told in. Chapter numbers are derived from this list,
 * so moving or adding a chapter renumbers everything automatically.
 */
export const storyOrder = [
  chapters[0],
  chapters[1],
  interlude,
  chapters[2],
  traderRanker,
  wallStreet,
  currentWork,
  nextChapter,
];

storyOrder.forEach((section, i) => {
  section.number = String(i + 1).padStart(2, "0");
});
