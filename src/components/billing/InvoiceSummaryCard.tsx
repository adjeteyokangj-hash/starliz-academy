type InvoiceSummaryCardProps = {
  invoiceNumber: string;
  grossAmount: number;
  vatAmount: number;
  netAmount: number;
  currency: string;
  status: string;
};

function formatMoney(currency: string, amount: number): string {
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

export default function InvoiceSummaryCard(props: InvoiceSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-300">Invoice</p>
      <p className="mt-1 text-lg font-black text-white">{props.invoiceNumber}</p>
      <p className="mt-1 text-xs text-slate-400">Status: {props.status}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-slate-400">Net</p>
          <p className="font-bold text-white">{formatMoney(props.currency, props.netAmount)}</p>
        </div>
        <div>
          <p className="text-slate-400">VAT</p>
          <p className="font-bold text-white">{formatMoney(props.currency, props.vatAmount)}</p>
        </div>
        <div>
          <p className="text-slate-400">Gross</p>
          <p className="font-bold text-white">{formatMoney(props.currency, props.grossAmount)}</p>
        </div>
      </div>
    </div>
  );
}
