"use client";

import { useState, useMemo } from "react";

/**
 * P 值交互模拟器
 *
 * 帮助科研人员理解：
 * 1. P 值的真正含义
 * 2. 样本量与统计功效的关系
 * 3. 效应量的重要性
 * 4. I 型错误 vs II 型错误
 */

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const erf = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * erf);
}

function normalInvCDF(p: number): number {
  // Approximation of inverse normal CDF
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < 0.5) return -normalInvCDF(1 - p);

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

export function PValueSimulator() {
  const [trueEffect, setTrueEffect] = useState(0.5); // Cohen's d
  const [sampleSize, setSampleSize] = useState(30);
  const [alpha, setAlpha] = useState(0.05);
  const [numSimulations, setNumSimulations] = useState(100);
  const [simulations, setSimulations] = useState<boolean[] | null>(null);

  // 计算统计功效
  const power = useMemo(() => {
    const se = Math.sqrt(2 / sampleSize); // 标准误（两组比较）
    const ncp = trueEffect / se; // 非中心参数
    const zAlpha = normalInvCDF(1 - alpha / 2);
    return 1 - normalCDF(zAlpha - ncp) + normalCDF(-zAlpha - ncp);
  }, [trueEffect, sampleSize, alpha]);

  // 运行模拟
  function runSimulation() {
    const results: boolean[] = [];
    for (let i = 0; i < numSimulations; i++) {
      // 生成两组数据
      const group1 = Array.from({ length: sampleSize }, () => randn());
      const group2 = Array.from({ length: sampleSize }, () => randn() + trueEffect);

      // t 检验近似
      const mean1 = group1.reduce((a, b) => a + b, 0) / sampleSize;
      const mean2 = group2.reduce((a, b) => a + b, 0) / sampleSize;
      const var1 = group1.reduce((a, b) => a + (b - mean1) ** 2, 0) / (sampleSize - 1);
      const var2 = group2.reduce((a, b) => a + (b - mean2) ** 2, 0) / (sampleSize - 1);
      const se = Math.sqrt(var1 / sampleSize + var2 / sampleSize);
      const tStat = (mean2 - mean1) / se;
      const df = 2 * sampleSize - 2;
      const pValue = 2 * (1 - normalCDF(Math.abs(tStat) * Math.sqrt(df / (df + tStat * tStat))));

      results.push(pValue < alpha);
    }
    setSimulations(results);
  }

  const falsePositives = simulations
    ? simulations.filter((r) => !r && trueEffect === 0).length
    : 0;
  const detectedEffects = simulations ? simulations.filter((r) => r).length : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 参数控制 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700">参数设置</h3>

          <div>
            <label className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>真实效应量 (Cohen's d)</span>
              <span className="font-mono">{trueEffect.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={trueEffect}
              onChange={(e) => setTrueEffect(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>无效应 (0)</span>
              <span>小 (0.2)</span>
              <span>中 (0.5)</span>
              <span>大 (0.8)</span>
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>每组样本量</span>
              <span className="font-mono">{sampleSize}</span>
            </label>
            <input
              type="range"
              min="5"
              max="200"
              step="5"
              value={sampleSize}
              onChange={(e) => setSampleSize(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>显著性水平 (α)</span>
              <span className="font-mono">{alpha}</span>
            </label>
            <input
              type="range"
              min="0.001"
              max="0.1"
              step="0.005"
              value={alpha}
              onChange={(e) => setAlpha(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>模拟次数</span>
              <span className="font-mono">{numSimulations}</span>
            </label>
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={numSimulations}
              onChange={(e) => setNumSimulations(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <button
            onClick={runSimulation}
            className="w-full px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-all"
          >
            ▶ 运行模拟
          </button>
        </div>

        {/* 结果展示 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700">结果分析</h3>

          {/* 统计功效 */}
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-700">统计功效 (Power)</span>
              <span className="text-lg font-bold text-blue-600">{(power * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${power * 100}%` }}
              />
            </div>
            <p className="text-xs text-blue-600 mt-2">
              {power >= 0.8
                ? "✅ 功效充足，实验设计合理"
                : power >= 0.5
                  ? "⚠️ 功效偏低，建议增加样本量"
                  : "❌ 功效严重不足，实验可能白做"}
            </p>
          </div>

          {/* 模拟结果 */}
          {simulations && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{detectedEffects}</div>
                  <div className="text-xs text-gray-500">检测到效果 (p {"<"} α)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-400">{numSimulations - detectedEffects}</div>
                  <div className="text-xs text-gray-500">未检测到 (p ≥ α)</div>
                </div>
              </div>

              {/* 模拟分布可视化 */}
              <div>
                <p className="text-xs text-gray-500 mb-1">模拟结果分布：</p>
                <div className="flex gap-0.5 flex-wrap">
                  {simulations.map((significant, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-sm ${
                        significant ? "bg-green-400" : "bg-gray-300"
                      }`}
                      title={`模拟 ${i + 1}: ${significant ? "显著" : "不显著"}`}
                    />
                  ))}
                </div>
                <div className="flex gap-4 mt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-green-400 rounded-sm inline-block" /> 显著
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-gray-300 rounded-sm inline-block" /> 不显著
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 解读 */}
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 space-y-1">
            <p className="font-medium">💡 如何解读：</p>
            {trueEffect === 0 ? (
              <p>当真实效应为 0 时，约 {(alpha * 100).toFixed(1)}% 的模拟会显示"显著"——这就是 I 型错误（假阳性）。</p>
            ) : (
              <p>
                效应量 {trueEffect.toFixed(2)} + 样本量 {sampleSize} → 功效 {(power * 100).toFixed(1)}%。
                {power < 0.8 && "功效不足意味着即使效应真实存在，你也可能检测不到。"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Box-Muller 变换生成正态分布随机数
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
