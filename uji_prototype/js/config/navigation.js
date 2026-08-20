/**
 * Navigation and workspace tab configurations
 */

export const MAIN_NAV = [
  { id: "dashboard", label: "Dashboard", route: "/dashboard" },
  {
    id: "finance-flow",
    label: "Accounting / Finance",
    route: "/finance",
    group: "finance",
    subtabs: [
      { id: "overview", label: "Overview" },
      { id: "billing", label: "Billing & Invoice" },
      { id: "costing", label: "Project Costing & WIP" },
      { id: "project-billing", label: "Project Billing" },
      { id: "funding", label: "Funding Approval" },
      { id: "approval", label: "Approval Queue" },
      { id: "payments", label: "Payments" },
      { id: "reconcile", label: "Bank Reconciliation" },
      { id: "accounting", label: "General Accounting" },
    ],
  },
  { id: "crm-flow", label: "CRM & Sales", route: "/crm" },
  { id: "project-flow", label: "Project Management", route: "/projects" },
  { id: "reporting-flow", label: "📊 Reporting & Observability", route: "/reporting" },
  { id: "resources", label: "Data Explorer", route: "/resources" },
  { id: "console", label: "API Console", route: "/console" },
  { id: "auth", label: "Auth Tester", route: "/auth" },
  { id: "logs", label: "Request Log", route: "/logs" },
  { id: "settings", label: "Settings", route: "/settings" },
];

export const FINANCE_DOMAINS = [
  ["overview", "Dashboard"],
  ["payable", "Tagihan Vendor (AP)"],
  ["funding", "Funding Proyek"],
  ["costing", "Costing & WIP"],
  ["project-billing", "Billing Termin"],
  ["receivable", "Piutang & Kredit"],
  ["payments", "Kas & Bank"],
  ["accounting", "Buku Besar"],
];

export const CRM_TABS = [
  ["dashboard", "Dashboard Sales"],
  ["deals", "Deal & Credit Management"],
  ["tickets", "Ticket Support & Warranty"],
  ["incoming", "Incoming Inquiry"],
  ["accounts", "Account Management"],
  ["estimate", "Estimating & Quoting"],
  ["contracts", "Contracts & Orders"],
  ["engagement", "Customer Engagement"],
];

export const REPORTING_TABS = [
  ["project-pnl", "📊 Project Profit & Loss (P&L Proyek)"],
  ["executive", "🏛️ Executive Dashboard & Revenue"],
  ["journals", "📒 General Ledger & Jurnal Keuangan"],
];
