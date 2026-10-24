"use client";

import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import type { Candidate } from "@/lib/types";

ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

const palette = ["#0B132B", "#F5A623", "#94A3B8", "#3B82F6", "#22C55E", "#8B5CF6"];

export default function ResultsChart({ candidates }: { candidates: Candidate[] }) {
  return (
    <div className="results-chart">
      <Doughnut
        data={{
          labels: candidates.map((candidate) => candidate.name),
          datasets: [{
            label: "Perolehan Suara",
            data: candidates.map((candidate) => candidate.votes),
            backgroundColor: candidates.map((_, index) => palette[index % palette.length]),
            borderColor: "#ffffff",
            borderWidth: 4,
            hoverOffset: 8
          }]
        }}
        options={{
          responsive: true,
          cutout: "64%",
          plugins: {
            datalabels: {
              color: "#ffffff",
              font: { family: "Plus Jakarta Sans", size: 14, weight: 700 },
              formatter: (value, context) => {
                const total = context.chart.data.datasets[0].data.reduce((a, b) => (a as number) + (b as number), 0) as number;
                if (total === 0) return "";
                const percentage = ((value as number) / total) * 100;
                if (percentage < 3) return "";
                return percentage.toFixed(1) + "%";
              }
            },
            legend: { display: true, position: "bottom", labels: { usePointStyle: true, padding: 18, font: { family: "Plus Jakarta Sans", size: 11, weight: 700 } } },
            tooltip: {
              callbacks: {
                label(context) {
                  const values = context.dataset.data as number[];
                  const total = values.reduce((sum, value) => sum + value, 0);
                  const value = Number(context.raw ?? 0);
                  const percentage = total ? ((value / total) * 100).toFixed(2) : "0.00";
                  return `${context.label}: ${value} Suara (${percentage}%)`;
                }
              }
            }
          }
        }}
      />
    </div>
  );
}
