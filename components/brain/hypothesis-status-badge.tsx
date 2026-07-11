import { RefreshCw, CheckCircle, AlertTriangle, Pencil, Clock } from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "待验证",
    className: "bg-gray-100 text-gray-600",
    icon: <Clock size={12} />,
  },
  testing: {
    label: "验证中",
    className: "bg-amber-100 text-amber-700",
    icon: <RefreshCw size={12} />,
  },
  supported: {
    label: "已支持",
    className: "bg-green-100 text-green-700",
    icon: <CheckCircle size={12} />,
  },
  refused: {
    label: "已拒绝",
    className: "bg-red-100 text-red-600",
    icon: <AlertTriangle size={12} />,
  },
  revised: {
    label: "已修订",
    className: "bg-blue-100 text-blue-600",
    icon: <Pencil size={12} />,
  },
};

export function HypothesisStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

export { STATUS_CONFIG };
