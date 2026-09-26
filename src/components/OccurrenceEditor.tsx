'use client';

import { OccurrenceRow, EMPTY_OCCURRENCE_ROW } from '@/lib/types';

function Cell({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  span2,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  span2?: boolean;
}) {
  return (
    <div className={`occ-cell${span2 ? ' occ-cell-span2' : ''}`}>
      <label>{label}</label>
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function OccurrenceEditor({
  rows,
  onChange,
}: {
  rows: OccurrenceRow[];
  onChange: (rows: OccurrenceRow[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<OccurrenceRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => onChange([...rows, { ...EMPTY_OCCURRENCE_ROW }]);
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="occ-editor">
      {rows.length === 0 && <div className="occ-empty">No occurrence periods added yet</div>}

      {rows.map((row, i) => (
        <div className="occ-card" key={i}>
          <div className="occ-card-header">
            <span className="occ-card-title">Occurrence {i + 1}</span>
            <button type="button" className="btn-remove" onClick={() => removeRow(i)}>
              Remove
            </button>
          </div>

          <div className="occ-group">
            <div className="occ-cells">
              <Cell label="Date From" type="date" value={row.dateFrom} onChange={(v) => updateRow(i, { dateFrom: v })} />
              <Cell label="Time From" type="time" value={row.timeFrom} onChange={(v) => updateRow(i, { timeFrom: v })} />
              <Cell label="Date To" type="date" value={row.dateTo} onChange={(v) => updateRow(i, { dateTo: v })} />
              <Cell label="Time To" type="time" value={row.timeTo} onChange={(v) => updateRow(i, { timeTo: v })} />
            </div>
          </div>

          <div className="occ-group">
            <div className="occ-cells">
              <Cell
                label="Direction from PS"
                placeholder="e.g. SOUTH-EAST"
                value={row.directionFromPs}
                onChange={(v) => updateRow(i, { directionFromPs: v })}
              />
              <Cell
                label="Distance from PS"
                placeholder="e.g. 0.5 KM"
                value={row.distanceFromPs}
                onChange={(v) => updateRow(i, { distanceFromPs: v })}
              />
              <Cell label="Beat No" value={row.beatNo} onChange={(v) => updateRow(i, { beatNo: v })} />
              <Cell
                label="Address"
                placeholder="Location / Address"
                value={row.address}
                onChange={(v) => updateRow(i, { address: v })}
                span2
              />
              <Cell
                label="Coordinates"
                placeholder="lat, long"
                value={row.coordinates}
                onChange={(v) => updateRow(i, { coordinates: v })}
                span2
              />
            </div>
          </div>

          <details className="collapsible occ-outside">
            <summary>
              Outside limit of this Police Station? <span className="mal">അധികാരപരിധിക്ക് പുറത്താണെങ്കിൽ</span>
            </summary>
            <div className="occ-cells">
              <Cell label="Name of P.S" value={row.outPs} onChange={(v) => updateRow(i, { outPs: v })} />
              <Cell label="District" value={row.outDistrict} onChange={(v) => updateRow(i, { outDistrict: v })} />
              <Cell label="State" value={row.outState} onChange={(v) => updateRow(i, { outState: v })} />
            </div>
          </details>
        </div>
      ))}

      <button type="button" className="btn-add" onClick={addRow}>
        + Add Occurrence
      </button>
    </div>
  );
}
