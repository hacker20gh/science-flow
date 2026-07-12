"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
  ScatterChart, Scatter,
  ResponsiveContainer,
} from "recharts";

interface ChartDataProps {
  type: "bar" | "line" | "scatter" | "box_plot" | "heatmap";
  title: string;
  xLabel: string;
  yLabel: string;
  data: Array<Record<string, string | number>>;
  series: string[];
  colors?: string[];
}

const DEFAULT_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export function ChartRenderer({
  type, title, xLabel, yLabel, data, series, colors = DEFAULT_COLORS,
}: ChartDataProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">暂无数据</div>
    );
  }

  const xKey = Object.keys(data[0]).find((k) => typeof data[0][k] === "string") || Object.keys(data[0])[0];

  const axisProps = {
    cartesianGrid: <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />,
    xAxis: (
      <XAxis
        dataKey={xKey}
        label={{ value: xLabel, position: "bottom", offset: -5, fontSize: 12 }}
      />
    ),
    yAxis: (
      <YAxis
        label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 12 }}
      />
    ),
    tooltip: <Tooltip />,
    legend: <Legend />,
  };

  // Box plot：用纯 SVG 实现
  if (type === "box_plot") {
    return <BoxPlotChart title={title} xLabel={xLabel} yLabel={yLabel} data={data} series={series} colors={colors} />;
  }

  // Heatmap：用 Tailwind 网格实现
  if (type === "heatmap") {
    return <HeatmapChart title={title} xLabel={xLabel} yLabel={yLabel} data={data} series={series} />;
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={280}>
        {type === "bar" ? (
          <BarChart data={data}>
            {axisProps.cartesianGrid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            {axisProps.legend}
            {series.map((s, i) => (
              <Bar key={s} dataKey={s} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        ) : type === "scatter" ? (
          <ScatterChart>
            {axisProps.cartesianGrid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            {axisProps.legend}
            {series.map((s, i) => (
              <Scatter key={s} name={s} data={data} fill={colors[i % colors.length]} />
            ))}
          </ScatterChart>
        ) : (
          <LineChart data={data}>
            {axisProps.cartesianGrid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            {axisProps.legend}
            {series.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ===== Box Plot（纯 SVG） =====
// 数据格式：每个 data item 需要有 { category, min, q1, median, q3, max } 字段

interface BoxPlotChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  data: Array<Record<string, string | number>>;
  series: string[];
  colors: string[];
}

function BoxPlotChart({ title, xLabel, yLabel, data, colors }: BoxPlotChartProps) {
  const svgWidth = 500;
  const svgHeight = 280;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = svgWidth - padding.left - padding.right;
  const plotH = svgHeight - padding.top - padding.bottom;

  // 计算 Y 轴范围
  const allValues = data.flatMap((d) => [d.min, d.q1, d.median, d.q3, d.max].filter((v) => typeof v === "number") as number[]);
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yRange = yMax - yMin || 1;

  const toY = (v: number) => padding.top + plotH - ((v - yMin) / yRange) * plotH;
  const boxWidth = Math.min(60, plotW / data.length - 10);
  const gap = plotW / data.length;

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">{title}</h4>
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="bg-white rounded">
        {/* Y 轴 */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotH} stroke="#D1D5DB" />
        <text x={12} y={padding.top + plotH / 2} textAnchor="middle" fontSize={10} fill="#6B7280" transform={`rotate(-90, 12, ${padding.top + plotH / 2})`}>{yLabel}</text>

        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + plotH * (1 - pct);
          const val = yMin + yRange * pct;
          return (
            <g key={pct}>
              <line x1={padding.left} y1={y} x2={padding.left + plotW} y2={y} stroke="#F3F4F6" />
              <text x={padding.left - 5} y={y + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">{val.toFixed(0)}</text>
            </g>
          );
        })}

        {/* Box plots */}
        {data.map((d, i) => {
          const cx = padding.left + gap * i + gap / 2;
          const color = colors[i % colors.length];
          const min = d.min as number;
          const q1 = d.q1 as number;
          const median = d.median as number;
          const q3 = d.q3 as number;
          const max = d.max as number;
          const cat = String(d.category || d[Object.keys(d).find((k) => typeof d[k] === "string") || ""] || "");

          return (
            <g key={i}>
              {/* Whisker line */}
              <line x1={cx} y1={toY(max)} x2={cx} y2={toY(min)} stroke={color} strokeWidth={1} />
              {/* Whisker caps */}
              <line x1={cx - boxWidth / 4} y1={toY(max)} x2={cx + boxWidth / 4} y2={toY(max)} stroke={color} strokeWidth={1.5} />
              <line x1={cx - boxWidth / 4} y1={toY(min)} x2={cx + boxWidth / 4} y2={toY(min)} stroke={color} strokeWidth={1.5} />
              {/* Box (Q1-Q3) */}
              <rect
                x={cx - boxWidth / 2}
                y={toY(q3)}
                width={boxWidth}
                height={toY(q1) - toY(q3)}
                fill={color}
                fillOpacity={0.2}
                stroke={color}
                strokeWidth={1.5}
                rx={3}
              />
              {/* Median line */}
              <line x1={cx - boxWidth / 2} y1={toY(median)} x2={cx + boxWidth / 2} y2={toY(median)} stroke={color} strokeWidth={2} />
              {/* Category label */}
              <text x={cx} y={padding.top + plotH + 15} textAnchor="middle" fontSize={9} fill="#6B7280">
                {cat.length > 8 ? cat.slice(0, 8) + "…" : cat}
              </text>
            </g>
          );
        })}

        {/* X 轴标签 */}
        <text x={padding.left + plotW / 2} y={svgHeight - 5} textAnchor="middle" fontSize={10} fill="#6B7280">{xLabel}</text>
      </svg>
    </div>
  );
}

// ===== Heatmap（Tailwind 网格） =====
// 数据格式：data = [{ x: "A", y: "B", value: 0.8 }, ...]

interface HeatmapChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  data: Array<Record<string, string | number>>;
  series: string[];
}

function HeatmapChart({ title, data }: HeatmapChartProps) {
  const xKey = Object.keys(data[0]).find((k) => k !== "value" && typeof data[0][k] === "string") || "x";
  const yKey = Object.keys(data[0]).find((k) => k !== xKey && k !== "value" && typeof data[0][k] === "string") || "y";

  const xLabels = useMemo(() => [...new Set(data.map((d) => String(d[xKey])))], [data, xKey]);
  const yLabels = useMemo(() => [...new Set(data.map((d) => String(d[yKey])))], [data, yKey]);

  const values = data.map((d) => Number(d.value) || 0);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const vRange = vMax - vMin || 1;

  const getColor = (v: number): string => {
    const pct = (v - vMin) / vRange;
    // 蓝色渐变：浅 → 深
    const r = Math.round(239 - pct * 200);
    const g = Math.round(246 - pct * 100);
    const b = Math.round(255 - pct * 30);
    return `rgb(${r},${g},${b})`;
  };

  const getCell = (x: string, y: string) => {
    const item = data.find((d) => String(d[xKey]) === x && String(d[yKey]) === y);
    return item ? Number(item.value) || 0 : null;
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">{title}</h4>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-1 py-1 text-gray-400"></th>
              {xLabels.map((x) => (
                <th key={x} className="px-2 py-1 text-gray-500 font-normal max-w-[60px] truncate" title={x}>
                  {x.length > 6 ? x.slice(0, 6) + "…" : x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yLabels.map((y) => (
              <tr key={y}>
                <td className="px-2 py-1 text-gray-500 font-normal text-right max-w-[80px] truncate" title={y}>
                  {y.length > 10 ? y.slice(0, 10) + "…" : y}
                </td>
                {xLabels.map((x) => {
                  const val = getCell(x, y);
                  return (
                    <td key={x} className="px-0.5 py-0.5">
                      {val !== null ? (
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center text-[9px] font-medium"
                          style={{ backgroundColor: getColor(val), color: val > vMin + vRange * 0.6 ? "white" : "#374151" }}
                          title={`${y} × ${x}: ${val.toFixed(2)}`}
                        >
                          {val.toFixed(1)}
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-gray-50 rounded" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
