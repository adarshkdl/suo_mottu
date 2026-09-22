'use client';

import { VictimRow, EMPTY_VICTIM_ROW } from '@/lib/types';
import Cell from './PersonCell';

export default function VictimEditor({
  rows,
  onChange,
}: {
  rows: VictimRow[];
  onChange: (rows: VictimRow[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<VictimRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => onChange([...rows, { ...EMPTY_VICTIM_ROW }]);
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  const setVictimType = (index: number, victimType: VictimRow['victimType']) => {
    if (victimType === 'unknown') {
      updateRow(index, { victimType, name: 'Unknown' });
    } else {
      updateRow(index, { victimType, name: rows[index].name === 'Unknown' ? '' : rows[index].name });
    }
  };

  return (
    <div className="occ-editor">
      {rows.length === 0 && <div className="occ-empty">No victims added yet</div>}

      {rows.map((row, i) => (
        <div className="occ-card" key={i}>
          <div className="occ-card-header">
            <div className="occ-card-header-left">
              <span className="occ-card-title">Victim {i + 1}{row.victimType === 'known' && row.name ? ` — ${row.name}` : ''}</span>
              <div className="occ-type-toggle">
                <button
                  type="button"
                  className={`occ-toggle-btn${row.victimType === 'known' ? ' occ-toggle-btn--active' : ''}`}
                  onClick={() => setVictimType(i, 'known')}
                >
                  Known
                </button>
                <button
                  type="button"
                  className={`occ-toggle-btn${row.victimType === 'unknown' ? ' occ-toggle-btn--active' : ''}`}
                  onClick={() => setVictimType(i, 'unknown')}
                >
                  Unknown
                </button>
              </div>
            </div>
            <button type="button" className="btn-remove" onClick={() => removeRow(i)}>
              Remove
            </button>
          </div>

          {row.victimType === 'unknown' ? (
            <div className="occ-group">
              <div className="occ-cells">
                <Cell label="Name" value={row.name} onChange={() => {}} readOnly />
              </div>
            </div>
          ) : (
            <>
              <div className="occ-group">
                <div className="occ-cells">
                  <Cell label="Name" value={row.name} onChange={(v) => updateRow(i, { name: v })} />
                  <Cell label="Alias" value={row.alias} onChange={(v) => updateRow(i, { alias: v })} />
                  <Cell label="Age" type="number" value={row.age} onChange={(v) => updateRow(i, { age: v })} />
                  <Cell label="Gender" required value={row.gender} onChange={(v) => updateRow(i, { gender: v })} />
                  <Cell label="Nationality" value={row.nationality} onChange={(v) => updateRow(i, { nationality: v })} />
                  <Cell label="Father's Name" value={row.fatherName} onChange={(v) => updateRow(i, { fatherName: v })} />
                  <Cell label="Mobile" value={row.tel} onChange={(v) => updateRow(i, { tel: v })} />
                </div>
              </div>

              <div className="occ-group">
                <div className="occ-address-grid">
                  <div className="occ-address-block">
                    <span className="occ-address-badge occ-address-badge--present">Present Address</span>
                    <textarea
                      rows={2}
                      placeholder="Present address"
                      value={row.presentAddress}
                      onChange={(e) => updateRow(i, { presentAddress: e.target.value })}
                    />
                  </div>
                  <div className="occ-address-block">
                    <span className="occ-address-badge occ-address-badge--permanent">Permanent Address</span>
                    <textarea
                      rows={2}
                      placeholder="Permanent address"
                      value={row.permanentAddress}
                      onChange={(e) => updateRow(i, { permanentAddress: e.target.value })}
                    />
                    <label className="occ-address-same">
                      <input
                        type="checkbox"
                        checked={row.permanentAddress === row.presentAddress && row.presentAddress.trim().length > 0}
                        onChange={(e) =>
                          updateRow(i, { permanentAddress: e.target.checked ? row.presentAddress : '' })
                        }
                      />
                      Same as present address
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ))}

      <button type="button" className="btn-add" onClick={addRow}>
        + Add Victim
      </button>
    </div>
  );
}
