// Usage dashboard — KPIs, trends, audience breakdowns and the access log.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccessRow, AnalyticsData } from './types';
import { BarList, Funnel, HourChart, TrendChart, fillDays } from './charts';
import styles from './Admin.module.css';

const RANGES = [
  { days: 1, label: '24 ore' },
  { days: 7, label: '7 giorni' },
  { days: 30, label: '30 giorni' },
  { days: 90, label: '90 giorni' },
  { days: 365, label: '1 anno' },
];

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function duration(row: AccessRow): string {
  if (!row.lastSeen) return '—';
  const ms = new Date(row.lastSeen).getTime() - new Date(row.at).getTime();
  if (ms < 60_000) return '< 1 min';
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      {hint && <span className={styles.kpiHint}>{hint}</span>}
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?days=${days}`, { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) {
        throw new Error('Sessione scaduta o permessi insufficienti: esci e accedi di nuovo.');
      }
      if (!res.ok) throw new Error(`Impossibile caricare i dati (errore ${res.status}).`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare i dati.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // Visits per visitor within the log, to flag repeat visitors.
  const visitsPerVisitor = useMemo(() => {
    const m = new Map<string, number>();
    data?.recent.forEach((r) => m.set(r.visitorId, (m.get(r.visitorId) ?? 0) + 1));
    return m;
  }, [data]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.recent;
    return data.recent.filter((r) =>
      [r.country, r.city, r.device, r.browser, r.os, r.referrer, r.visitorId.slice(0, 8)]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  const t = data?.totals;
  const trend = data ? fillDays(data.daily, Math.min(data.days, 90)) : [];
  const completion =
    t && t.tournamentsCreated ? Math.round((t.tournamentsCompleted / t.tournamentsCreated) * 100) : 0;

  return (
    <div className={styles.dashboard}>
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="Periodo">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              className={days === r.days ? styles.segActive : styles.seg}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button className={styles.ghostDark} type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Aggiornamento…' : 'Aggiorna'}
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {t && data && (
        <>
          <section className={styles.kpis} aria-label="Indicatori principali">
            <Kpi label="Accessi" value={t.visits} hint="caricamenti dell'app" />
            <Kpi label="Visitatori unici" value={t.visitors} hint={`${t.returningVisitors} di ritorno`} />
            <Kpi label="Sessioni" value={t.sessions} />
            <Kpi label="Tornei creati" value={t.tournamentsCreated} />
            <Kpi label="Tornei completati" value={t.tournamentsCompleted} hint={`${completion}% dei creati`} />
            <Kpi label="Richieste suggerimenti AI" value={t.aiSuggestions} />
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Andamento giornaliero</h2>
            <TrendChart data={trend} />
            {data.days > 90 && (
              <p className={styles.muted}>Il grafico mostra gli ultimi 90 giorni; i totali coprono l'intero periodo.</p>
            )}
          </section>

          <div className={styles.grid2}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Percorso d'uso</h2>
              <Funnel
                steps={[
                  { label: 'Sessioni', value: t.sessions },
                  { label: 'Torneo creato', value: t.tournamentsCreated },
                  { label: 'Torneo avviato', value: t.tournamentsStarted },
                  { label: 'Torneo completato', value: t.tournamentsCompleted },
                ]}
              />
            </section>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Orari degli accessi</h2>
              <HourChart data={data.hourly} />
              <p className={styles.muted}>Fuso orario: {data.timezone}</p>
              <h3 className={styles.subTitle}>Modalità dei tornei</h3>
              <BarList
                items={data.breakdowns.modes.map((m) => ({
                  ...m,
                  label: m.label === 'voteBased' ? 'A votazione' : m.label === 'classic' ? 'Classica' : m.label,
                }))}
              />
            </section>
          </div>

          <div className={styles.grid3}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Paesi</h2>
              <BarList items={data.breakdowns.countries} />
            </section>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Città</h2>
              <BarList items={data.breakdowns.cities} />
            </section>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Provenienza</h2>
              <BarList items={data.breakdowns.referrers} />
            </section>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Dispositivi</h2>
              <BarList items={data.breakdowns.devices} />
            </section>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Browser</h2>
              <BarList items={data.breakdowns.browsers} />
            </section>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Sistemi operativi</h2>
              <BarList items={data.breakdowns.systems} />
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Registro accessi</h2>
              <input
                type="search"
                className={styles.search}
                placeholder="Filtra per paese, città, browser…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filtra accessi"
              />
            </div>
            <p className={styles.muted}>
              Ultimi {data.recent.length} accessi del periodo. I visitatori sono anonimi e identificati da un codice casuale.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data e ora</th>
                    <th>Visitatore</th>
                    <th>Luogo</th>
                    <th>Dispositivo</th>
                    <th>Browser / OS</th>
                    <th>Provenienza</th>
                    <th className={styles.num}>Azioni</th>
                    <th className={styles.num}>Durata</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const repeat = (visitsPerVisitor.get(r.visitorId) ?? 0) > 1;
                    return (
                      <tr key={r.id}>
                        <td>{fmtDateTime(r.at)}</td>
                        <td>
                          <code>#{r.visitorId.slice(0, 6)}</code>
                          {repeat && <span className={styles.badge}>ricorrente</span>}
                        </td>
                        <td>{[r.city, r.country].filter(Boolean).join(', ') || '—'}</td>
                        <td>{r.device ?? '—'}</td>
                        <td>
                          {r.browser ?? '—'} · {r.os ?? '—'}
                        </td>
                        <td>{r.referrer ?? 'Diretto'}</td>
                        <td className={styles.num}>{r.events ?? 1}</td>
                        <td className={styles.num}>{duration(r)}</td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr>
                      <td colSpan={8} className={styles.muted}>
                        Nessun accesso registrato.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
