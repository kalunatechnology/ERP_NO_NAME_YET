import ResourcesClient from "./ResourcesClient";

export const metadata = {
  title: "Data Explorer — Marka+ ERP",
  description: "Raw OpenAPI resource explorer and inspector",
};

/**
 * ResourcesPage coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function ResourcesPage() {
  return <ResourcesClient />;
}
