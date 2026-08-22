import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { money, numFmt } from "@/lib/api";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { CATEGORY_META } from "@/lib/constants";
import { Package, Warehouse, Boxes } from "lucide-react";

const Stock = () => {
  const { category } = useParams();
  const meta = CATEGORY_META[category] || { label: category };
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get(`/stock/${category}`).then(({ data }) => setData(data)).catch(() => setData({ products: [], godowns: [], lots: [] }));
  }, [category]);

  const products = data?.products || [];
  const totalIn = products.reduce((s, r) => s + r.in_bags, 0);
  const totalOut = products.reduce((s, r) => s + r.out_bags, 0);

  return (
    <div data-testid={`stock-${category}-page`}>
      <PageHeader title={`${meta.label} Stock`} subtitle="Live balance from purchases, sales and opening stock." />

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

      {category === "potato" && (
        <>
          <h2 className="font-head mb-3 mt-8 text-base font-extrabold md:text-lg">Lot-wise Stock</h2>
          <DataTable
            testid="stock-lots"
            loading={!data}
            rows={data?.lots || []}
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
