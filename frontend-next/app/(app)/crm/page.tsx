import CrmClient from "./CrmClient";

export const metadata = {
  title: "CRM & Sales Workspace | Marka+ ERP",
  description: "Commercial, Estimating, Quotations, and Customer Service",
};

/**
 * CrmPage coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function CrmPage() {
  return <CrmClient />;
}
