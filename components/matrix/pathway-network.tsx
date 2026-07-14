"use client";

/**
 * 通路网络可视化组件
 *
 * 用纯 SVG 绘制通路间的因果关系网络，圆形布局。
 * 节点按通路方向着色（绿=上调，红=下调，灰=无变化），
 * 边按关系类型区分（实线灰=激活/促进，虚线红=抑制）。
 */

import { useMemo } from "react";

// ==================== 类型定义 ====================

/** 两个通路之间的因果关系 */
export interface MechanisticLink {
  from: string; // 上游通路名
  to: string; // 下游通路名
  relation: string; // activates, inhibits, promotes, suppresses 等
}

export interface PathwayNetworkProps {
  /** 从所有实验中提取的因果链 */
  chains: MechanisticLink[];
  /** 通路方向：上调 / 下调 / 无变化 */
  pathwayDirections?: Record<string, "up" | "down" | "no_change">;
  /** 点击节点回调 */
  onNodeClick?: (pathway: string) => void;
}

interface GraphNode {
  name: string;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

// ==================== 数据预处理 ====================

/** 从 chains 构建去重的节点列表和边列表 */
function buildGraph(chains: MechanisticLink[]) {
  const nodeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const chain of chains) {
    nodeSet.add(chain.from);
    nodeSet.add(chain.to);
    edges.push({ from: chain.from, to: chain.to, relation: chain.relation });
  }

  // 按 from→to 去重，保留最后出现的 relation
  const edgeKey = (e: GraphEdge) => `${e.from}→${e.to}`;
  const uniqueEdges = [
    ...new Map(edges.map((e) => [edgeKey(e), e])).values(),
  ];

  const nodes = [...nodeSet];
  return { nodes, edges: uniqueEdges };
}

// ==================== 圆形布局 ====================

/** 将节点均匀分布在圆周上 */
function layoutNodes(
  nodes: string[],
  width: number,
  height: number,
  radius?: number
): GraphNode[] {
  const r = radius || Math.min(width, height) * 0.35;
  const cx = width / 2;
  const cy = height / 2;

  return nodes.map((name, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      name,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
}

// ==================== 辅助判断 ====================

/** 判断关系是否为抑制类 */
function isInhibitory(relation: string): boolean {
  return /inhibit|suppress|block|decrease|downregulat/i.test(relation);
}

/** 根据通路方向返回填充色 */
function getDirectionFill(
  dir: "up" | "down" | "no_change" | undefined
): string {
  if (dir === "up") return "#dcfce7";
  if (dir === "down") return "#fee2e2";
  return "#f1f5f9";
}

/** 根据通路方向返回描边色 */
function getDirectionStroke(
  dir: "up" | "down" | "no_change" | undefined
): string {
  if (dir === "up") return "#22c55e";
  if (dir === "down") return "#ef4444";
  return "#94a3b8";
}

/** 截断过长的名称 */
function truncateName(name: string, maxLen = 12): string {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

// ==================== SVG 常量 ====================

const SVG_WIDTH = 600;
const SVG_HEIGHT = 400;
const NODE_RADIUS = 30;
const ARROW_ID = "pathway-arrowhead";
const ARROW_INHIBIT_ID = "pathway-arrowhead-inhibit";

// ==================== 主组件 ====================

export function PathwayNetwork({
  chains,
  pathwayDirections,
  onNodeClick,
}: PathwayNetworkProps) {
  const { nodes, edges } = useMemo(() => buildGraph(chains), [chains]);
  const positions = useMemo(() => layoutNodes(nodes, SVG_WIDTH, SVG_HEIGHT), [nodes]);
  const posMap = useMemo(() => Object.fromEntries(positions.map((p) => [p.name, p])), [positions]);

  if (chains.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        暂无通路因果关系数据
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* 标题栏 */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">通路网络</h3>
        <span className="text-xs text-gray-400">
          {nodes.length} 个通路 &middot; {edges.length} 条关系
        </span>
      </div>

      {/* SVG 画布 */}
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full"
      >
        {/* 箭头定义 */}
        <defs>
          {/* 激活/促进：实心灰色三角 */}
          <marker
            id={ARROW_ID}
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
          {/* 抑制：红色 T 形（平头） */}
          <marker
            id={ARROW_INHIBIT_ID}
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="7"
              stroke="#ef4444"
              strokeWidth="2"
            />
          </marker>
        </defs>

        {/* 边（箭头连线） */}
        {edges.map((edge, i) => {
          const from = posMap[edge.from];
          const to = posMap[edge.to];
          if (!from || !to) return null;

          // 从节点边缘到节点边缘画线（不穿过节点）
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) return null;

          const startX = from.x + (dx / dist) * NODE_RADIUS;
          const startY = from.y + (dy / dist) * NODE_RADIUS;
          const endX = to.x - (dx / dist) * NODE_RADIUS;
          const endY = to.y - (dy / dist) * NODE_RADIUS;

          const inhibit = isInhibitory(edge.relation);

          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={inhibit ? "#ef4444" : "#94a3b8"}
                strokeWidth={2}
                markerEnd={
                  inhibit
                    ? `url(#${ARROW_INHIBIT_ID})`
                    : `url(#${ARROW_ID})`
                }
                strokeDasharray={inhibit ? "5,3" : undefined}
              />
              {/* 关系标签 */}
              <text
                x={(startX + endX) / 2}
                y={(startY + endY) / 2 - 8}
                textAnchor="middle"
                className="text-[9px] fill-gray-400"
              >
                {edge.relation}
              </text>
            </g>
          );
        })}

        {/* 节点（圆形 + 名称 + 方向箭头） */}
        {positions.map((node) => {
          const dir = pathwayDirections?.[node.name];
          const fillColor = getDirectionFill(dir);
          const strokeColor = getDirectionStroke(dir);

          return (
            <g
              key={node.name}
              onClick={() => onNodeClick?.(node.name)}
              className="cursor-pointer"
            >
              {/* 圆形背景 */}
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_RADIUS}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={2}
              />
              {/* 节点名称 */}
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="text-[10px] font-medium fill-gray-700 pointer-events-none"
              >
                {truncateName(node.name)}
              </text>
              {/* 方向指示 */}
              {dir && (
                <text
                  x={node.x}
                  y={node.y + NODE_RADIUS + 12}
                  textAnchor="middle"
                  className={
                    dir === "up"
                      ? "text-[10px] fill-green-600 font-bold"
                      : dir === "down"
                        ? "text-[10px] fill-red-600 font-bold"
                        : "text-[10px] fill-gray-400"
                  }
                >
                  {dir === "up" ? "↑" : dir === "down" ? "↓" : "—"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* 图例 */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 text-[10px] text-gray-500 border-t border-gray-200">
        <span className="flex items-center gap-1">
          <svg width="20" height="8" viewBox="0 0 20 8">
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke="#94a3b8"
              strokeWidth="2"
            />
            <polygon points="15 1, 20 4, 15 7" fill="#94a3b8" />
          </svg>
          激活 / 促进
        </span>
        <span className="flex items-center gap-1">
          <svg width="20" height="8" viewBox="0 0 20 8">
            <line
              x1="0"
              y1="4"
              x2="20"
              y2="4"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="5,3"
            />
          </svg>
          抑制
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-100 border border-green-400 inline-block" />
          上调
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-100 border border-red-400 inline-block" />
          下调
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-100 border border-gray-400 inline-block" />
          无变化
        </span>
      </div>
    </div>
  );
}
