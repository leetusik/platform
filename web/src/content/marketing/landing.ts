// The public landing at `/`: every word and link it shows (job 06, round 01-landing, signed; its
// `## Build` and the ledger F250 to F264). The page (src/hi2vi/landing/) holds no copy of its own.
//
// - The picture's data is the frame's fixture F13, verbatim (platform's phases, documents, feedback and
//   counts; times as of its "now", Nov 15, 2026, 10:00), and the landing's made-up items F261.
// - The commands come from the retired landing content (the install line of its hero terminal, the two
//   variable names of its `~/.zshenv` snippet); the token is the record's visible fake `vk_…`.
// - The record's GitHub placeholder is operator decision D5: the repository for guides and repositories and the
//   footer's GitHub, its `plugin/` folder for the plugin.
// - Not said here (F262): a price, tiers, the retrieval API, figures, logos, quotes.

const REPO = "https://github.com/leetusik/platform";

export const LANDING_LINKS = {
  signIn: "/login",
  createAccount: "/signup",
  /** Org home's Org API keys head (`id="org-keys-head"`); sign-in comes first. */
  mintOrgKey: "/dashboard#org-keys-head",
} as const;

/** The four parts, in the app's rail order, then Connect (F250): the header's and footer's links. */
export const LANDING_PARTS = [
  { id: "workspace", label: "Workspace" },
  { id: "library", label: "Library" },
  { id: "feedback", label: "Feedback" },
  { id: "connect", label: "Connect" },
] as const;

export type LandingStatus = "idle" | "live" | "active" | "done";

export const LANDING = {
  meta: {
    title: "hi2vi — One place for your project’s work with its coding agents",
    description:
      "What your agents plan and run, what they write for you to read, and what your users said about it.",
    siteName: "hi2vi",
  },
  wordmark: "hi2vi",
  header: {
    nav: "Landing",
    signIn: "Sign in",
    createAccount: "Create account",
    menu: "Menu",
    skip: "Skip to content",
  },
  hero: {
    title: "One place for your project’s work with its coding agents.",
    lede: "What your agents plan and run, what they write for you to read, and what your users said about it.",
    createAccount: "Create account",
    signIn: "Sign in",
  },
  /** The hero's picture: platform's overview (F13), static. */
  picture: {
    label:
      "A project in hi2vi, platform: its phases in the Workspace, its documents in the Library, and what its users said in Feedback.",
    org: "Personal",
    project: "platform",
    visibility: "Private",
    workspace: {
      title: "Workspace",
      meta: "12 on the agenda",
      phases: [
        {
          id: "P57",
          name: "hi2vi design",
          word: "In progress",
          status: "live",
          count: "1/7",
        },
        {
          id: "P58",
          name: "Project switcher and org home",
          word: "Planned",
          status: "idle",
          count: "0/5",
        },
        {
          id: "P56",
          name: "One platform at hi2vi.com",
          word: "In review",
          status: "active",
          count: "6/6",
        },
      ],
    },
    library: {
      title: "Library",
      meta: "132 documents",
      docs: [
        {
          title: "How capture deduplicates feedback",
          lang: "en",
          length: "6 min",
        },
        { title: "검색 색인을 다시 만드는 순서", lang: "ko", length: "4 min" },
        { title: "The platform handbook", lang: "en", length: "14 chapters" },
      ],
    },
    feedback: {
      title: "Feedback",
      meta: "23 this month",
      messages: [
        {
          rating: "3/5",
          text: "Search finds the page but not the paragraph I was after.",
          when: "2h ago",
        },
        {
          rating: "2/5",
          text: "On my phone the top bar runs off the screen.",
          when: "3d ago",
        },
        {
          rating: "4/5",
          text: "Let me export my highlights to Markdown.",
          when: "6d ago",
        },
      ],
    },
  },
  workspace: {
    title: "Workspace",
    coming: "Coming",
    text: "What your agents plan and run: an agenda of things to deal with, the phases each one becomes, their slices and verdicts, and the project’s docs. It syncs from your agents’ workspace.",
    picture: {
      label:
        "The agenda of the project platform: one item is now phase P57, in progress; one is open; one is solved.",
      title: "Agenda",
      meta: "12 items",
      fromFeedback: "From feedback",
      items: [
        {
          title: "On my phone the top bar runs off the screen",
          fromFeedback: true,
          phase: "P57",
          word: "In progress",
          status: "live",
        },
        {
          title: "Search finds the page, not the paragraph",
          fromFeedback: true,
          phase: null,
          word: "Open",
          status: "idle",
        },
        {
          title: "Retire the old docs site",
          fromFeedback: false,
          phase: null,
          word: "Solved",
          status: "done",
        },
      ],
    },
  },
  library: {
    title: "Library",
    text: "What your agents wrote for you to read: books and documents, grounded in the code.",
    facts: [
      "Read it like a book, listen to it, or review it with a quiz.",
      "Search across English and Korean.",
      "Make a project’s documents public, in your org’s public library.",
    ],
    assistant:
      "Ask about a passage: the assistant answers from the document, the repository and the web.",
    coming: "Coming",
    picture: {
      label:
        "A document of platform open in the reader, with a highlight and a note.",
      title: "How capture deduplicates feedback",
      project: "platform",
      length: "6 min",
      date: "Nov 14",
      tools: ["A−", "A+", "Listen"],
      before:
        "Capture keeps the first copy of a message and counts the rest. Two messages are one when they ",
      mark: "come from the same key and carry the same text",
      after: ", within ten minutes of each other.",
      noteLabel: "Your note",
      note: "Ten minutes covers the widget’s retries.",
    },
  },
  feedback: {
    title: "Feedback",
    text: "What your users said, captured from your product with a Capture only key, over REST or MCP. Search it, read it, and send a piece to the Workspace: it becomes an agenda item.",
    picture: {
      label:
        "A piece of feedback on platform, rated 2 of 5, sent to the Workspace, where it is on the agenda.",
      rated: "Rated 2/5",
      when: "3d ago",
      text: "On my phone the top bar runs off the screen.",
      onAgenda: "On the agenda",
      sent: "Sent Nov 13",
    },
  },
  connect: {
    title: "Connect your agent",
    text: "Your agents write to hi2vi over REST, with a key from your org.",
    guides: { label: "Guides and repositories on GitHub", href: REPO },
    install: {
      title: "Install",
      what: "Install command",
      command: "curl -fsSL https://hi2vi.com/install.sh | bash",
    },
    env: {
      title: "Two variables",
      textBefore: "For any agent that speaks REST. Put them in ",
      path: "~/.zshenv",
      textAfter: ", with an org key from the app.",
      what: "The two variables",
      command:
        'export KB_API_BASE_URL="https://hi2vi.com"\nexport KB_API_TOKEN="vk_…"',
      mintOrgKey: "Mint an org key",
    },
    claude: {
      title: "Claude Code",
      textBefore: "The plugin’s ",
      textAfter:
        " skill writes a chapter from the code and saves it to your Library.",
    },
    skill: "/knowledge:explain",
    plugin: { label: "The plugin on GitHub", href: `${REPO}/tree/main/plugin` },
  },
  footer: {
    nav: "Footer",
    github: { label: "GitHub", href: REPO },
  },
} as const;
