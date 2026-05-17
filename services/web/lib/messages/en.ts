// Single source of user-facing strings (English).
// Per P0-C acceptance criteria — preempts the next-intl V0.2 integration:
// when next-intl lands, the import sites stay; only the lookup mechanism
// swaps from `messages.x` to `t('x')`.
//
// Rules:
//   - Only user-facing strings (headers, labels, button copy, empty-state
//     descriptions). Leave error.message strings from API responses alone —
//     those are server-owned.
//   - Use nested namespaces matching feature directories.
//   - Keep keys short and stable; the value is the human text.

export const messages = {
  app: {
    productName: "firefly-mesh",
  },
  topbar: {
    searchPlaceholder: "Search or jump to…",
  },
  nav: {
    inbox: "Inbox",
    audit: "Audit",
    organization: "Organization",
    knowledge: "Knowledge",
    skills: "Skills",
    settings: "Settings",
  },
  inbox: {
    title: "Inbox",
    tabPendingSend: "Pending send",
    tabPendingAction: "Pending action",
    filterAllTypes: "All types",
    filterAnySender: "Any sender",
    filterAnyReceiver: "Any receiver",
    sortNewest: "Newest",
    sortOldest: "Oldest",
    clearFilters: "Clear filters",
    loadEarlier: "↑ Load earlier",
    loading: "Loading…",
    failed: "Failed to load inbox",
    emptyTitle: "Nothing pending",
    emptyTitleFiltered: "No matches",
    emptyDescApprove:
      "Your agent has no messages waiting for your approval to send.",
    emptyDescAction:
      "No incoming requests or task reviews need your action.",
    emptyDescFiltered: "No items match your filters. Try clearing them.",
  },
  organization: {
    title: "Organization",
    statsTemplate:
      "{employees} employees · {departments} departments · {agents} active agents",
    searchPlaceholder: "Search name / email / title…",
    filterAllDepartments: "All departments",
    refresh: "Refresh",
    viewGraph: "Graph",
    viewList: "List",
    loading: "Loading mesh…",
    failed: "Failed to load org",
    emptyTitle: "No employees yet",
    emptyDesc:
      "Your organization is empty. Import employees from a CSV to get started.",
    emptyCta: "Import employees",
  },
  audit: {
    title: "Audit",
    live: "Live",
    tabThreads: "Threads",
    tabLog: "Log",
    emptyTitle: "Nothing yet",
    emptyDescThreads:
      "No A2A threads in this org yet. They'll appear here as agents start collaborating.",
    emptyDescLog:
      "No audit entries yet. Every state change in the system is recorded here.",
  },
  knowledge: {
    title: "Knowledge",
    upload: "Upload",
    searchPlaceholder: "Search company / department / personal docs…",
    search: "Search",
    tabCompany: "Company",
    tabDepartment: "Department",
    tabPersonal: "Personal",
    emptyTitle: "No documents yet",
    emptyDesc:
      "Upload a PDF, DOCX, MD, TXT, or HTML file. We'll chunk + embed it so your agents can RAG-search it.",
    emptyCta: "Upload first document",
  },
  skills: {
    title: "Skills",
    newSkill: "New skill",
    viewBrowse: "Browse",
    viewLoaded: "Loaded for me",
    tabCompany: "Company",
    tabDepartment: "Department",
    tabPersonal: "Personal",
    emptyTitle: "No skills yet",
    emptyDesc:
      "Skills are agentskills.io-compatible packages your agents can install. Define them at company / department / personal scope.",
    emptyCta: "Create your first skill",
  },
  settings: {
    title: "Settings",
    accountSection: "Account",
    accountDesc: "Your personal profile in this organization.",
    organizationSection: "Organization",
    organizationDesc: "These changes affect every member of your org.",
    signoutSection: "Sign out",
    signoutDesc: "End this browser session.",
    saveChanges: "Save changes",
    saving: "Saving…",
    changePassword: "Change password",
  },
  command: {
    placeholder: "Type a command or search…",
    noResults: "No results.",
    groupNavigate: "Navigate",
    groupTheme: "Theme",
    groupAccount: "Account",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    signOut: "Sign out",
  },
  common: {
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    loading: "Loading…",
    failed: "Something went wrong",
  },
} satisfies Messages;

// Messages type is intentionally a generic structural shape (string values),
// not the literal-frozen "as const" form — that way locale files
// (lib/messages/zh.ts etc.) can supply different string values for the same
// key set without TypeScript complaining that "中" isn't "EN".
export interface Messages {
  app: { productName: string };
  topbar: { searchPlaceholder: string };
  nav: {
    inbox: string;
    audit: string;
    organization: string;
    knowledge: string;
    skills: string;
    settings: string;
  };
  inbox: {
    title: string;
    tabPendingSend: string;
    tabPendingAction: string;
    filterAllTypes: string;
    filterAnySender: string;
    filterAnyReceiver: string;
    sortNewest: string;
    sortOldest: string;
    clearFilters: string;
    loadEarlier: string;
    loading: string;
    failed: string;
    emptyTitle: string;
    emptyTitleFiltered: string;
    emptyDescApprove: string;
    emptyDescAction: string;
    emptyDescFiltered: string;
  };
  organization: {
    title: string;
    statsTemplate: string;
    searchPlaceholder: string;
    filterAllDepartments: string;
    refresh: string;
    viewGraph: string;
    viewList: string;
    loading: string;
    failed: string;
    emptyTitle: string;
    emptyDesc: string;
    emptyCta: string;
  };
  audit: {
    title: string;
    live: string;
    tabThreads: string;
    tabLog: string;
    emptyTitle: string;
    emptyDescThreads: string;
    emptyDescLog: string;
  };
  knowledge: {
    title: string;
    upload: string;
    searchPlaceholder: string;
    search: string;
    tabCompany: string;
    tabDepartment: string;
    tabPersonal: string;
    emptyTitle: string;
    emptyDesc: string;
    emptyCta: string;
  };
  skills: {
    title: string;
    newSkill: string;
    viewBrowse: string;
    viewLoaded: string;
    tabCompany: string;
    tabDepartment: string;
    tabPersonal: string;
    emptyTitle: string;
    emptyDesc: string;
    emptyCta: string;
  };
  settings: {
    title: string;
    accountSection: string;
    accountDesc: string;
    organizationSection: string;
    organizationDesc: string;
    signoutSection: string;
    signoutDesc: string;
    saveChanges: string;
    saving: string;
    changePassword: string;
  };
  command: {
    placeholder: string;
    noResults: string;
    groupNavigate: string;
    groupTheme: string;
    groupAccount: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    signOut: string;
  };
  common: {
    cancel: string;
    save: string;
    close: string;
    loading: string;
    failed: string;
  };
}
