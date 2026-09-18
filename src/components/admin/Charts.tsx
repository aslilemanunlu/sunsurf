/**
 * Small hand-drawn SVG charts.
 *
 * A charting library would be a megabyte for four bar charts, and the bundle is
 * already large. These take numbers and draw rectangles; colours come from the
 * CSS variables so they follow the theme like everything else.
 */

export type Slice = { label: string; value: number; tone?: string };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const head = v / pow;
  const step = head <= 1 ? 1 : head <= 2 ? 2 : head <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Horizontal bars, one row per label. Reads well when the labels are names of
 * unpredictable length, which is exactly the instructor case.
 */
export function BarRows({
  data,
  suffix = '',
  empty,
}: {
  data: Slice[];
  suffix?: string;
  empty: string;
}) {
  if (data.length === 0) return <p className="chart-empty">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <ul className="barrows">
      {data.map((d) => (
        <li key={d.label} className="barrow">
          <span className="barrow-label" title={d.label}>
            {d.label}
          </span>
          <span className="barrow-track">
            <span
              className={`barrow-fill${d.tone ? ` barrow-fill--${d.tone}` : ''}`}
              style={{ width: max > 0 ? `${Math.max(2, (d.value / max) * 100)}%` : '2px' }}
            />
          </span>
          <span className="barrow-value">
            {d.value}
            {suffix}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Vertical columns over time. Every bucket is drawn even when it is empty —
 * a gap in the middle of a season is information, and dropping the zero days
 * would quietly redraw the shape of the month.
 */
export function Columns({
  data,
  suffix = '',
  empty,
}: {
  data: Slice[];
  suffix?: string;
  empty: string;
}) {
  if (data.length === 0) return <p className="chart-empty">{empty}</p>;
  const top = niceMax(Math.max(...data.map((d) => d.value), 0));

  // Only the ends and the middle are labelled. Labelling every column collides
  // at any width a phone has, and a label that has to be read sideways is worse
  // than none: the exact value is on the column itself as a tooltip.
  const ends =
    data.length < 3
      ? data.map((d) => d.label)
      : [data[0].label, data[Math.floor(data.length / 2)].label, data[data.length - 1].label];

  return (
    <div className="columns">
      <div className="columns-axis" aria-hidden="true">
        <span>
          {top}
          {suffix}
        </span>
        <span>0</span>
      </div>
      <div className="columns-body">
        <ul className="columns-plot">
          {data.map((d) => (
            <li key={`${d.label}-${d.value}`} className="column">
              <span
                className={`column-fill${d.tone ? ` column-fill--${d.tone}` : ''}`}
                style={{ height: `${(d.value / top) * 100}%` }}
                title={`${d.label}: ${d.value}${suffix}`}
              />
            </li>
          ))}
        </ul>
        <div className="columns-foot" aria-hidden="true">
          {ends.map((label, i) => (
            <span key={`${label}-${i}`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A ring with the total in the middle, and the parts around it.
 *
 * Drawn with one circle per slice and a dash offset rather than arc paths: the
 * maths is a circumference and an offset, and there is no path string to get
 * subtly wrong. The hole carries the total, which is the number people are
 * usually after anyway.
 */
export function Donut({
  data,
  total,
  unit,
  empty,
}: {
  data: Slice[];
  /** What the number in the hole counts, when it is not the sum of the slices. */
  total?: number;
  unit: string;
  empty: string;
}) {
  const sum = data.reduce((s, d) => s + d.value, 0);
  if (sum === 0) return <p className="chart-empty">{empty}</p>;

  const r = 56;
  const c = 2 * Math.PI * r;
  let done = 0;

  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" className="donut-svg" role="img" aria-label={empty}>
        <circle className="donut-track" cx="70" cy="70" r={r} />
        {data
          .filter((d) => d.value > 0)
          .map((d) => {
            const length = (d.value / sum) * c;
            const offset = done;
            done += length;
            return (
              <circle
                key={d.label}
                className={`donut-arc${d.tone ? ` donut-arc--${d.tone}` : ''}`}
                cx="70"
                cy="70"
                r={r}
                strokeDasharray={`${length} ${c - length}`}
                strokeDashoffset={-offset}
              />
            );
          })}
        <text className="donut-total" x="70" y="68">
          {(total ?? sum).toLocaleString()}
        </text>
        <text className="donut-unit" x="70" y="86">
          {unit}
        </text>
      </svg>

      <ul className="split-legend donut-legend">
        {data.map((d) => (
          <li key={d.label}>
            <span className={`dot${d.tone ? ` dot--${d.tone}` : ''}`} aria-hidden="true" />
            {d.label}
            <span className="split-pct">{Math.round((d.value / sum) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One bar split into its parts, with a legend. Cheaper to read than a pie. */
export function Split({ data, empty }: { data: Slice[]; empty: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="chart-empty">{empty}</p>;

  return (
    <div className="split">
      <div className="split-bar">
        {data
          .filter((d) => d.value > 0)
          .map((d) => (
            <span
              key={d.label}
              className={`split-part${d.tone ? ` split-part--${d.tone}` : ''}`}
              style={{ width: `${(d.value / total) * 100}%` }}
              title={`${d.label}: ${d.value}`}
            />
          ))}
      </div>
      <ul className="split-legend">
        {data.map((d) => (
          <li key={d.label}>
            <span className={`dot${d.tone ? ` dot--${d.tone}` : ''}`} aria-hidden="true" />
            {d.label}
            <strong>{d.value}</strong>
            <span className="split-pct">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
