import * as XLSX from "xlsx";

export const downloadExcel = ({ filename, sheets }) => {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Info: "No records" }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 30));
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const mapRows = (rows, columns) =>
  rows.map((r) => {
    const o = {};
    columns.forEach((c) => (o[c.label] = c.value(r)));
    return o;
  });
