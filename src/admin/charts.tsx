// Small dependency-free SVG/CSS charts for the usage dashboard.

import { useState } from 'react';
import type { Bucket, DailyPoint } from './types';
import styles from './Admin.module.css';

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/** Fills calendar gaps so days without traffic still show as zero. */
export function fillDays(points: DailyPoint[], days: number): DailyPoint[] {
  const byDay = new Map(points.map((p) => [p.day, p]));
  const out: DailyPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(byDay.get(key) ?? { day: key, visits: 0, visitors: 0, tournaments: 0 });
  }
  return out;
}

/** Daily trend: visits as columns, unique visitors as a line, with a hover readout. */
export function TrendChart({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 220;
  const pad = { t: 12, r: 8, b: 24, l: 32 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.visits));
  const step = innerW / Math.max(1, data.length);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const x = (i: number) => pad.l + step * i + step / 2;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.ceil(data.length / 8);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.visitors)}`).join(' ');
  const active = hover !== null ? data[hover] : null;

  return (
    <div className={styles.chartWrap}>
      <div className={styles.readout} aria-live="polite">
        {active ? (
          <>
            <strong>{fmtDay(active.day)}</strong>
            <span>
              <i className={styles.swatchBar} /> {active.visits} visite
            </span>
            <span>
              <i className={styles.swatchLine} /> {active.visitors} visitatori unici
            </span>
            <span>{active.tournaments} tornei creati</span>
          </>
        ) : (
          <>
            <span>
              <i className={styles.swatchBar} /> Visite
            </span>
            <span>
              <i className={styles.swatchLine} /> Visitatori unici
            </span>
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.chart}
        role="img"
        aria-label="Andamento giornaliero di visite e visitatori unici"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className={styles.axis}>
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.day} onMouseEnter={() => setHover(i)}>
            <rect
              x={pad.l + step * i}
              y={pad.t}
              width={step}
              height={innerH}
              fill="transparent"
            />
            <rect
              x={x(i) - Math.min(step * 0.35, 14)}
              y={y(d.visits)}
              width={Math.min(step * 0.7, 28)}
              height={pad.t + innerH - y(d.visits)}
              rx={2}
              className={hover === i ? styles.barActive : styles.bar}
            />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className={styles.axis}>
                {fmtDay(d.day)}
              </text>
            )}
          </g>
        ))}
        <path d={line} className={styles.line} />
        {data.map((d, i) => (
          <circle
            key={d.day}
            cx={x(i)}
            cy={y(d.visitors)}
            r={hover === i ? 4 : data.length > 40 ? 0 : 2.5}
            className={styles.dot}
          />
        ))}
      </svg>
    </div>
  );
}

/** Horizontal ranked bars with value and share. */
export function BarList({ items, empty = 'Nessun dato' }: { items: Bucket[]; empty?: string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.barList}>
      {items.map((item) => (
        <li key={item.label} className={styles.barRow}>
          <span className={styles.barFill} style={{ width: `${(item.value / max) * 100}%` }} />
          <span className={styles.barLabel}>{item.label}</span>
          <span className={styles.barValue}>
            {item.value}
            <small>{Math.round((item.value / total) * 100)}%</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 24 columns showing at which hours visits happen. */
export function HourChart({ data }: { data: { hour: number; value: number }[] }) {
  const byHour = new Map(data.map((d) => [d.hour, d.value]));
  const values = Array.from({ length: 24 }, (_, h) => byHour.get(h) ?? 0);
  const max = Math.max(1, ...values);
  return (
    <div className={styles.hours} role="img" aria-label="Visite per ora del giorno">
      {values.map((v, h) => (
        <div key={h} className={styles.hourCol} title={`${h}:00 — ${v} visite`}>
          <span className={styles.hourBar} style={{ height: `${(v / max) * 100}%` }} />
          <span className={styles.hourLabel}>{h % 3 === 0 ? h : ''}</span>
        </div>
      ))}
    </div>
  );
}

/** Usage funnel from visit to completed tournament. */
export function Funnel({ steps }: { steps: Bucket[] }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className={styles.funnel}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        return (
          <li key={s.label} className={styles.funnelStep}>
            <div className={styles.funnelHead}>
              <span>{s.label}</span>
              <strong>{s.value}</strong>
            </div>
            <div className={styles.funnelTrack}>
              <span style={{ width: `${(s.value / max) * 100}%` }} />
            </div>
            {prev !== null && (
              <small className={styles.muted}>
                {prev ? Math.round((s.value / prev) * 100) : 0}% dal passo precedente
              </small>
            )}
          </li>
        );
      })}
    </ol>
  );
}
