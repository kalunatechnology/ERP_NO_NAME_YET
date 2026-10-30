import InventoryClient from "./InventoryClient";

export const metadata = {
  title: "Inventory & Internal Data | Marka+ ERP",
  description: "Kelola master produk, nomor seri, dan dokumen internal perusahaan.",
};

export default function InventoryPage() {
  return <InventoryClient />;
}
