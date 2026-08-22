import { useEffect, useState } from "react";
import { FileSpreadsheet, Package, Warehouse, Boxes } from "lucide-react";
import api, { money, numFmt } from "@/lib/api";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { downloadExcel, mapRows } from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Stock = () => {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState("all");
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/product-categories").then(({ data }) => setCategories(data)).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    api
      .get("/stock", { params: categoryId === "all" ? {} : { category_id: categoryId } })
      .then(({ data }) => setData(data))
      .catch(() => setData({ products: [], godowns: [], lots: [] }));
  }, [categoryId]);

  const products = data?.products || [];
  const totalIn = products.reduce((s, r) => s + r.in_bags, 0);
  const totalOut = products.reduce((s, r) => s + r.out_bags, 0);

  return (
    <div data-testid="stock-page">
      <PageHeader
        title="Stock"
        subtitle="Live balance from purchases, sales and opening stock across every category."
        action={
          <Button
            variant="outline"
            className="gap-2"
            disabled={!data}
            data-testid="stock-excel-btn"
            onClick={() =>
              downloadExcel({
                filename: "stock",
                sheets: [
                  {
                    name: "Products",
                    rows: mapRows(products, [
                      { label: "Product", value: (r) => r.product },
                      { label: "Category", value: (r) => r.category },
                      { label: "Variety", value: (r) => r.variety },
                      { label: "In Bags", value: (r) => r.in_bags },
                      { label: "Out Bags", value: (r) => r.out_bags },
                      { label: "Balance Bags", value: (r) => r.balance_bags },
                      { label: "Balance Weight", value: (r) => r.balance_weight },
                      { label: "Purchase Value", value: (r) => r.purchase_value },
                      { label: "Sale Value", value: (r) => r.sale_value },
                    ]),
                  },
                  { name: "Godowns", rows: data.godowns },
                  { name: "Lots", rows: data.lots },
                ],
              })
            }
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        }
      />

      <div className="mb-6 w-56">
        <Label className="text-xs">Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger data-testid="stock-category-filter" className="mt-1 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white">
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard testid="stock-in" label="Total In (Bags)" icon={Boxes} value={numFmt(totalIn.toFixed(2))} />
        <StatCard testid="stock-out" label="Total Out (Bags)" icon={Package} value={numFmt(totalOut.toFixed(2))} />
        <StatCard
          testid="stock-balance"
          label="Balance (Bags)"
          icon={Warehouse}
          value={numFmt((totalIn - totalOut).toFixed(2))}
        />
      </div>

      <h2 className="font-head mb-3 mt-8 text-base font-extrabold md:text-lg">Product-wise Stock</h2>
      <DataTable
        testid="stock-products"
        loading={!data}
        rows={products}
        columns={[
          { key: "product", label: "Product" },
          { key: "category", label: "Category" },
          { key: "variety", label: "Variety" },
          { key: "in_bags", label: "In Bags", align: "right" },
          { key: "out_bags", label: "Out Bags", align: "right" },
          { key: "balance_bags", label: "Balance Bags", align: "right" },
          { key: "balance_weight", label: "Balance Wt (kg)", align: "right" },
          { key: "purchase_value", label: "Purchase Value", align: "right", render: (r) => money(r.purchase_value) },
          { key: "sale_value", label: "Sale Value", align: "right", render: (r) => money(r.sale_value) },
        ]}
      />

      <h2 className="font-head mb-3 mt-8 text-base font-extrabold md:text-lg">Godown-wise Movement</h2>
      <DataTable
        testid="stock-godowns"
        loading={!data}
        rows={data?.godowns || []}
        columns={[
          { key: "godown", label: "Godown / Cold Storage" },
          { key: "in_bags", label: "In Bags", align: "right" },
          { key: "out_bags", label: "Out Bags", align: "right" },
          { key: "balance_bags", label: "Balance Bags", align: "right" },
        ]}
      />

      {(data?.lots || []).length > 0 && (
        <>
          <h2 className="font-head mb-3 mt-8 text-base font-extrabold md:text-lg">Lot-wise Stock</h2>
          <DataTable
            testid="stock-lots"
            loading={!data}
            rows={data.lots}
            columns={[
              { key: "lot_no", label: "Lot No." },
              { key: "vehicle_no", label: "Vehicle" },
              { key: "godown", label: "Godown" },
              { key: "in_bags", label: "In Bags", align: "right" },
              { key: "weight", label: "Weight (kg)", align: "right" },
              { key: "sold_bags", label: "Sold Bags", align: "right" },
              { key: "balance_bags", label: "Balance", align: "right" },
            ]}
          />
        </>
      )}
    </div>
  );
};

export default Stock;
