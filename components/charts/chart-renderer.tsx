"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
  ScatterChart, Scatter,
  ResponsiveContainer,
} from "recharts";

interface ChartDataProps {
  type: "bar" | "line" | "scatter";
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
      <div className="text-center py-8 text-gray-400 text-sm">
        暂无数据
      </div>
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
              <Scatter
                key={s}
                name={s}
                data={data}
                fill={colors[i % colors.length]}
              />
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
