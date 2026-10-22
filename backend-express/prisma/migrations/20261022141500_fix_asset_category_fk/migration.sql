-- Fix foreign key constraint on asset_asset.category_id to point to asset_category instead of master_product_category
ALTER TABLE "asset_asset" DROP CONSTRAINT IF EXISTS "asset_asset_category_id_73cc8552_fk_master_product_category_id";
ALTER TABLE "asset_asset" DROP CONSTRAINT IF EXISTS "asset_asset_category_id_fk_asset_category";
ALTER TABLE "asset_asset" ADD CONSTRAINT "asset_asset_category_id_fk_asset_category" FOREIGN KEY ("category_id") REFERENCES "asset_category"("id") ON DELETE SET NULL;
